#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { UniFiMCPServer } from './server/mcpServer.js';
import { UniFiWebServer } from './server/webServer.js';
import { logger } from './utils/logger.js';
import { config } from './config/environment.js';

/**
 * UniFi Network MCP Server
 *
 * A Model Context Protocol server that provides comprehensive access to UniFi Network API
 * functionality, including support for both legacy firewall rules and the new Zone-Based
 * Firewall (ZBF) system introduced in UniFi Network 9.0+.
 */

async function main(): Promise<void> {
  try {
    logger.info('Starting UniFi Network MCP Server...');

    // Create the MCP server instance
    const server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize the UniFi MCP server
    const unifiServer = new UniFiMCPServer(server);
    await unifiServer.initialize();

    // Start web server for documentation (if enabled)
    let webServer: UniFiWebServer | undefined;
    const webPort = parseInt(process.env.WEB_PORT || '8100', 10);
    const enableWebServer = process.env.ENABLE_WEB_SERVER !== 'false';

    if (enableWebServer) {
      try {
        webServer = new UniFiWebServer(unifiServer, webPort);
        await webServer.start();
        logger.info('Web server started for API documentation', {
          port: webPort,
          docsUrl: `http://localhost:${webPort}/unifi-network/docs`
        });
      } catch (error) {
        logger.warn('Failed to start web server, continuing without documentation', error);
      }
    }

    // Setup transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info(`${config.server.name} v${config.server.version} started successfully`);
    logger.info('Server is ready to accept connections');

    // Keep event loop alive for stdio transport
    process.stdin.resume();

    if (webServer) {
      logger.info('API documentation available at:', {
        docsUrl: `http://localhost:${webPort}/unifi-network/docs`,
        healthUrl: `http://localhost:${webPort}/health`
      });
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      if (webServer) {
        await webServer.stop();
      }
      await unifiServer.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      if (webServer) {
        await webServer.stop();
      }
      await unifiServer.shutdown();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start UniFi MCP Server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
// Always run main() when this file is executed directly
void main();
