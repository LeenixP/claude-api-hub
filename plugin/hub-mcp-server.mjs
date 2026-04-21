import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'node:http';

const GATEWAY_BASE = 'http://127.0.0.1:9800';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const server = new Server(
  { name: 'claude-api-hub', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'hub_list_models',
      description: 'List all available models across all providers (Claude, Kimi, MiniMax, GLM)',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'hub_status',
      description: 'Health check - returns gateway and provider status',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'hub_set_default',
      description: 'Set the default model for API requests',
      inputSchema: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            description: 'Model name to set as default (e.g. kimi-k1-5, glm-4-flash)',
          },
        },
        required: ['model'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'hub_list_models') {
    const result = await httpGet(`${GATEWAY_BASE}/v1/models`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  if (name === 'hub_status') {
    const result = await httpGet(`${GATEWAY_BASE}/health`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  if (name === 'hub_set_default') {
    const result = await httpPost(`${GATEWAY_BASE}/v1/config/default`, { model: args.model });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
