# Contributing to claude-api-hub

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/LeenixP/claude-api-hub.git
cd claude-api-hub
npm install
npm run dev
```

## Project Structure

```
src/
├── index.ts          # Entry point, provider factory, graceful shutdown
├── server.ts         # HTTP server setup
├── router.ts         # Model routing and alias resolution
├── config.ts         # Configuration loading and validation
├── dashboard.ts      # Embedded web dashboard (legacy)
├── routes/           # Route handler modules
│   ├── messages.ts   # /v1/messages proxy endpoint
│   ├── admin.ts      # Admin API endpoints
│   ├── config.ts     # Config management endpoints
│   ├── oauth.ts      # OAuth flow endpoints
│   ├── health.ts     # Health check endpoints
│   ├── logs.ts       # Log endpoints
│   └── stats.ts      # Stats and metrics endpoints
├── middleware/       # Auth and security middleware
│   ├── auth.ts       # Authentication middleware
│   ├── rate-limit.ts # Rate limiting middleware
│   └── cors.ts       # CORS handling
├── services/         # Core business logic services
│   ├── forwarder.ts  # Request forwarding logic
│   ├── pool-manager.ts # Key pool management
│   ├── event-bus.ts  # SSE event broadcasting
│   ├── rate-tracker.ts # QPS/RPM/TPS metrics
│   ├── token-refresher.ts # OAuth token refresh
│   └── log-manager.ts # File logging management
├── providers/        # Provider implementations
│   ├── types.ts      # Shared type definitions
│   ├── factory.ts    # Provider factory
│   ├── claude.ts     # Anthropic passthrough provider
│   ├── generic.ts    # OpenAI-compatible provider
│   ├── kiro.ts       # Kiro provider
│   ├── kiro-auth.ts  # Kiro authentication
│   ├── kiro-converter.ts # Kiro request/response conversion
│   ├── kiro-oauth.ts # Kiro OAuth flow
│   └── kiro-parser.ts # Kiro response parsing
└── translator/       # Protocol translation layer
    ├── anthropic-to-openai.ts  # Request translation (Anthropic → OpenAI)
    └── openai-to-anthropic.ts  # Response translation (OpenAI → Anthropic)
src-ui/               # Preact frontend
├── components/       # UI components
├── hooks/            # React hooks
└── lib/              # Utility functions
scripts/              # Build scripts
└── build-ui.mjs      # esbuild + Tailwind CSS build pipeline
config/               # Default configuration
└── default providers.json
static/               # Build output (index.html, style.css, bundle.js)
test/                 # Vitest test files
```

## Frontend Development

The frontend is built with **Preact** and **Tailwind CSS**, styled after the Traefik Dashboard.

```bash
npm run dev:ui      # Watch mode — rebuilds on file changes
npm run build:ui    # Production build
```

### Component Structure

Components live in `src-ui/components/` and follow a flat hierarchy:

- `App.tsx` — Root component, handles routing between Dashboard and Config views
- `Dashboard.tsx` — Main dashboard with provider cards and alias editor
- `ConfigEditor.tsx` — Dual-mode config editor (UI form + raw JSON)
- `ProviderCard.tsx` — Individual provider display card
- `LogViewer.tsx` — Real-time request log viewer with SSE
- `AliasEditor.tsx` — Alias mapping editor with model dropdowns

### Styling

- **Tailwind CSS** for utility-first styling
- **CSS variables** for theming (dark/light mode support)
- Colors follow the Traefik Dashboard palette: slate backgrounds, indigo accents, emerald success states

## How to Contribute

### Reporting Bugs

- Use the [GitHub Issues](https://github.com/LeenixP/claude-api-hub/issues) page
- Include your Node.js version, OS, and steps to reproduce
- Include relevant config (with API keys redacted)

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the use case and expected behavior

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run type check: `npx tsc --noEmit`
6. Commit with conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
7. Push and open a PR against `main`

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org):

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code refactoring
- `docs:` — Documentation changes
- `test:` — Test additions or fixes
- `chore:` — Build, CI, or tooling changes

### Adding a New Provider

1. Create a new class implementing the `Provider` interface in `src/providers/`
2. Register it in the provider factory in `src/providers/factory.ts`
3. Add tests in `test/`
4. Update README with configuration example

## Code Style

- TypeScript strict mode
- Semicolons required
- 2-space indentation
- Minimal comments — code should be self-documenting
- JSDoc on public interfaces and exported functions

## Running Tests

```bash
npm test              # Run all tests
npx vitest run        # Same, explicit
npx vitest --watch    # Watch mode
npm run test:coverage # Run tests with coverage report
```

### Coverage

Coverage thresholds are set at **60%** for all metrics. The coverage report is generated with `npm run test:coverage`.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
