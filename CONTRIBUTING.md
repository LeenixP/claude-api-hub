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
├── server.ts         # HTTP server, routing, admin API
├── router.ts         # Model routing and alias resolution
├── config.ts         # Configuration loading and validation
├── dashboard.ts      # Embedded web dashboard
├── providers/
│   ├── types.ts      # Shared type definitions
│   ├── claude.ts     # Anthropic passthrough provider
│   └── generic.ts    # OpenAI-compatible provider
└── translator/
    ├── anthropic-to-openai.ts  # Request translation
    └── openai-to-anthropic.ts  # Response translation
```

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

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code refactoring
- `docs:` — Documentation changes
- `test:` — Test additions or fixes
- `chore:` — Build, CI, or tooling changes

### Adding a New Provider

1. Create a new class implementing the `Provider` interface in `src/providers/`
2. Register it in the provider factory in `src/index.ts`
3. Add tests in `test/`
4. Update README with configuration example

## Code Style

- TypeScript strict mode
- No semicolons (project convention)
- 2-space indentation
- Minimal comments — code should be self-documenting

## Running Tests

```bash
npm test              # Run all tests
npx vitest run        # Same, explicit
npx vitest --watch    # Watch mode
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
