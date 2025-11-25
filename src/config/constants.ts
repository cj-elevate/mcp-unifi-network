/**
 * System Constants and Default Values
 * 
 * Centralized constants for UniFi Network API endpoints, default values,
 * and system-wide configuration parameters.
 */

// ================================
// UniFi API Endpoints
// ================================

export const UNIFI_ENDPOINTS = {
  // System Information
  SYSTEM_INFO: '/proxy/network/api/s/{site}/stat/sysinfo',  // Network Application endpoint
  SYSTEM_STATS: '/api/system/stats',
  
  // Authentication
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  
  // Site Management
  SITES: '/proxy/network/api/self/sites',
  SITE_SETTINGS: '/proxy/network/api/s/{site}/rest/setting',
  
  // Device Management
  DEVICES: '/proxy/network/api/s/{site}/stat/device',
  DEVICE_DETAILS: '/proxy/network/api/s/{site}/stat/device/{id}',
  DEVICE_RESTART: '/proxy/network/api/s/{site}/cmd/devmgr/restart',
  DEVICE_ADOPT: '/proxy/network/api/s/{site}/cmd/devmgr/adopt',
  DEVICE_UPGRADE: '/proxy/network/api/s/{site}/cmd/devmgr/upgrade',
  
  // Client Management
  CLIENTS: '/proxy/network/api/s/{site}/stat/sta',
  CLIENT_DETAILS: '/proxy/network/api/s/{site}/stat/user/{id}',
  CLIENT_BLOCK: '/proxy/network/api/s/{site}/cmd/stamgr/block-sta',
  CLIENT_UNBLOCK: '/proxy/network/api/s/{site}/cmd/stamgr/unblock-sta',
  
  // Legacy Firewall (pre-9.0)
  FIREWALL_RULES: '/proxy/network/api/s/{site}/rest/firewallrule',
  FIREWALL_RULE_DETAILS: '/proxy/network/api/s/{site}/rest/firewallrule/{id}',
  FIREWALL_GROUPS: '/proxy/network/api/s/{site}/rest/firewallgroup',
  
  // Zone-Based Firewall (9.0+)
  FIREWALL_ZONES: '/proxy/network/v2/api/site/{site}/firewall/zone',
  FIREWALL_ZONE_DETAILS: '/proxy/network/v2/api/site/{site}/firewall/zone/{id}',
  FIREWALL_ZONE_POLICIES: '/proxy/network/v2/api/site/{site}/firewall-policies',
  FIREWALL_ZONE_POLICY_DETAILS: '/proxy/network/v2/api/site/{site}/firewall-policies/{id}',
  SIMPLE_APP_BLOCK: '/proxy/network/api/s/{site}/rest/simpleappblock',
  
  // Network Management
  NETWORKS: '/proxy/network/api/s/{site}/rest/networkconf',
  NETWORK_DETAILS: '/proxy/network/api/s/{site}/rest/networkconf/{id}',
  
  // User Groups and IP Groups
  USER_GROUPS: '/proxy/network/api/s/{site}/rest/usergroup',
  IP_GROUPS: '/proxy/network/api/s/{site}/rest/firewallgroup',
  
  // Statistics and Monitoring
  SITE_STATS: '/proxy/network/api/s/{site}/stat/sites',
  DEVICE_STATS: '/proxy/network/api/s/{site}/stat/device-stats',
  CLIENT_STATS: '/proxy/network/api/s/{site}/stat/user-stats',
  HEALTH_STATS: '/proxy/network/api/s/{site}/stat/health',
  EVENTS: '/proxy/network/api/s/{site}/stat/event',
  ALARMS: '/proxy/network/api/s/{site}/stat/alarm',
  
  // Reports and Analytics
  REPORTS: '/proxy/network/api/s/{site}/stat/report',
  BANDWIDTH_STATS: '/proxy/network/api/s/{site}/stat/hourly.site',
  TOP_CLIENTS: '/proxy/network/api/s/{site}/stat/topclient',
  
  // Port Forwarding and Routing
  PORT_FORWARDS: '/proxy/network/api/s/{site}/rest/portforward',
  ROUTING: '/proxy/network/api/s/{site}/rest/routing',
  
  // WiFi and Radio Management
  WLAN_CONF: '/proxy/network/api/s/{site}/rest/wlanconf',
  RADIO_STATS: '/proxy/network/api/s/{site}/stat/device-radio',
  
  // Backup and Restore
  BACKUP: '/proxy/network/api/s/{site}/cmd/backup',
  RESTORE: '/proxy/network/api/s/{site}/cmd/restore',
  
  // Dynamic DNS
  DYNAMIC_DNS: '/proxy/network/api/s/{site}/rest/dynamicdns'
} as const;

// ================================
// Default Ports
// ================================

export const DEFAULT_PORTS = {
  UNIFI_CONTROLLER: 8443,
  UNIFI_GATEWAY: 443,
  UNIFI_INFORM: 8080,
  UNIFI_DISCOVERY: 10001,
  UNIFI_STUN: 3478,
  SSH: 22,
  HTTP: 80,
  HTTPS: 443,
  DNS: 53,
  DHCP: 67,
  NTP: 123
} as const;

// ================================
// Predefined Zones (ZBF)
// ================================

export const PREDEFINED_ZONES = {
  EXTERNAL: 'external',
  INTERNAL: 'internal',
  GATEWAY: 'gateway',
  VPN: 'vpn',
  HOTSPOT: 'hotspot',
  DMZ: 'dmz'
} as const;

export const ZONE_DESCRIPTIONS = {
  [PREDEFINED_ZONES.EXTERNAL]: 'External networks (Internet, WAN)',
  [PREDEFINED_ZONES.INTERNAL]: 'Internal trusted networks',
  [PREDEFINED_ZONES.GATEWAY]: 'Gateway device itself',
  [PREDEFINED_ZONES.VPN]: 'VPN client networks',
  [PREDEFINED_ZONES.HOTSPOT]: 'Guest and hotspot networks',
  [PREDEFINED_ZONES.DMZ]: 'Demilitarized zone networks'
} as const;

// ================================
// Network Types and Purposes
// ================================

export const NETWORK_PURPOSES = {
  CORPORATE: 'corporate',
  GUEST: 'guest',
  WAN: 'wan',
  VLAN_ONLY: 'vlan-only',
  VPN: 'vpn'
} as const;

export const NETWORK_TYPES = {
  LAN: 'LAN',
  WAN: 'WAN',
  GUEST: 'GUEST',
  VPN: 'VPN',
  VLAN: 'VLAN'
} as const;

// ================================
// Device Types and Models
// ================================

export const DEVICE_TYPES = {
  GATEWAY: 'ugw',
  SWITCH: 'usw',
  ACCESS_POINT: 'uap',
  PROTECT: 'protect',
  CAMERA: 'camera',
  DOORBELL: 'doorbell',
  SENSOR: 'sensor'
} as const;

export const DEVICE_MODELS = {
  // Gateways
  UCG_ULTRA: 'UCG-Ultra',
  UCG_MAX: 'UCG-Max',
  UDM_PRO: 'UDM-Pro',
  UDM_BASE: 'UDM-Base',
  USG_PRO_4: 'USG-Pro-4',
  USG_3P: 'USG-3P',
  
  // Switches
  USW_PRO_MAX_48_POE: 'USW-Pro-Max-48-PoE',
  USW_PRO_24_POE: 'USW-Pro-24-PoE',
  USW_24_POE: 'USW-24-PoE',
  USW_16_POE: 'USW-16-PoE',
  USW_8_POE: 'USW-8-PoE',
  USW_FLEX: 'USW-Flex',
  
  // Access Points
  U7_PRO: 'U7-Pro',
  U6_ENTERPRISE: 'U6-Enterprise',
  U6_PRO: 'U6-Pro',
  U6_LITE: 'U6-Lite',
  UAP_AC_PRO: 'UAP-AC-Pro',
  UAP_NANOHD: 'UAP-nanoHD'
} as const;

// ================================
// Firewall and Security
// ================================

export const FIREWALL_ACTIONS = {
  ALLOW: 'allow',
  DENY: 'deny',
  REJECT: 'reject',
  DROP: 'drop'
} as const;

export const PROTOCOLS = {
  TCP: 'tcp',
  UDP: 'udp',
  ICMP: 'icmp',
  ANY: 'any',
  ALL: 'all'
} as const;

export const COMMON_PORTS = {
  HTTP: '80',
  HTTPS: '443',
  SSH: '22',
  FTP: '21',
  SFTP: '22',
  TELNET: '23',
  SMTP: '25',
  DNS: '53',
  DHCP_SERVER: '67',
  DHCP_CLIENT: '68',
  POP3: '110',
  IMAP: '143',
  SNMP: '161',
  LDAP: '389',
  LDAPS: '636',
  MYSQL: '3306',
  POSTGRESQL: '5432',
  REDIS: '6379',
  MONGODB: '27017'
} as const;

export const COMMON_PORT_RANGES = {
  EPHEMERAL: '49152-65535',
  FTP_DATA: '20-21',
  HTTP_ALT: '8080-8090',
  HTTPS_ALT: '8443-8453',
  RDP: '3389',
  VNC: '5900-5906',
  SIP: '5060-5061'
} as const;

// ================================
// Application Categories
// ================================

export const APP_CATEGORIES = {
  SOCIAL_MEDIA: 'Social Media',
  STREAMING: 'Streaming',
  GAMING: 'Gaming',
  FILE_SHARING: 'File Sharing',
  VPN: 'VPN',
  MESSAGING: 'Messaging',
  EMAIL: 'Email',
  WEB_BROWSING: 'Web Browsing',
  CLOUD_STORAGE: 'Cloud Storage',
  PRODUCTIVITY: 'Productivity',
  SECURITY: 'Security',
  SYSTEM: 'System',
  OTHER: 'Other'
} as const;

// ================================
// Time and Scheduling
// ================================

export const DAYS_OF_WEEK = {
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday'
} as const;

export const TIME_FORMATS = {
  TIME_24H: 'HH:mm',
  TIME_12H: 'hh:mm A',
  DATETIME_ISO: 'YYYY-MM-DDTHH:mm:ss.sssZ',
  DATE_ONLY: 'YYYY-MM-DD'
} as const;

// ================================
// Error Codes and Messages
// ================================

export const ERROR_MESSAGES = {
  CONNECTION_FAILED: 'Failed to connect to UniFi controller',
  AUTHENTICATION_FAILED: 'Authentication failed - check API key',
  INVALID_API_KEY: 'Invalid API key provided',
  FEATURE_NOT_SUPPORTED: 'Feature not supported in this UniFi version',
  HARDWARE_INCOMPATIBLE: 'Feature not compatible with current hardware',
  VALIDATION_ERROR: 'Input validation failed',
  RESOURCE_NOT_FOUND: 'Requested resource not found',
  RATE_LIMIT_EXCEEDED: 'API rate limit exceeded',
  NETWORK_TIMEOUT: 'Network request timed out',
  INTERNAL_ERROR: 'Internal server error occurred'
} as const;

// ================================
// Version Information
// ================================

export const VERSION_REQUIREMENTS = {
  ZBF_MINIMUM: '9.0.0',
  LEGACY_FIREWALL_DEPRECATED: '9.0.0',
  API_V2_MINIMUM: '8.0.0',
  ADVANCED_STATS_MINIMUM: '8.5.0',
  BULK_OPERATIONS_MINIMUM: '8.2.0'
} as const;

export const FEATURE_COMPATIBILITY = {
  ZONE_BASED_FIREWALL: {
    minimumVersion: '9.0.0',
    requiredHardware: ['UCG-Ultra', 'UCG-Max', 'UDM-Pro', 'UDM-Base'],
    deprecatedIn: null
  },
  LEGACY_FIREWALL: {
    minimumVersion: '6.0.0',
    requiredHardware: ['all'],
    deprecatedIn: '9.0.0'
  },
  ADVANCED_THREAT_DETECTION: {
    minimumVersion: '8.5.0',
    requiredHardware: ['UCG-Ultra', 'UCG-Max', 'UDM-Pro'],
    deprecatedIn: null
  },
  WIFI_6E: {
    minimumVersion: '7.5.0',
    requiredHardware: ['U6-Enterprise', 'U7-Pro'],
    deprecatedIn: null
  }
} as const;

// ================================
// Cache Keys and TTL
// ================================

export const CACHE_KEYS = {
  SYSTEM_INFO: 'system_info',
  DEVICE_LIST: 'device_list',
  CLIENT_LIST: 'client_list',
  NETWORK_CONFIG: 'network_config',
  FIREWALL_RULES: 'firewall_rules',
  ZONE_POLICIES: 'zone_policies',
  SITE_STATS: 'site_stats',
  DEVICE_STATS: 'device_stats_{id}',
  CLIENT_STATS: 'client_stats_{id}'
} as const;

export const CACHE_TTL = {
  SYSTEM_INFO: 3600, // 1 hour
  DEVICE_LIST: 300,  // 5 minutes
  CLIENT_LIST: 60,   // 1 minute
  NETWORK_CONFIG: 1800, // 30 minutes
  FIREWALL_RULES: 600,  // 10 minutes
  ZONE_POLICIES: 600,   // 10 minutes
  SITE_STATS: 300,      // 5 minutes
  DEVICE_STATS: 120,    // 2 minutes
  CLIENT_STATS: 60      // 1 minute
} as const;

// ================================
// Rate Limiting
// ================================

export const RATE_LIMITS = {
  DEFAULT_PER_MINUTE: 60,
  AUTHENTICATION_PER_MINUTE: 10,
  BULK_OPERATIONS_PER_MINUTE: 5,
  STATS_QUERIES_PER_MINUTE: 120,
  CONFIGURATION_CHANGES_PER_MINUTE: 30
} as const;

// ================================
// Monitoring and Health Checks
// ================================

export const HEALTH_CHECK_INTERVALS = {
  CONNECTION: 30000,    // 30 seconds
  SYSTEM_HEALTH: 60000, // 1 minute
  DEVICE_STATUS: 120000, // 2 minutes
  PERFORMANCE: 300000   // 5 minutes
} as const;

export const ALERT_THRESHOLDS = {
  ERROR_RATE: 0.1,        // 10%
  RESPONSE_TIME_MS: 5000, // 5 seconds
  MEMORY_USAGE: 0.8,      // 80%
  DISK_USAGE: 0.9,        // 90%
  CONNECTION_FAILURES: 5   // consecutive failures
} as const;

// ================================
// Export Collections
// ================================

export const ALL_ENDPOINTS = UNIFI_ENDPOINTS;
export const ALL_PORTS = DEFAULT_PORTS;
export const ALL_ZONES = PREDEFINED_ZONES;
export const ALL_PROTOCOLS = PROTOCOLS;
export const ALL_ACTIONS = FIREWALL_ACTIONS;