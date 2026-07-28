import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
    const config = loadConfig();
    const server = createServer(config);
    const transport = new StdioServerTransport();

    await server.connect(transport);
    const enabledFeatures = Object.entries(config.features)
        .filter(([, enabled]) => enabled)
        .map(([feature]) => feature)
        .join(', ');

    const tier = config.capabilities.destructive
        ? 'read+write+destructive'
        : config.capabilities.write
          ? 'read+write'
          : 'read-only';

    console.error(
        `Cencori MCP server running (tier=${tier}, base=${config.baseUrl}, features=${enabledFeatures}, apiKey=${config.apiKey ? 'configured' : 'not set'})`,
    );
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
