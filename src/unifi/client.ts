import axios, { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import https from 'https';
import { 
  UniFiConfig, 
  SystemInfo, 
  APIResponse, 
  AuthenticationHeaders
} from './types.js';
import { 
  UniFiMCPError, 
  ConnectionError, 
  AuthenticationError, 
  APIKeyError,
  RateLimitError,
  ErrorFactory,
  ErrorRecovery
} from '../utils/errors.js';
import { ErrorCode } from '../server/types.js';
import { createAPILogger } from '../utils/logger.js';
import { UNIFI_ENDPOINTS } from '../config/constants.js';

// Extend Axios config to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      requestId: string;
      startTime: number;
    };
  }
}

/**
 * UniFi Network API Client
 * 
 * Comprehensive client for interacting with UniFi Network Application API.
 * Handles authentication, connection management, error handling, and retry logic.
 */

export interface UniFiClientOptions extends UniFiConfig {
  useHTTPS?: boolean;
  enableRetry?: boolean;
  retryConfig?: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit: number;
  };
}

export interface ConnectionInfo {
  isConnected: boolean;
  isAuthenticated: boolean;
  lastConnected?: Date;
  lastError?: string;
  gatewayInfo?: {
    ip: string;
    version: string;
    model: string;
    siteId: string;
  };
  connectionAttempts: number;
  retryCount: number;
}

export class UniFiClient {
  private httpClient: AxiosInstance;
  private config: UniFiClientOptions;
  private connectionInfo: ConnectionInfo;
  private logger = createAPILogger();
  private requestQueue: Array<() => Promise<any>> = [];
  private rateLimitTokens: number;
  private lastRateLimitReset: Date;

  constructor(config: UniFiClientOptions) {
    this.config = config;
    this.connectionInfo = {
      isConnected: false,
      isAuthenticated: false,
      connectionAttempts: 0,
      retryCount: 0
    };

    // Initialize rate limiting
    this.rateLimitTokens = config.rateLimit?.requestsPerMinute || 60;
    this.lastRateLimitReset = new Date();

    // Create HTTP client with custom configuration
    this.httpClient = this.createHttpClient();
  }

  // ================================
  // Connection Management
  // ================================

  /**
   * Establish connection to UniFi controller
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to UniFi controller', {
        gatewayIp: this.config.gatewayIp,
        siteId: this.config.siteId
      });

      this.connectionInfo.connectionAttempts++;

      // Test basic connectivity
      await this.testConnection();

      // Authenticate with API key
      await this.authenticate();

      // Verify authentication by getting system info
      const systemInfo = await this.getSystemInfo();

      this.connectionInfo = {
        isConnected: true,
        isAuthenticated: true,
        lastConnected: new Date(),
        gatewayInfo: {
          ip: this.config.gatewayIp,
          version: systemInfo.version,
          model: systemInfo.hardwareModel,
          siteId: this.config.siteId
        },
        connectionAttempts: this.connectionInfo.connectionAttempts,
        retryCount: this.connectionInfo.retryCount
      };

      this.logger.connection('connected', {
        version: systemInfo.version,
        model: systemInfo.hardwareModel,
        attempts: this.connectionInfo.connectionAttempts
      });

    } catch (error) {
      this.connectionInfo.isConnected = false;
      this.connectionInfo.isAuthenticated = false;
      this.connectionInfo.lastError = (error as Error).message;

      this.logger.connection('failed', {
        error: (error as Error).message,
        attempts: this.connectionInfo.connectionAttempts
      });

      throw error;
    }
  }

  /**
   * Disconnect from UniFi controller
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connectionInfo.isConnected) {
        // Perform any cleanup if needed
        this.logger.connection('disconnected');
      }

      this.connectionInfo.isConnected = false;
      this.connectionInfo.isAuthenticated = false;
      this.requestQueue = [];

    } catch (error) {
      this.logger.error('Error during disconnect', error);
      throw ErrorFactory.fromNetworkError(error);
    }
  }

  /**
   * Test basic connectivity to controller
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/status', {
        timeout: 5000,
        validateStatus: () => true // Accept any status for connectivity test
      });

      return response.status < 500;
    } catch (error) {
      if ((error as any).code === 'ECONNREFUSED') {
        throw new ConnectionError('UniFi controller is not reachable');
      }
      throw ErrorFactory.fromNetworkError(error);
    }
  }

  /**
   * Authenticate with API key
   */
  private async authenticate(): Promise<void> {
    try {
      // For API key authentication, we don't need a separate login endpoint
      // The authentication is handled via headers on each request
      
      // Test authentication by making a simple API call
      const response = await this.httpClient.get(
        this.buildEndpoint(UNIFI_ENDPOINTS.SYSTEM_INFO),
        {
          headers: this.getAuthHeaders()
        }
      );

      if (response.status === 401) {
        throw new APIKeyError('Invalid API key or insufficient permissions');
      }

      if (response.status !== 200) {
        throw new AuthenticationError(`Authentication failed with status: ${response.status}`);
      }

      this.logger.info('Authentication successful');

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new APIKeyError('Invalid API key or insufficient permissions');
        }
        throw ErrorFactory.fromHttpError(error);
      }
      throw error;
    }
  }

  // ================================
  // HTTP Client Configuration
  // ================================

  /**
   * Create configured HTTP client
   */
  private createHttpClient(): AxiosInstance {
    const baseURL = this.getBaseURL();
    
    const client = axios.create({
      baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: this.config.verifySSL
      })
    });

    // Request interceptor for rate limiting and logging
    client.interceptors.request.use(
      async (config) => {
        await this.enforceRateLimit();
        
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        config.metadata = { requestId, startTime: Date.now() };
        
        this.logger.apiRequest(
          config.method?.toUpperCase() || 'GET',
          config.url || '',
          undefined,
          undefined
        );

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config.metadata?.startTime || 0);
        const size = JSON.stringify(response.data).length;

        this.logger.apiResponse(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          duration,
          size
        );

        return response;
      },
      (error) => {
        const duration = Date.now() - (error.config?.metadata?.startTime || 0);
        
        this.logger.apiResponse(
          error.config?.method?.toUpperCase() || 'GET',
          error.config?.url || '',
          error.response?.status || 0,
          duration
        );

        // Handle specific error cases
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          return Promise.reject(new RateLimitError(
            'API rate limit exceeded',
            retryAfter ? parseInt(retryAfter, 10) : undefined
          ));
        }

        return Promise.reject(ErrorFactory.fromHttpError(error));
      }
    );

    return client;
  }

  /**
   * Get base URL for API requests
   */
  private getBaseURL(): string {
    const protocol = this.config.useHTTPS !== false ? 'https' : 'http';
    const port = this.config.port ? `:${this.config.port}` : '';
    return `${protocol}://${this.config.gatewayIp}${port}`;
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): AuthenticationHeaders {
    return {
      'X-API-KEY': this.config.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Build complete endpoint URL
   */
  private buildEndpoint(endpoint: string): string {
    return endpoint.replace('{site}', this.config.siteId);
  }

  // ================================
  // Rate Limiting
  // ================================

  /**
   * Enforce rate limiting
   */
  private async enforceRateLimit(): Promise<void> {
    const now = new Date();
    const timeSinceReset = now.getTime() - this.lastRateLimitReset.getTime();

    // Reset tokens every minute
    if (timeSinceReset >= 60000) {
      this.rateLimitTokens = this.config.rateLimit?.requestsPerMinute || 60;
      this.lastRateLimitReset = now;
    }

    // Check if we have tokens available
    if (this.rateLimitTokens <= 0) {
      const waitTime = 60000 - timeSinceReset;
      this.logger.warn('Rate limit exceeded, waiting', { waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimitTokens = this.config.rateLimit?.requestsPerMinute || 60;
      this.lastRateLimitReset = new Date();
    }

    this.rateLimitTokens--;
  }

  // ================================
  // API Request Methods
  // ================================

  /**
   * Make authenticated GET request
   */
  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<APIResponse<T>> {
    await this.ensureAuthenticated();

    const response = await this.makeRequest<any>('GET', endpoint, undefined, params);
    
    // Handle different response formats
    if (response.data && response.data.meta && response.data.data) {
      // Traditional UniFi Network Application API format
      return response.data as APIResponse<T>;
    } else {
      // Direct response format (UDR proxy endpoints)
      return {
        meta: { msg: 'success', rc: 'ok' },
        data: Array.isArray(response.data) ? response.data : [response.data]
      } as APIResponse<T>;
    }
  }

  /**
   * Make authenticated POST request
   */
  async post<T = any>(endpoint: string, data?: any, params?: Record<string, any>): Promise<APIResponse<T>> {
    await this.ensureAuthenticated();

    const response = await this.makeRequest<any>('POST', endpoint, data, params);
    
    // Handle different response formats
    if (response.data && response.data.meta && response.data.data) {
      // Traditional UniFi Network Application API format
      return response.data as APIResponse<T>;
    } else {
      // Direct response format (UDR proxy endpoints)
      return {
        meta: { msg: 'success', rc: 'ok' },
        data: Array.isArray(response.data) ? response.data : [response.data]
      } as APIResponse<T>;
    }
  }

  /**
   * Make authenticated PUT request
   */
  async put<T = any>(endpoint: string, data?: any, params?: Record<string, any>): Promise<APIResponse<T>> {
    await this.ensureAuthenticated();

    const response = await this.makeRequest<any>('PUT', endpoint, data, params);
    
    // Handle different response formats
    if (response.data && response.data.meta && response.data.data) {
      // Traditional UniFi Network Application API format
      return response.data as APIResponse<T>;
    } else {
      // Direct response format (UDR proxy endpoints)
      return {
        meta: { msg: 'success', rc: 'ok' },
        data: Array.isArray(response.data) ? response.data : [response.data]
      } as APIResponse<T>;
    }
  }

  /**
   * Make authenticated DELETE request
   */
  async delete<T = any>(endpoint: string, params?: Record<string, any>): Promise<APIResponse<T>> {
    await this.ensureAuthenticated();

    const response = await this.makeRequest<any>('DELETE', endpoint, undefined, params);
    
    // Handle different response formats
    if (response.data && response.data.meta && response.data.data) {
      // Traditional UniFi Network Application API format
      return response.data as APIResponse<T>;
    } else {
      // Direct response format (UDR proxy endpoints)
      return {
        meta: { msg: 'success', rc: 'ok' },
        data: Array.isArray(response.data) ? response.data : [response.data]
      } as APIResponse<T>;
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<AxiosResponse<T>> {
    const config: AxiosRequestConfig = {
      method: method as any,
      url: this.buildEndpoint(endpoint),
      headers: this.getAuthHeaders(),
      params,
      data
    };

    if (this.config.enableRetry !== false) {
      return ErrorRecovery.withRetry(
        () => this.httpClient.request<T>(config),
        this.config.retryConfig
      );
    }

    return this.httpClient.request<T>(config);
  }

  /**
   * Ensure we have a valid authenticated connection
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.connectionInfo.isConnected || !this.connectionInfo.isAuthenticated) {
      this.logger.info('Re-establishing connection');
      await this.connect();
    }
  }

  // ================================
  // System Information
  // ================================

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<SystemInfo> {
    try {
      const response = await this.httpClient.get(
        this.buildEndpoint(UNIFI_ENDPOINTS.SYSTEM_INFO),
        {
          headers: this.getAuthHeaders()
        }
      );

      // Handle different response formats
      // UDR devices return direct system info without APIResponse wrapper
      if (response.data && typeof response.data === 'object' && !response.data.meta) {
        // Direct system info format (UDR)
        const systemData = response.data;
        return {
          version: systemData.name || 'Unknown',
          buildNumber: '0',
          buildTimestamp: Date.now(),
          hostname: systemData.name || 'UniFi Device',
          timezone: 'UTC',
          uptime: 0,
          firewallMode: 'legacy',
          zbfSupported: false,
          hardwareModel: systemData.hardware?.shortname || 'Unknown',
          hardwareRevision: '1.0',
          ubntNetworkApplicationVersion: '1.0.0'
        } as SystemInfo;
      }

      // Traditional UniFi Network Application API format
      const apiResponse = response.data as APIResponse<any>;
      if (apiResponse.meta.rc !== 'ok' || !apiResponse.data.length) {
        throw new UniFiMCPError('Failed to retrieve system information', ErrorCode.SYSTEM_INFO_ERROR);
      }

      // Map API response fields to SystemInfo interface
      const rawData = apiResponse.data[0];
      return {
        version: rawData.version || 'Unknown',
        buildNumber: rawData.build || '0',
        buildTimestamp: Date.now(),
        hostname: rawData.hostname || rawData.name || 'UniFi Device',
        timezone: rawData.timezone || 'UTC',
        uptime: rawData.uptime || 0,
        firewallMode: 'zbf',
        zbfSupported: true,
        hardwareModel: rawData.ubnt_device_type || rawData.hardware_model || 'Unknown',
        hardwareRevision: rawData.hardware_revision || '1.0',
        ubntNetworkApplicationVersion: rawData.version || '1.0.0'
      } as SystemInfo;
    } catch (error) {
      if (error instanceof UniFiMCPError) {
        throw error;
      }
      throw ErrorFactory.fromHttpError(error);
    }
  }

  // ================================
  // Connection Status and Health
  // ================================

  /**
   * Get current connection status
   */
  getConnectionInfo(): ConnectionInfo {
    return { ...this.connectionInfo };
  }

  /**
   * Check if client is connected and authenticated
   */
  isConnected(): boolean {
    return this.connectionInfo.isConnected && this.connectionInfo.isAuthenticated;
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      connected: boolean;
      authenticated: boolean;
      lastConnected?: Date;
      responseTime?: number;
      version?: string;
    };
  }> {
    try {
      const startTime = Date.now();
      
      if (!this.connectionInfo.isConnected) {
        await this.connect();
      }

      const systemInfo = await this.getSystemInfo();
      const responseTime = Date.now() - startTime;

      const healthyDetails: {
        connected: boolean;
        authenticated: boolean;
        lastConnected?: Date;
        responseTime?: number;
        version?: string;
      } = {
        connected: true,
        authenticated: true,
        responseTime,
        version: systemInfo.version
      };

      if (this.connectionInfo.lastConnected) {
        healthyDetails.lastConnected = this.connectionInfo.lastConnected;
      }

      return {
        status: 'healthy',
        details: healthyDetails
      };
    } catch (error) {
      this.logger.error('Health check failed', error);
      
      const unhealthyDetails: {
        connected: boolean;
        authenticated: boolean;
        lastConnected?: Date;
      } = {
        connected: false,
        authenticated: false
      };

      if (this.connectionInfo.lastConnected) {
        unhealthyDetails.lastConnected = this.connectionInfo.lastConnected;
      }

      return {
        status: 'unhealthy',
        details: unhealthyDetails
      };
    }
  }

  /**
   * Get client statistics
   */
  getStatistics(): {
    connectionAttempts: number;
    retryCount: number;
    lastConnected?: Date;
    rateLimitTokens: number;
    requestQueueSize: number;
  } {
    const stats = {
      connectionAttempts: this.connectionInfo.connectionAttempts,
      retryCount: this.connectionInfo.retryCount,
      rateLimitTokens: this.rateLimitTokens,
      requestQueueSize: this.requestQueue.length
    } as {
      connectionAttempts: number;
      retryCount: number;
      lastConnected?: Date;
      rateLimitTokens: number;
      requestQueueSize: number;
    };

    if (this.connectionInfo.lastConnected) {
      stats.lastConnected = this.connectionInfo.lastConnected;
    }

    return stats;
  }

  // ================================
  // Configuration Management
  // ================================

  /**
   * Update client configuration
   */
  updateConfig(newConfig: Partial<UniFiClientOptions>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Recreate HTTP client if connection-related config changed
    if (newConfig.gatewayIp || newConfig.port || newConfig.timeout || newConfig.verifySSL) {
      this.httpClient = this.createHttpClient();
      this.connectionInfo.isConnected = false;
      this.connectionInfo.isAuthenticated = false;
    }

    this.logger.info('Client configuration updated', {
      changes: Object.keys(newConfig)
    });
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<UniFiClientOptions, 'apiKey'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const { apiKey, ...config } = this.config;
    return config;
  }
}

// ================================
// Export Default Client Factory
// ================================

export function createUniFiClient(config: UniFiClientOptions): UniFiClient {
  return new UniFiClient(config);
}