# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.1.1] - 2026-04-24

### Added
- Docker support: Dockerfile, docker-compose.yml, .dockerignore
- JSON Schema for config validation (`config/providers.schema.json`)
- `.env.example` for environment variable reference
- Named constants file (`src/constants.ts`) replacing all magic numbers
- Config validation: 10+ new rules (enabled providers, rate limits, CORS, timeouts)
- Gzip/deflate response compression for JSON and HTML
- ETag + Cache-Control headers for dashboard
- Per-host HTTPS connection pooling with keep-alive
- SSE reconnection jitter (±25%) to prevent thundering herd
- Canvas chart performance: requestAnimationFrame + change detection
- Loading skeleton with API Hub branding on initial load
- Keyboard shortcuts: `?` help dialog, `1-5` page navigation, `Esc` close
- Dynamic page titles (`Dashboard — API Hub`)
- Scroll-to-top floating button
- Custom checkbox styling
- Password and API key show/hide toggle (eye icon)
- Toast notifications with progress bar and hover-to-pause
- Select dropdown search/filter for 8+ options
- Provider card "last used" relative timestamp
- Relative timestamps throughout (logs, charts)
- Version number links to GitHub Releases
- Welcome banner with gateway URL and setup steps
- Global JS error handler for debugging

### Changed
- **Dashboard redesign**: unified single-accent color scheme (GitHub Dark style), cleaner stat cards, theme-aware canvas charts, cohesive spacing
- **Config page rewrite**: clearer Form/JSON mode toggle, section descriptions, merged redundant cards, removed confusing syntax highlighting, proper spacing
- **Logs page rewrite**: simplified toolbar (removed fake File Log/Auto-scroll buttons), cleaner log rows, Clear All now instantly clears UI
- **Login page**: white card on dark background for maximum contrast
- Removed Guide page (content merged into Dashboard welcome banner)
- Dark theme colors refined for better contrast and cohesion
- Border radius reduced from 12px to 8px for modern feel
- GuidePage now shows dynamic port from config (was hardcoded 3456)

### Fixed
- **Critical: TDZ error** — keyboard shortcut useEffect referenced `navigate` before declaration, causing blank page
- LogPanel "Clear" button now properly clears server logs (was only clearing search)
- ProviderModal prefix field now correctly parses comma-separated arrays
- ConfigEditor OAuth check no longer loops on mount
- Login now directly fetches config (no manual refresh needed)
- Clear All logs now instantly clears frontend SSE buffer

## [2.0.0] - 2026-04-23

### Added
- SSE real-time push via `/api/events` endpoint (EventBus)
- Multi-key pool with round-robin rotation and auto-recovery (KeyPool)
- Fallback chain: auto-route to backup provider when primary is unhealthy
- Rate tracker with QPS/RPM/TPS metrics via `/api/stats` endpoint
- Management panel navigation tabs (Dashboard, Config Editor, Setup Guide)
- JSON config editor with validation and import/export (`/api/config/import`)
- Per-tier timeout configuration via `/api/tier-timeouts`
- Password login portal with auth banner (`/api/auth/login`)
- Kiro Provider: use Kiro OAuth to call Claude via AWS CodeWhisperer
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
