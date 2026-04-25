# Contributing to Claude API Hub

Thank you for your interest in contributing to Claude API Hub! This document provides guidelines and instructions for contributing.

## Development Environment Setup

### Prerequisites

- **Node.js >= 22**: Claude API Hub requires Node.js 22 or later.
  ```bash
  node -v  # Verify version
  nvm install 22  # If needed
  ```

- **npm**: Comes with Node.js, or install via [nodejs.org](https://nodejs.org)

### Installation

1. Fork the repository on GitHub

2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-api-hub.git
   cd claude-api-hub
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Code Style

### TypeScript

We use TypeScript with strict mode enabled. Key guidelines:

- **Strict mode**: All TypeScript checks enabled (`strict: true` in tsconfig.json)
- **Explicit types**: Always declare return types for functions and methods
- **No `any`**: Avoid `any` type; use `unknown` when type is truly unknown
- **Interfaces over types**: Prefer interfaces for object shapes

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Trailing commas in multiline structures
- Semicolons required

### Naming Conventions

- **Variables/Functions**: `camelCase`
- **Classes/Interfaces/Types**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Files**: `kebab-case.ts`

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage Requirements

- Maintain at least 60% code coverage
- All new features must include tests
- Bug fixes must include regression tests

### Writing Tests

- Use Vitest as the test framework
- Place tests alongside source files: `src/foo.ts` → `src/foo.test.ts`
- Use descriptive test names that explain the expected behavior
- Mock external dependencies (HTTP requests, file system)

Example test structure:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { yourFunction } from './your-module';

describe('yourFunction', () => {
  it('should do something specific', () => {
    const result = yourFunction(input);
    expect(result).toBe(expected);
  });

  it('should handle error cases', () => {
    expect(() => yourFunction(invalidInput)).toThrow();
  });
});
```

## Building

```bash
# Build TypeScript and UI
npm run build

# Build TypeScript only
npm run build:ts

# Build UI only
npm run build:ui

# Development mode with hot reload
npm run dev

# Frontend watch mode
npm run dev:ui
```

## Linting

```bash
# Run ESLint
npm run lint
```

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect code meaning (formatting, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

### Examples

```
feat(provider): add support for new AI provider

fix(routing): prevent infinite loop in fallback chain

docs(readme): add Docker installation instructions

test(auth): add tests for session token refresh
```

## Pull Request Guidelines

### Before Submitting

1. **Run all tests**: `npm test`
2. **Run linting**: `npm run lint`
3. **Build the project**: `npm run build`
4. **Keep branch updated**: Rebase on main before submitting

### PR Description

Include the following in your PR description:

- **Summary**: Brief description of the changes
- **Motivation**: Why this change is needed
- **Breaking Changes**: Any API or behavior changes
- **Related Issues**: Link to any related issues (e.g., "Closes #123")

### PR Size

- Keep PRs focused and reasonably sized
- If submitting a large feature, consider splitting into smaller PRs

## Provider Development Guide

Adding support for a new LLM provider is one of the most common contribution types.

### Steps to Add a Provider

1. **Understand the provider's API**:
   - Does it use Anthropic format (passthrough)?
   - Does it use OpenAI format (needs translation)?
   - Does it use a custom format (Kiro-style)?

2. **Implement protocol translation** (if needed):
   - Create a translator class in `src/translators/`
   - Handle request/response mapping
   - Test with provider's API

3. **Add provider config schema**:
   - Update provider interface in types
   - Add to default providers config

4. **Test the provider**:
   - Add unit tests for the translator
   - Test end-to-end with the actual API
   - Verify model listing works

### Provider Types

```typescript
// Standard OpenAI-compatible provider
interface OpenAIProvider {
  baseUrl: string;        // e.g., "https://api.provider.com/v1"
  apiKey: string;         // Bearer token
  passthrough: false;    // Use OpenAI format
  models: string[];      // Available models
  defaultModel: string;   // Default model
}

// Anthropic-compatible provider (passthrough)
interface AnthropicProvider {
  baseUrl: string;
  apiKey: string;        // x-api-key header
  passthrough: true;     // Forward as-is
}

// OAuth-based provider (Kiro-style)
interface OAuthProvider {
  providerType: "kiro";
  authMode: "oauth";
  kiroRegion: string;
  // OAuth flow handled separately
}
```

### Protocol Translation

If the provider uses OpenAI format but you receive Anthropic format:

```typescript
// Request: Anthropic → OpenAI
{
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [...],
  system: "You are helpful."
}
// ↓ Translate to ↓
{
  model: "provider-model-id",
  max_tokens: 1024,
  messages: [...],
  system: "You are helpful."
}
```

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Feel free to contribute improvements to documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
