import { UniFiClient } from './client.js';
import { 
  FeatureCapabilities, 
  ToolAvailability,
  ErrorCode
} from '../server/types.js';
import { SystemInfo } from './types.js';
import { 
  FeatureNotSupportedError, 
  HardwareIncompatibleError,
  UniFiMCPError 
} from '../utils/errors.js';
import { createComponentLogger } from '../utils/logger.js';
import { 
  VERSION_REQUIREMENTS, 
  FEATURE_COMPATIBILITY, 
  DEVICE_MODELS 
} from '../config/constants.js';

/**
 * Version Detection and Feature Capability Management
 * 
 * Automatically detects UniFi controller version and hardware capabilities
 * to determine available features and tool compatibility.
 */

export class VersionDetector {
  private client: UniFiClient;
  private logger = createComponentLogger('version-detector');
  private cachedCapabilities: FeatureCapabilities | null = null;
  private cacheTimestamp: Date | null = null;
  private readonly cacheValidityMinutes = 60; // Cache for 1 hour

  constructor(client: UniFiClient) {
    this.client = client;
  }

  // ================================
  // Version Detection
  // ================================

  /**
   * Detect UniFi controller version and capabilities
   */
  async detectCapabilities(): Promise<FeatureCapabilities> {
    // Return cached result if still valid
    if (this.isCacheValid()) {
      this.logger.debug('Returning cached capabilities');
      return this.cachedCapabilities!;
    }

    try {
      this.logger.info('Detecting UniFi capabilities');

      const systemInfo = await this.client.getSystemInfo();
      const capabilities = await this.analyzeCapabilities(systemInfo);

      // Cache the results
      this.cachedCapabilities = capabilities;
      this.cacheTimestamp = new Date();

      this.logger.info('Capabilities detected successfully', {
        version: capabilities.version,
        supportsZBF: capabilities.supportsZBF,
        hardwareModel: capabilities.hardwareCapabilities.model
      });

      return capabilities;

    } catch (error) {
      this.logger.error('Failed to detect capabilities', error);
      throw new UniFiMCPError(
        'Unable to detect UniFi capabilities',
        ErrorCode.CAPABILITY_DETECTION_FAILED,
        500,
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Analyze system information to determine capabilities
   */
  private async analyzeCapabilities(systemInfo: SystemInfo): Promise<FeatureCapabilities> {
    const version = this.normalizeVersion(systemInfo.version);
    const hardwareModel = systemInfo.hardwareModel;

    // Detect ZBF support
    const supportsZBF = this.checkZBFSupport(version, hardwareModel);
    
    // Detect legacy firewall support
    const supportsLegacyFirewall = this.checkLegacyFirewallSupport(version);

    // Get supported and deprecated endpoints
    const endpoints = this.getEndpointAvailability(version, supportsZBF);

    // Analyze hardware capabilities
    const hardwareCapabilities = this.analyzeHardwareCapabilities(hardwareModel, version);

    return {
      version,
      supportsZBF,
      supportsLegacyFirewall,
      supportedEndpoints: endpoints.supported,
      deprecatedEndpoints: endpoints.deprecated,
      hardwareCapabilities
    };
  }

  /**
   * Check if Zone-Based Firewall is supported
   */
  private checkZBFSupport(version: string, hardwareModel: string): boolean {
    // Check version requirement
    if (!this.isVersionAtLeast(version, VERSION_REQUIREMENTS.ZBF_MINIMUM)) {
      return false;
    }

    // Check hardware compatibility
    const zbfCompatibility = FEATURE_COMPATIBILITY.ZONE_BASED_FIREWALL;
    if (zbfCompatibility.requiredHardware.includes('all' as any)) {
      return true;
    }

    return zbfCompatibility.requiredHardware.some(model => 
      hardwareModel.includes(model) || this.isHardwareModelCompatible(hardwareModel, model)
    );
  }

  /**
   * Check if legacy firewall is supported
   */
  private checkLegacyFirewallSupport(version: string): boolean {
    const legacyCompatibility = FEATURE_COMPATIBILITY.LEGACY_FIREWALL;
    
    // Legacy firewall is deprecated but still functional in 9.0+
    if (legacyCompatibility.deprecatedIn && 
        this.isVersionAtLeast(version, legacyCompatibility.deprecatedIn)) {
      this.logger.warn('Legacy firewall is deprecated in this version', {
        version,
        deprecatedIn: legacyCompatibility.deprecatedIn
      });
      return true; // Still supported but deprecated
    }

    return this.isVersionAtLeast(version, legacyCompatibility.minimumVersion);
  }

  /**
   * Get endpoint availability based on version
   */
  private getEndpointAvailability(version: string, supportsZBF: boolean): {
    supported: string[];
    deprecated: string[];
  } {
    const supported: string[] = [
      '/api/system',
      '/api/s/{site}/stat/device',
      '/api/s/{site}/stat/sta',
      '/api/s/{site}/rest/networkconf',
      '/api/s/{site}/stat/sites',
      '/api/s/{site}/stat/event'
    ];

    const deprecated: string[] = [];

    // Add ZBF endpoints if supported
    if (supportsZBF) {
      supported.push(
        '/api/s/{site}/rest/firewallzone',
        '/api/s/{site}/rest/firewallzonepolicy',
        '/api/s/{site}/rest/simpleappblock'
      );
    }

    // Add legacy firewall endpoints (with deprecation notice for 9.0+)
    if (this.checkLegacyFirewallSupport(version)) {
      const legacyEndpoints = [
        '/api/s/{site}/rest/firewallrule',
        '/api/s/{site}/rest/firewallgroup'
      ];

      if (this.isVersionAtLeast(version, VERSION_REQUIREMENTS.LEGACY_FIREWALL_DEPRECATED)) {
        deprecated.push(...legacyEndpoints);
      } else {
        supported.push(...legacyEndpoints);
      }
    }

    // Add advanced endpoints based on version
    if (this.isVersionAtLeast(version, VERSION_REQUIREMENTS.ADVANCED_STATS_MINIMUM)) {
      supported.push(
        '/api/s/{site}/stat/device-stats',
        '/api/s/{site}/stat/user-stats',
        '/api/s/{site}/stat/health'
      );
    }

    return { supported, deprecated };
  }

  /**
   * Analyze hardware-specific capabilities
   */
  private analyzeHardwareCapabilities(hardwareModel: string, version: string): FeatureCapabilities['hardwareCapabilities'] {
    const baseCapabilities = {
      model: hardwareModel,
      supportsAdvancedFirewall: false,
      maxFirewallRules: 100,
      maxZones: 10
    };

    // Enhanced capabilities for newer hardware
    if (this.isAdvancedGateway(hardwareModel)) {
      baseCapabilities.supportsAdvancedFirewall = true;
      baseCapabilities.maxFirewallRules = 500;
      baseCapabilities.maxZones = 50;
    } else if (this.isProGateway(hardwareModel)) {
      baseCapabilities.supportsAdvancedFirewall = true;
      baseCapabilities.maxFirewallRules = 300;
      baseCapabilities.maxZones = 30;
    }

    // Adjust limits based on version
    if (this.isVersionAtLeast(version, '9.0.0')) {
      baseCapabilities.maxFirewallRules *= 2; // ZBF allows more rules
    }

    return baseCapabilities;
  }

  // ================================
  // Tool Availability Analysis
  // ================================

  /**
   * Get tool availability based on current capabilities
   */
  async getToolAvailability(): Promise<ToolAvailability> {
    const capabilities = await this.detectCapabilities();
    const availability: ToolAvailability = {};

    // Connection tools (always available)
    availability['unifi_connect'] = { available: true };
    availability['unifi_test_connection'] = { available: true };
    availability['unifi_get_system_info'] = { available: true };
    availability['unifi_disconnect'] = { available: true };

    // Device management tools (always available)
    availability['unifi_get_devices'] = { available: true };
    availability['unifi_get_device_details'] = { available: true };
    availability['unifi_restart_device'] = { available: true };

    // Client management tools (always available)
    availability['unifi_get_clients'] = { available: true };
    availability['unifi_get_client_details'] = { available: true };
    availability['unifi_block_client'] = { available: true };
    availability['unifi_unblock_client'] = { available: true };

    // Legacy firewall tools
    if (capabilities.supportsLegacyFirewall) {
      availability['unifi_get_firewall_rules'] = { 
        available: true,
        ...(capabilities.deprecatedEndpoints.length > 0 && {
          reason: 'Available but deprecated. Consider using Zone-Based Firewall tools.'
        })
      };
      availability['unifi_create_firewall_rule'] = { 
        available: true,
        ...(capabilities.deprecatedEndpoints.length > 0 && {
          reason: 'Available but deprecated. Consider using Zone-Based Firewall tools.'
        })
      };
      availability['unifi_update_firewall_rule'] = { 
        available: true,
        ...(capabilities.deprecatedEndpoints.length > 0 && {
          reason: 'Available but deprecated. Consider using Zone-Based Firewall tools.'
        })
      };
      availability['unifi_delete_firewall_rule'] = { 
        available: true,
        ...(capabilities.deprecatedEndpoints.length > 0 && {
          reason: 'Available but deprecated. Consider using Zone-Based Firewall tools.'
        })
      };
    } else {
      this.markToolsUnavailable(availability, [
        'unifi_get_firewall_rules',
        'unifi_create_firewall_rule',
        'unifi_update_firewall_rule',
        'unifi_delete_firewall_rule'
      ], 'Legacy firewall not supported in this version', 'Use Zone-Based Firewall tools instead');
    }

    // Zone-Based Firewall tools
    if (capabilities.supportsZBF) {
      const zbfTools = [
        'unifi_get_zones',
        'unifi_create_zone',
        'unifi_update_zone',
        'unifi_delete_zone',
        'unifi_get_zone_policies',
        'unifi_create_zone_policy',
        'unifi_update_zone_policy',
        'unifi_delete_zone_policy',
        'unifi_get_zone_matrix',
        'unifi_block_app_in_zone'
      ];

      zbfTools.forEach(tool => {
        availability[tool] = { available: true };
      });
    } else {
      this.markToolsUnavailable(availability, [
        'unifi_get_zones',
        'unifi_create_zone',
        'unifi_update_zone',
        'unifi_delete_zone',
        'unifi_get_zone_policies',
        'unifi_create_zone_policy',
        'unifi_update_zone_policy',
        'unifi_delete_zone_policy',
        'unifi_get_zone_matrix',
        'unifi_block_app_in_zone'
      ], 'Zone-Based Firewall not supported', 'Requires UniFi Network 9.0+ and compatible hardware');
    }

    // Network management tools (always available)
    availability['unifi_get_networks'] = { available: true };
    availability['unifi_create_network'] = { available: true };
    availability['unifi_update_network'] = { available: true };
    availability['unifi_delete_network'] = { available: true };

    // Advanced monitoring tools
    if (this.isVersionAtLeast(capabilities.version, VERSION_REQUIREMENTS.ADVANCED_STATS_MINIMUM)) {
      availability['unifi_get_site_stats'] = { available: true };
      availability['unifi_get_bandwidth_usage'] = { available: true };
      availability['unifi_get_events'] = { available: true };
      availability['unifi_get_alerts'] = { available: true };
    } else {
      this.markToolsUnavailable(availability, [
        'unifi_get_site_stats',
        'unifi_get_bandwidth_usage',
        'unifi_get_events',
        'unifi_get_alerts'
      ], 'Advanced monitoring not supported', undefined, VERSION_REQUIREMENTS.ADVANCED_STATS_MINIMUM);
    }

    return availability;
  }

  /**
   * Mark tools as unavailable with reason
   */
  private markToolsUnavailable(
    availability: ToolAvailability,
    tools: string[],
    reason: string,
    alternativeTool?: string,
    minimumVersion?: string
  ): void {
    tools.forEach(tool => {
      availability[tool] = {
        available: false,
        reason,
        ...(alternativeTool && { alternativeTool }),
        ...(minimumVersion && { minimumVersion })
      };
    });
  }

  // ================================
  // Feature Validation
  // ================================

  /**
   * Validate if a specific feature is available
   */
  async validateFeature(feature: string): Promise<void> {
    const capabilities = await this.detectCapabilities();

    switch (feature) {
      case 'zbf':
      case 'zone-based-firewall':
        if (!capabilities.supportsZBF) {
          throw new FeatureNotSupportedError(
            'Zone-Based Firewall',
            VERSION_REQUIREMENTS.ZBF_MINIMUM,
            capabilities.version
          );
        }
        break;

      case 'legacy-firewall':
        if (!capabilities.supportsLegacyFirewall) {
          throw new FeatureNotSupportedError(
            'Legacy Firewall',
            FEATURE_COMPATIBILITY.LEGACY_FIREWALL.minimumVersion,
            capabilities.version
          );
        }
        break;

      case 'advanced-stats':
        if (!this.isVersionAtLeast(capabilities.version, VERSION_REQUIREMENTS.ADVANCED_STATS_MINIMUM)) {
          throw new FeatureNotSupportedError(
            'Advanced Statistics',
            VERSION_REQUIREMENTS.ADVANCED_STATS_MINIMUM,
            capabilities.version
          );
        }
        break;

      default:
        throw new UniFiMCPError(
          `Unknown feature: ${feature}`,
          ErrorCode.UNKNOWN_FEATURE,
          400
        );
    }
  }

  /**
   * Validate hardware compatibility for a feature
   */
  async validateHardwareCompatibility(feature: string): Promise<void> {
    const capabilities = await this.detectCapabilities();
    const hardwareModel = capabilities.hardwareCapabilities.model;

    const featureConfig = FEATURE_COMPATIBILITY[feature.toUpperCase() as keyof typeof FEATURE_COMPATIBILITY];
    if (!featureConfig) {
      throw new UniFiMCPError(`Unknown feature for hardware validation: ${feature}`, ErrorCode.UNKNOWN_FEATURE);
    }

    if (featureConfig.requiredHardware.some(hw => hw === 'all')) {
      return; // Compatible with all hardware
    }

    const isCompatible = featureConfig.requiredHardware.some(model => 
      hardwareModel.includes(model) || this.isHardwareModelCompatible(hardwareModel, model)
    );

    if (!isCompatible) {
      throw new HardwareIncompatibleError(
        feature,
        hardwareModel,
        Array.from(featureConfig.requiredHardware)
      );
    }
  }

  // ================================
  // Utility Methods
  // ================================

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cachedCapabilities || !this.cacheTimestamp) {
      return false;
    }

    const now = new Date();
    const cacheAge = now.getTime() - this.cacheTimestamp.getTime();
    const maxAge = this.cacheValidityMinutes * 60 * 1000;

    return cacheAge < maxAge;
  }

  /**
   * Normalize version string
   */
  private normalizeVersion(version: string): string {
    // Extract semantic version from full version string
    const match = version.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : version;
  }

  /**
   * Check if version meets minimum requirement
   */
  private isVersionAtLeast(current: string, minimum: string): boolean {
    const currentParts = current.split('.').map(Number);
    const minimumParts = minimum.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const minimumPart = minimumParts[i] || 0;

      if (currentPart > minimumPart) return true;
      if (currentPart < minimumPart) return false;
    }

    return true; // Equal versions
  }

  /**
   * Check if hardware model is compatible
   */
  private isHardwareModelCompatible(actual: string, required: string): boolean {
    // Normalize model names for comparison
    const normalizeModel = (model: string) => model.toLowerCase().replace(/[-_\s]/g, '');
    
    return normalizeModel(actual).includes(normalizeModel(required));
  }

  /**
   * Check if gateway is advanced model
   */
  private isAdvancedGateway(model: string): boolean {
    const advancedModels = [DEVICE_MODELS.UCG_ULTRA, DEVICE_MODELS.UCG_MAX];
    return advancedModels.some(advModel => model.includes(advModel));
  }

  /**
   * Check if gateway is pro model
   */
  private isProGateway(model: string): boolean {
    const proModels = [DEVICE_MODELS.UDM_PRO, DEVICE_MODELS.USG_PRO_4];
    return proModels.some(proModel => model.includes(proModel));
  }

  /**
   * Clear capability cache
   */
  clearCache(): void {
    this.cachedCapabilities = null;
    this.cacheTimestamp = null;
    this.logger.debug('Capability cache cleared');
  }

  /**
   * Get cached capabilities without detection
   */
  getCachedCapabilities(): FeatureCapabilities | null {
    return this.isCacheValid() ? this.cachedCapabilities : null;
  }

  /**
   * Force capability detection (bypass cache)
   */
  async forceDetection(): Promise<FeatureCapabilities> {
    this.clearCache();
    return this.detectCapabilities();
  }
}