import crypto from 'node:crypto';
import os from 'node:os';
import type {
  Provider,
  ProviderConfig,
  StreamContext,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
} from './types.js';
import { KiroAuth } from './kiro-auth.js';
import { convertToCodeWhisperer } from './kiro-converter.js';
import { parseKiroResponse, parseKiroStreamChunk, createKiroStreamState } from './kiro-parser.js';
import type { KiroStreamState } from './kiro-parser.js';

const KIRO_VERSION = '0.11.63';

export class KiroProvider implements Provider {
  name: string;
  config: ProviderConfig;
  private auth: KiroAuth;
  private region: string;
  private machineId: string;
  private cachedToken: string | null = null;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
    this.region = (config.kiroRegion as string) || 'us-east-1';
    this.machineId = crypto.randomBytes(16).toString('hex');
    this.auth = new KiroAuth(this.region, config.kiroCredsPath as string | undefined);

    // Load credentials synchronously at construction time so buildRequest works
    try {
      this.auth.loadCredentialsSync();
      this.cachedToken = this.auth.getAccessTokenSync() ?? null;
    } catch (err) {
      throw new Error(`Kiro initialization failed: ${(err as Error).message}`);
    }
  }

  /** Refresh access token asynchronously (call when token expires). */
  async ensureReady(): Promise<void> {
    this.cachedToken = await this.auth.getAccessToken();
  }

  matchModel(model: string): boolean {
    if (this.config.models && this.config.models.length > 0) {
      return this.config.models.some((m) => model === m || model.startsWith(m + '-'));
    }
    return model.startsWith('claude-');
  }

  resolveModel(model: string): string {
    return model;
  }

  buildRequest(req: AnthropicRequest): { url: string; headers: Record<string, string>; body: string } {
    if (!this.cachedToken) {
      throw new Error('Kiro: no valid access token. Call ensureReady() first.');
    }

    const kiroReq = convertToCodeWhisperer(
      req.messages, req.model, req.system, req.tools, req.thinking,
    );

    const body: Record<string, unknown> = { conversationState: kiroReq.conversationState };
    const profileArn = this.auth.profileArn;
    if (profileArn) body.profileArn = profileArn;

    const nodeVersion = process.versions.node;
    const osName = os.platform();

    return {
      url: `https://q.${this.region}.amazonaws.com/generateAssistantResponse`,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.cachedToken}`,
        'amz-sdk-invocation-id': crypto.randomUUID(),
        'amz-sdk-request': 'attempt=1; max=3',
        'x-amzn-codewhisperer-optout': 'true',
        'x-amzn-kiro-agent-mode': 'vibe',
        'x-amz-user-agent': `aws-sdk-js/1.0.34 KiroIDE-${KIRO_VERSION}-${this.machineId}`,
        'user-agent': `aws-sdk-js/1.0.34 ua/2.1 os/${osName} lang/js md/nodejs#${nodeVersion} api/codewhispererstreaming#1.0.34 m/E KiroIDE-${KIRO_VERSION}-${this.machineId}`,
      },
      body: JSON.stringify(body),
    };
  }

  parseResponse(raw: OpenAIResponse, originalModel: string): AnthropicResponse {
    const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return parseKiroResponse(rawStr, originalModel);
  }

  createStreamContext(originalModel: string): StreamContext {
    return createKiroStreamState(originalModel) as unknown as StreamContext;
  }

  parseStreamChunk(chunk: OpenAIStreamChunk, _originalModel: string, ctx: StreamContext): AnthropicStreamEvent[] {
    const chunkStr = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
    return parseKiroStreamChunk(chunkStr, ctx as unknown as KiroStreamState);
  }
}
