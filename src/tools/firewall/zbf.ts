import { MCPTool, ToolCategory, ToolResult, ErrorCode } from '../../server/types.js';
import { ToolRegistry } from '../../server/toolRegistry.js';
import { UniFiClient } from '../../unifi/client.js';
import { VersionDetector } from '../../unifi/versionDetector.js';
import { createToolLogger } from '../../utils/logger.js';
import { UniFiMCPError, ResourceNotFoundError } from '../../utils/errors.js';
import { UNIFI_ENDPOINTS } from '../../config/constants.js';

/**
 * Zone-Based Firewall Tools (UniFi 9.0+)
 *
 * Complete implementation of Zone-Based Firewall management for UniFi Network v2 API.
 * All CRUD operations tested and verified with UniFi Network 9.5.21.
 *
 * Key v2 API Requirements (verified through extensive testing):
 * - Zone IDs: Must fetch zones and map names to IDs (cannot use zone names directly)
 * - Action field: UPPERCASE required (ALLOW, BLOCK) - lowercase is rejected
 * - Protocol field: lowercase required (tcp, udp, icmp, all) - uppercase is rejected
 * - Schedule field: Mandatory { mode: 'ALWAYS' } - null causes validation error
 * - create_allow_respond: Must be false for standard policies - true causes rejection
 * - Connection states: Required fields (connection_state_type, connection_states)
 * - ICMP types: Required fields (icmp_typename, icmp_v6_typename)
 * - Matching flags: Required (match_ip_sec, match_opposite_protocol, match_opposite_ports)
 */

const logger = createToolLogger('zbf-tools');

// ================================
// Get Zones Tool
// ================================

const getZonesTool: MCPTool = {
  name: 'unifi_get_zones',
  description: 'Get firewall zones (UniFi 9.0+)',
  category: ToolCategory.FIREWALL_ZBF,
  requiresConnection: true,
  requiresVersion: '9.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      includeMembers: {
        type: 'boolean',
        description: 'Include detailed zone members/subnets',
        default: true
      }
    },
    additionalProperties: false
  },
  handler: async (params: any): Promise<ToolResult> => {
    try {
      const client = params._client as UniFiClient;
      const versionDetector = params._versionDetector as VersionDetector;

      await versionDetector.validateFeature('zone-based-firewall');

      logger.info('Retrieving firewall zones');

      const response = await client.get(UNIFI_ENDPOINTS.FIREWALL_ZONES);

      if (!response.data || !Array.isArray(response.data)) {
        throw new UniFiMCPError('Invalid zone data received', ErrorCode.INVALID_DATA);
      }

      const zones = response.data;

      return {
        success: true,
        data: {
          zones,
          summary: {
            total: zones.length,
            zones: zones.map((z: any) => ({ id: z._id, name: z.name }))
          }
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error('Failed to retrieve zones', error);

      return {
        success: false,
        error: {
          code: error instanceof UniFiMCPError ? error.code : 'ZONES_ERROR',
          message: (error as Error).message,
          details: error instanceof UniFiMCPError ? error.details : undefined
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };
    }
  }
};

// ================================
// Get Firewall Rules (ZBF Policies) Tool
// ================================

const getFirewallRulesTool: MCPTool = {
  name: 'unifi_get_firewall_rules',
  description: 'Get Zone-Based Firewall policies (UniFi 9.0+)',
  category: ToolCategory.FIREWALL_ZBF,
  requiresConnection: true,
  requiresVersion: '9.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Filter by action (allow/block)',
        enum: ['allow', 'block']
      },
      sourceZone: {
        type: 'string',
        description: 'Filter by source zone name'
      },
      destinationZone: {
        type: 'string',
        description: 'Filter by destination zone name'
      },
      enabled: {
        type: 'boolean',
        description: 'Filter by enabled status'
      }
    },
    additionalProperties: false
  },
  handler: async (params: any): Promise<ToolResult> => {
    try {
      const client = params._client as UniFiClient;
      const versionDetector = params._versionDetector as VersionDetector;

      await versionDetector.validateFeature('zone-based-firewall');

      logger.info('Retrieving ZBF policies', {
        action: params.action,
        sourceZone: params.sourceZone,
        destinationZone: params.destinationZone,
        enabled: params.enabled
      });

      const response = await client.get(UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICIES);

      if (!response.data || !Array.isArray(response.data)) {
        throw new UniFiMCPError('Invalid policy data received', ErrorCode.INVALID_DATA);
      }

      let policies = response.data;

      // Apply action filter (case-insensitive)
      if (params.action) {
        policies = policies.filter((p: any) =>
          p.action.toUpperCase() === params.action.toUpperCase()
        );
      }

      // Apply enabled filter
      if (params.enabled !== undefined) {
        policies = policies.filter((p: any) => p.enabled === params.enabled);
      }

      // Apply zone filters (requires zone ID lookup)
      if (params.sourceZone || params.destinationZone) {
        const zonesResp = await client.get(UNIFI_ENDPOINTS.FIREWALL_ZONES);
        const zones = zonesResp.data || [];

        if (params.sourceZone) {
          const srcZone = zones.find((z: any) =>
            z.name.toLowerCase() === params.sourceZone.toLowerCase()
          );
          if (srcZone) {
            policies = policies.filter((p: any) => p.source?.zone_id === srcZone._id);
          }
        }

        if (params.destinationZone) {
          const dstZone = zones.find((z: any) =>
            z.name.toLowerCase() === params.destinationZone.toLowerCase()
          );
          if (dstZone) {
            policies = policies.filter((p: any) => p.destination?.zone_id === dstZone._id);
          }
        }
      }

      const summary = {
        total: policies.length,
        enabled: policies.filter((p: any) => p.enabled).length,
        disabled: policies.filter((p: any) => !p.enabled).length,
        byAction: policies.reduce((acc: any, p: any) => {
          acc[p.action] = (acc[p.action] || 0) + 1;
          return acc;
        }, {}),
        byProtocol: policies.reduce((acc: any, p: any) => {
          acc[p.protocol] = (acc[p.protocol] || 0) + 1;
          return acc;
        }, {})
      };

      return {
        success: true,
        data: {
          policies,
          summary,
          filters: {
            action: params.action,
            sourceZone: params.sourceZone,
            destinationZone: params.destinationZone,
            enabled: params.enabled
          }
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error('Failed to retrieve ZBF policies', error);

      return {
        success: false,
        error: {
          code: error instanceof UniFiMCPError ? error.code : 'ZBF_POLICIES_ERROR',
          message: (error as Error).message,
          details: error instanceof UniFiMCPError ? error.details : undefined
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };
    }
  }
};

// ================================
// Create Firewall Rule Tool
// ================================

const createFirewallRuleTool: MCPTool = {
  name: 'unifi_create_firewall_rule',
  description: 'Create a Zone-Based Firewall policy (UniFi 9.0+)',
  category: ToolCategory.FIREWALL_ZBF,
  requiresConnection: true,
  requiresVersion: '9.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Policy name',
        minLength: 1,
        maxLength: 100
      },
      sourceZone: {
        type: 'string',
        description: 'Source zone (Internal, External, Gateway, VPN, Hotspot, DMZ)'
      },
      destinationZone: {
        type: 'string',
        description: 'Destination zone (Internal, External, Gateway, VPN, Hotspot, DMZ)'
      },
      action: {
        type: 'string',
        enum: ['allow', 'block'],
        description: 'Action to take'
      },
      protocol: {
        type: 'string',
        enum: ['all', 'tcp', 'udp', 'icmp'],
        description: 'Protocol to match',
        default: 'all'
      },
      port: {
        type: 'string',
        description: 'Port or port range (e.g., "80", "80-443", "any")',
        default: 'any'
      },
      description: {
        type: 'string',
        description: 'Policy description',
        maxLength: 255
      },
      enabled: {
        type: 'boolean',
        description: 'Enable the policy',
        default: true
      }
    },
    required: ['name', 'sourceZone', 'destinationZone', 'action'],
    additionalProperties: false
  },
  handler: async (params: any): Promise<ToolResult> => {
    try {
      const client = params._client as UniFiClient;
      const versionDetector = params._versionDetector as VersionDetector;

      await versionDetector.validateFeature('zone-based-firewall');

      logger.info('Creating ZBF policy', {
        name: params.name,
        sourceZone: params.sourceZone,
        destinationZone: params.destinationZone,
        action: params.action
      });

      // Fetch zones to map names to IDs (required for v2 API)
      const zonesResp = await client.get(UNIFI_ENDPOINTS.FIREWALL_ZONES);
      const zones = zonesResp.data || [];

      const srcZone = zones.find((z: any) =>
        z.name.toLowerCase() === params.sourceZone.toLowerCase()
      );
      const dstZone = zones.find((z: any) =>
        z.name.toLowerCase() === params.destinationZone.toLowerCase()
      );

      if (!srcZone) {
        throw new UniFiMCPError(
          `Source zone '${params.sourceZone}' not found. Available zones: ${zones.map((z: any) => z.name).join(', ')}`,
          ErrorCode.VALIDATION_ERROR
        );
      }
      if (!dstZone) {
        throw new UniFiMCPError(
          `Destination zone '${params.destinationZone}' not found. Available zones: ${zones.map((z: any) => z.name).join(', ')}`,
          ErrorCode.VALIDATION_ERROR
        );
      }

      // Prepare policy data for v2 API with all required fields
      const policyData: any = {
        name: params.name,
        action: params.action.toUpperCase(), // v2 API requires UPPERCASE
        enabled: params.enabled !== undefined ? params.enabled : true,
        ip_version: 'BOTH',
        protocol: (params.protocol || 'all').toLowerCase(), // v2 API requires lowercase
        schedule: { mode: 'ALWAYS' }, // Required field
        create_allow_respond: false, // Must be false for standard policies
        connection_state_type: 'ALL',
        connection_states: [],
        icmp_typename: 'ANY',
        icmp_v6_typename: 'ANY',
        logging: false,
        match_ip_sec: false,
        match_opposite_protocol: false,
        source: {
          zone_id: srcZone._id,
          matching_target: 'ANY',
          matching_target_type: 'OBJECT',
          network_type: 'NETv4',
          network_ids: [],
          match_opposite_ports: false
        },
        destination: {
          zone_id: dstZone._id,
          matching_target: 'ANY',
          matching_target_type: 'OBJECT',
          network_type: 'NETv4',
          network_ids: [],
          match_opposite_ports: false,
          port_matching_type: params.port && params.port !== 'any' ? 'SPECIFIC' : 'ANY'
        }
      };

      // Add port if specified
      if (params.port && params.port !== 'any') {
        policyData.destination.port = params.port;
      }

      // Add description if provided
      if (params.description) {
        policyData.description = params.description;
      }

      // Create the policy
      const response = await client.post(UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICIES, policyData);

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new UniFiMCPError('Failed to create ZBF policy - no data returned', ErrorCode.RULE_CREATION_FAILED);
      }

      const createdPolicy = response.data[0];

      return {
        success: true,
        data: {
          policy: createdPolicy,
          policyId: createdPolicy._id,
          message: `ZBF policy '${params.name}' created successfully`
        },
        warnings: [
          'Policy changes may take a few moments to take effect'
        ],
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error('Failed to create ZBF policy', error);

      return {
        success: false,
        error: {
          code: error instanceof UniFiMCPError ? error.code : 'ZBF_CREATE_ERROR',
          message: (error as Error).message,
          details: error instanceof UniFiMCPError ? error.details : undefined
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };
    }
  }
};

// ================================
// Update Firewall Rule Tool
// ================================

const updateFirewallRuleTool: MCPTool = {
  name: 'unifi_update_firewall_rule',
  description: 'Update a Zone-Based Firewall policy (UniFi 9.0+)',
  category: ToolCategory.FIREWALL_ZBF,
  requiresConnection: true,
  requiresVersion: '9.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      ruleId: {
        type: 'string',
        description: 'Policy ID to update',
        minLength: 1
      },
      name: {
        type: 'string',
        description: 'New policy name',
        maxLength: 100
      },
      action: {
        type: 'string',
        enum: ['allow', 'block'],
        description: 'Action to take'
      },
      protocol: {
        type: 'string',
        enum: ['all', 'tcp', 'udp', 'icmp'],
        description: 'Protocol to match'
      },
      port: {
        type: 'string',
        description: 'Port or port range'
      },
      description: {
        type: 'string',
        description: 'Policy description',
        maxLength: 255
      },
      enabled: {
        type: 'boolean',
        description: 'Enable/disable the policy'
      }
    },
    required: ['ruleId'],
    additionalProperties: false
  },
  handler: async (params: any): Promise<ToolResult> => {
    try {
      const client = params._client as UniFiClient;
      const versionDetector = params._versionDetector as VersionDetector;
      const { ruleId, ...updates } = params;

      await versionDetector.validateFeature('zone-based-firewall');

      logger.info('Updating ZBF policy', { ruleId, updates: Object.keys(updates) });

      // Get existing policy
      const existingResponse = await client.get(
        `${UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICY_DETAILS.replace('{id}', ruleId)}`
      );

      if (!existingResponse.data || !Array.isArray(existingResponse.data) || existingResponse.data.length === 0) {
        throw new ResourceNotFoundError('ZBF Policy', ruleId);
      }

      const existingPolicy = existingResponse.data[0] as any;

      // Prepare updated policy data
      const updatedPolicyData = { ...existingPolicy };

      if (updates.name !== undefined) updatedPolicyData.name = updates.name;
      if (updates.enabled !== undefined) updatedPolicyData.enabled = updates.enabled;
      if (updates.action !== undefined) updatedPolicyData.action = updates.action.toUpperCase();
      if (updates.protocol !== undefined) updatedPolicyData.protocol = updates.protocol.toLowerCase();
      if (updates.description !== undefined) updatedPolicyData.description = updates.description;

      if (updates.port !== undefined) {
        if (!updatedPolicyData.destination) updatedPolicyData.destination = {};
        updatedPolicyData.destination.port_matching_type = updates.port === 'any' ? 'ANY' : 'SPECIFIC';
        if (updates.port !== 'any') {
          updatedPolicyData.destination.port = updates.port;
        } else {
          delete updatedPolicyData.destination.port;
        }
      }

      // Update the policy
      const response = await client.put(
        `${UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICY_DETAILS.replace('{id}', ruleId)}`,
        updatedPolicyData
      );

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new UniFiMCPError('Failed to update ZBF policy', ErrorCode.RULE_UPDATE_FAILED);
      }

      const updatedPolicy = response.data[0];

      return {
        success: true,
        data: {
          policy: updatedPolicy,
          policyId: updatedPolicy._id,
          updatedFields: Object.keys(updates),
          message: `ZBF policy '${updatedPolicy.name}' updated successfully`
        },
        warnings: [
          'Policy changes may take a few moments to take effect'
        ],
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error('Failed to update ZBF policy', error);

      return {
        success: false,
        error: {
          code: error instanceof UniFiMCPError ? error.code : 'ZBF_UPDATE_ERROR',
          message: (error as Error).message,
          details: error instanceof UniFiMCPError ? error.details : undefined
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };
    }
  }
};

// ================================
// Delete Firewall Rule Tool
// ================================

const deleteFirewallRuleTool: MCPTool = {
  name: 'unifi_delete_firewall_rule',
  description: 'Delete a Zone-Based Firewall policy (UniFi 9.0+)',
  category: ToolCategory.FIREWALL_ZBF,
  requiresConnection: true,
  requiresVersion: '9.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      ruleId: {
        type: 'string',
        description: 'Policy ID to delete',
        minLength: 1
      },
      force: {
        type: 'boolean',
        description: 'Force deletion without confirmation',
        default: false
      }
    },
    required: ['ruleId'],
    additionalProperties: false
  },
  handler: async (params: any): Promise<ToolResult> => {
    try {
      const client = params._client as UniFiClient;
      const versionDetector = params._versionDetector as VersionDetector;
      const { ruleId } = params;

      await versionDetector.validateFeature('zone-based-firewall');

      logger.info('Deleting ZBF policy', { ruleId });

      // Get existing policy for confirmation
      const existingResponse = await client.get(
        `${UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICY_DETAILS.replace('{id}', ruleId)}`
      );

      if (!existingResponse.data || !Array.isArray(existingResponse.data) || existingResponse.data.length === 0) {
        throw new ResourceNotFoundError('ZBF Policy', ruleId);
      }

      const existingPolicy = existingResponse.data[0] as any;

      // Delete the policy
      const response = await client.delete(
        `${UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICY_DETAILS.replace('{id}', ruleId)}`
      );

      if (response.meta && response.meta.rc !== 'ok') {
        throw new UniFiMCPError(
          `Failed to delete ZBF policy: ${response.meta.msg || 'Unknown error'}`,
          ErrorCode.RULE_DELETION_FAILED
        );
      }

      return {
        success: true,
        data: {
          deletedPolicy: {
            id: existingPolicy._id,
            name: existingPolicy.name,
            action: existingPolicy.action,
            protocol: existingPolicy.protocol
          },
          message: `ZBF policy '${existingPolicy.name}' deleted successfully`
        },
        warnings: [
          'Policy deletion is permanent and cannot be undone',
          'Changes may take a few moments to take effect'
        ],
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error('Failed to delete ZBF policy', error);

      return {
        success: false,
        error: {
          code: error instanceof UniFiMCPError ? error.code : 'ZBF_DELETE_ERROR',
          message: (error as Error).message,
          details: error instanceof UniFiMCPError ? error.details : undefined
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };
    }
  }
};

// ================================
// Toggle Firewall Rule Tool
// ================================

const toggleFirewallRuleTool: MCPTool = {
  name: 'unifi_toggle_firewall_rule',
  description: 'Enable or disable a Zone-Based Firewall policy (UniFi 9.0+)',
  category: ToolCategory.FIREWALL_ZBF,
  requiresConnection: true,
  requiresVersion: '9.0.0',
  inputSchema: {
    type: 'object',
    properties: {
      ruleId: {
        type: 'string',
        description: 'Policy ID to toggle',
        minLength: 1
      },
      enabled: {
        type: 'boolean',
        description: 'Enable (true) or disable (false) the policy'
      }
    },
    required: ['ruleId', 'enabled'],
    additionalProperties: false
  },
  handler: async (params: any): Promise<ToolResult> => {
    try {
      const client = params._client as UniFiClient;
      const versionDetector = params._versionDetector as VersionDetector;
      const { ruleId, enabled } = params;

      await versionDetector.validateFeature('zone-based-firewall');

      logger.info('Toggling ZBF policy', { ruleId, enabled });

      // Get existing policy
      const existingResponse = await client.get(
        `${UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICY_DETAILS.replace('{id}', ruleId)}`
      );

      if (!existingResponse.data || !Array.isArray(existingResponse.data) || existingResponse.data.length === 0) {
        throw new ResourceNotFoundError('ZBF Policy', ruleId);
      }

      const existingPolicy = existingResponse.data[0] as any;

      // Update only the enabled status
      const updatedPolicyData = { ...existingPolicy, enabled };

      // Update the policy
      const response = await client.put(
        `${UNIFI_ENDPOINTS.FIREWALL_ZONE_POLICY_DETAILS.replace('{id}', ruleId)}`,
        updatedPolicyData
      );

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new UniFiMCPError('Failed to toggle ZBF policy', ErrorCode.RULE_TOGGLE_FAILED);
      }

      const updatedPolicy = response.data[0];

      return {
        success: true,
        data: {
          policy: {
            id: updatedPolicy._id,
            name: updatedPolicy.name,
            enabled: updatedPolicy.enabled,
            action: updatedPolicy.action,
            protocol: updatedPolicy.protocol
          },
          previousState: existingPolicy.enabled,
          newState: enabled,
          message: `ZBF policy '${updatedPolicy.name}' ${enabled ? 'enabled' : 'disabled'} successfully`
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error('Failed to toggle ZBF policy', error);

      return {
        success: false,
        error: {
          code: error instanceof UniFiMCPError ? error.code : 'ZBF_TOGGLE_ERROR',
          message: (error as Error).message,
          details: error instanceof UniFiMCPError ? error.details : undefined
        },
        metadata: {
          executionTime: 0,
          timestamp: new Date()
        }
      };
    }
  }
};

// ================================
// Tool Registration Function
// ================================

export async function registerZBFTools(
  registry: ToolRegistry,
  client: UniFiClient,
  versionDetector: VersionDetector
): Promise<void> {
  // Add client and version detector to tools for access
  const enhancedTools = [
    getZonesTool,
    getFirewallRulesTool,
    createFirewallRuleTool,
    updateFirewallRuleTool,
    deleteFirewallRuleTool,
    toggleFirewallRuleTool
  ].map(tool => ({
    ...tool,
    handler: async (params: any) => {
      // Inject dependencies
      const enhancedParams = {
        ...params,
        _client: client,
        _versionDetector: versionDetector
      };
      return tool.handler(enhancedParams);
    }
  }));

  // Register all tools
  registry.registerBatch(enhancedTools);

  logger.info('Zone-Based Firewall tools registered successfully', {
    count: enhancedTools.length,
    tools: enhancedTools.map(t => t.name)
  });
}

// Export individual tools for testing
export {
  getZonesTool,
  getFirewallRulesTool,
  createFirewallRuleTool,
  updateFirewallRuleTool,
  deleteFirewallRuleTool,
  toggleFirewallRuleTool
};
