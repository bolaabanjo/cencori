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

    console.error(
        `Cencori MCP server running (readOnly=${config.readOnly}, docsBase=${config.docsBaseUrl}, base=${config.baseUrl}, features=${enabledFeatures}, apiKey=${config.apiKey ? 'configured' : 'not set'})`,
    );
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
