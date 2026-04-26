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

## Issue 报告指南

### 提交 Bug 报告前的检查清单

在提交 Bug 报告之前，请先完成以下检查：

1. **确认使用最新版本**：运行 `npm list claude-api-hub` 或检查当前安装的版本号，确保问题在最新版本中仍然存在
2. **搜索已有 Issue**：在 [GitHub Issues](https://github.com/LeenixP/claude-api-hub/issues) 中搜索关键词，确认该问题未被报告过
3. **收集环境信息**：记录你的操作系统、Node.js 版本（`node -v`）、npm 版本（`npm -v`）以及项目版本
4. **尝试最小复现**：剥离无关代码，确认问题可以用最小配置复现

### Bug 报告模板

```markdown
## 问题描述
清晰简洁地描述 Bug 是什么。

## 复现步骤
1. 执行 '...'
2. 配置 '...'
3. 发送请求到 '...'
4. 出现错误

## 期望行为
描述你期望发生的结果。

## 实际行为
描述实际发生的结果，包括完整的错误信息。

## 环境信息
- OS: [例如 Ubuntu 22.04, macOS 14]
- Node.js 版本: [例如 22.4.0]
- claude-api-hub 版本: [例如 6.3.0]
- 安装方式: [npm / 源码 / Docker]

## 日志
请提供相关的日志输出（注意脱敏 API Key）：
```
[粘贴日志]
```

## 附加信息
- 是否可稳定复现：是 / 否
- 是否已尝试回退到旧版本测试：是 / 否
```

### 功能请求模板

```markdown
## 使用场景
描述你遇到什么问题，或者什么场景下需要这个功能。

## 期望行为
清晰描述你希望功能如何工作。

## 替代方案
描述你目前使用的替代方案（如果有）。

## 是否愿意提交 PR
- [ ] 我愿意为此功能提交 PR
- [ ] 我愿意协助测试
- [ ] 需要维护者实现
```

## 发布流程

以下步骤供项目维护者参考：

1. **更新 CHANGELOG**：在 `CHANGELOG.md` 顶部添加新版本条目，分类记录 Added / Changed / Deprecated / Removed / Fixed / Security
2. **更新版本号**：修改 `package.json` 中的 `version` 字段，遵循 [Semantic Versioning](https://semver.org/)
3. **运行测试**：确保全部测试通过
   ```bash
   npm test
   ```
4. **构建项目**：
   ```bash
   npm run build
   ```
5. **创建 git tag**：
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```
6. **推送代码和 tag**：
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```
7. **自动发布**：GitHub Actions 会在 tag 推送后自动执行发布流程（如已配置）

## 安全报告

**请勿在公开 Issue 中披露安全漏洞。**

如果你发现了安全问题，请通过以下方式私下报告：

- **邮箱**：leenixp@gmail.com
- **承诺**：维护者将在 **48 小时内**回复确认收到报告
- **请包含**：漏洞描述、复现步骤、潜在影响评估

更多安全相关信息请参阅 [SECURITY.md](./SECURITY.md)。

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
