# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Admin token authentication for management API endpoints
- Configurable CORS origins (replaces wildcard `*`)
- Rate limiting with configurable RPM (requests per minute)
- Stream timeout and idle timeout controls
- Upstream response body size limit
- HTTP connection pooling (keep-alive) for upstream requests
- Graceful shutdown with 30s timeout for in-flight requests
- Statistics cards on dashboard (total requests, success rate, avg latency, errors)
- Light/dark theme toggle with system preference detection
- Dashboard accessibility improvements (focus-visible, ARIA attributes)
- Responsive breakpoints for mobile devices
- Log search/filter functionality
- Comprehensive test coverage for config, providers, server, and translators
- CONTRIBUTING.md, CHANGELOG.md, CODE_OF_CONDUCT.md
- GitHub issue and PR templates
- CI workflow with lint, test, and build steps

### Changed
- StreamState now persists across chunks (fixes broken stream translation)
- Alias matching restricted to claude-* model names to prevent false matches
- Provider config reload is now atomic (replaceAll instead of clear+register)
- Request IDs use crypto.randomUUID() for better uniqueness
- Config validation: port range, URL format, logLevel, empty apiKey warnings
- Provider create/update APIs now whitelist allowed fields
- Tool call name uses overwrite instead of append across stream chunks

### Fixed
- Stream forwarding now propagates upstream HTTP status codes
- Empty choices array no longer causes TypeError in translateResponse
- Null usage field no longer causes TypeError
- is_error field from tool_result now passed through as [ERROR] prefix

## [1.0.1] - 2026-04-22

### Changed
- Version bump

## [1.0.0] - 2026-04-22

### Added
- Multi-provider API gateway with model routing
- Anthropic ↔ OpenAI protocol translation
- Alias mapping (haiku/sonnet/opus → any model)
- Web dashboard with provider management
- Request logging with file persistence option
- Provider health checking
- Environment variable interpolation in config
