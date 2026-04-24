import { useState } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { CopyButton } from '../common/CopyButton.js';

interface GuidePageProps {
  config: GatewayConfig | null;
}

function getSteps(port: number) {
  const baseUrl = `http://localhost:${port}`;
  return [
    {
      num: 1,
      title: 'Install & Start',
      subtitle: 'Get the gateway running locally',
      code: `npm install -g claude-api-hub\nclaude-api-hub --port ${port}`,
      note: `The gateway starts on port ${port} by default. Visit ${baseUrl} to access the dashboard.`,
    },
    {
      num: 2,
      title: 'Configure Claude Code',
      subtitle: 'Point Claude Code to your gateway',
      code: JSON.stringify({
        apiUrl: `${baseUrl}/v1`,
        apiKey: 'your-admin-token-or-provider-key',
      }, null, 2),
      note: 'Add this to your Claude Code config file (~/.claude/config.json) or set CLAUDE_API_URL and CLAUDE_API_KEY env vars.',
    },
    {
      num: 3,
      title: 'Add Provider',
      subtitle: 'Connect your first LLM provider',
      code: '# In the dashboard, go to Providers → Add Provider\n# Fill in: Name, Base URL, API Key, Protocol, Models',
      note: 'Supported protocols: Anthropic, OpenAI-compatible. You can add multiple providers and the gateway will route between them.',
    },
    {
      num: 4,
      title: 'Set Up Aliases',
      subtitle: 'Map Claude tiers to your models',
      code: '# Go to Aliases in the dashboard\n# Map Haiku → fast/cheap model\n# Map Sonnet → balanced model\n# Map Opus → powerful model',
      note: 'Aliases let Claude Code request "claude-sonnet" and have it automatically routed to your preferred provider/model.',
    },
  ];
}

const FAQS = [
  {
    q: 'What providers are supported?',
    a: 'Any provider with an Anthropic or OpenAI-compatible API. This includes Anthropic, OpenAI, DeepSeek, Moonshot, GLM, MiniMax, Kimi, and many others. You can also use Kiro with OAuth authentication.',
  },
  {
    q: 'How does request routing work?',
    a: 'When Claude Code sends a request, the gateway looks at the requested model. If it matches an alias (e.g., "claude-sonnet"), it routes to the mapped provider and model. If no alias matches, it uses the default provider.',
  },
  {
    q: 'Can I use multiple providers at once?',
    a: 'Yes. You can configure multiple providers and set up fallback chains. If one provider fails, the gateway can automatically try the next one in the chain.',
  },
  {
    q: 'Is there authentication?',
    a: 'Yes. You can set an admin password in the Config page. The dashboard and API both support token-based authentication.',
  },
  {
    q: 'How do I update the configuration?',
    a: 'Use the Config page in the dashboard for a UI-based editor, or switch to JSON mode for full control. Changes are saved to the server and take effect immediately.',
  },
];

export function GuidePage({ config }: GuidePageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const port = config?.port || 9800;
  const steps = getSteps(port);

  return (
    <div>
      {/* Hero */}
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(42,162,193,0.15)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold" style="color:var(--color-text)">Getting Started</h1>
            <p class="text-xs" style="color:var(--color-text-muted)">Set up your API Hub in minutes</p>
          </div>
        </div>
      </div>

      {/* Steps Grid */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {steps.map(step => (
          <div
            key={step.num}
            class="rounded-lg p-5 transition-all duration-200"
            style="background:var(--color-surface);border:1px solid var(--color-border)"
          >
            <div class="flex items-start gap-3 mb-3">
              <div
                class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style="background:var(--color-primary);color:#fff"
              >
                {step.num}
              </div>
              <div>
                <h3 class="text-sm font-semibold" style="color:var(--color-text)">{step.title}</h3>
                <p class="text-xs" style="color:var(--color-text-muted)">{step.subtitle}</p>
              </div>
            </div>
            <div class="relative">
              <pre
                class="px-3 py-2.5 rounded-lg text-xs font-mono overflow-x-auto"
                style="background:var(--color-bg);color:var(--color-text-dim)"
              >{step.code}</pre>
              <div class="absolute top-2 right-2">
                <CopyButton text={step.code} />
              </div>
            </div>
            <p class="text-xs mt-2" style="color:var(--color-text-muted)">{step.note}</p>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div>
        <h2 class="text-lg font-semibold mb-4" style="color:var(--color-text)">FAQ</h2>
        <div class="space-y-2">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              class="rounded-lg overflow-hidden"
              style="background:var(--color-surface);border:1px solid var(--color-border)"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                class="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span class="text-sm font-medium" style="color:var(--color-text)">{faq.q}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="transition-transform duration-200 flex-shrink-0 ml-2"
                  style={`color:var(--color-text-muted);transform:rotate(${openFaq === i ? 180 : 0}deg)`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {openFaq === i && (
                <div class="px-4 pb-3 text-sm" style="color:var(--color-text-dim)">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
