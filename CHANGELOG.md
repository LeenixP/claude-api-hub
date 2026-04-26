# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.3.0] - 2026-04-26

### Added
- Config schema system (`src/config-schema.ts`) — single source of truth for all parameters
- Auto-clean: deprecated keys removed, missing keys filled with defaults on startup
- Config backup before update, auto-restore on update failure
- 106 new tests (377 → 483), coverage thresholds set to 70%

### Changed
- Config file no longer shipped in npm package — user data never touched by updates
- Config stored exclusively in `~/.claude-api-hub/providers.json` (0600 permissions)
- First startup auto-creates a clean default config
- Config save/import now uses schema-driven allowed keys

### Removed
- `defaultProvider` — router auto-selects first healthy enabled provider
- `config/providers.json` from npm package distribution
- `configVersion` migration system (replaced by schema-driven normalization)

### Fixed
- Update no longer wipes provider configuration
- Select dropdown z-index clipping in dashboard cards

## [6.2.0] - 2026-04-26

### Added
- Dashboard: Model Details table with search, sort, and pagination
- Dashboard: Token heatmap tooltip on hover (date, tokens, request count)
- Dashboard: Token values now display in K/M format throughout
- New `form-select` CSS class for consistent select styling across the UI

### Changed
- Dashboard: Provider bar chart limits to top 5 + "Other" aggregation
- Dashboard: Top Models limits to top 5 + "Other" aggregation
- Provider filter and sort selects now use custom Select component (no native dropdown flicker)
- Alias test button text: "测试别名" → "测试映射链路"

### Fixed
- Select dropdown clipping when positioned above the trigger element
- Dashboard card heights no longer extend indefinitely with many items

## [6.0.0] - 2026-04-25

### Added
- Complete English documentation (README.en.md)
- Screenshot placeholders in both Chinese and English READMEs
- `docs/images/` directory for dashboard screenshots

### Changed
- Updated LICENSE copyright year to 2025-2026
- Added README.en.md to npm package files
- Untracked built static/style.css from git

### Removed
- Removed built artifacts (static/style.css) from git tracking

## [5.1.1] - 2026-04-24

### Fixed
- `.dockerignore` was excluding tsconfig.json and build config files
- `.dockerignore` was excluding package-lock.json and src dirs needed for build

## [5.1.0] - 2026-04-24

### Added
- Dashboard redesign with improved UX
- Docker support with multi-stage build
- 50+ improvements from community feedback

### Fixed
- Data persistence: load SQLite history on startup
- Fix alias save sync issues
- Prevent masked API keys from overwriting real keys on config save

## [4.0.1] - 2026-04-24

### Fixed
- Config save endpoint reliability
- OAuth refresh UI improvements
- Coverage threshold tuning
- Default config cleanup

## [4.0.0] - 2026-04-24

### Added
- Full UI redesign with modern components
- Protocol improvements for better compatibility
- Kiro OAuth integration
- Enhanced security features

### Changed
- Improved request routing logic
- Better error handling and messages

## [3.0.0] - 2026-04-24

### Added
- Kiro OAuth web authorization flow
- Token auto-refresh mechanism
- Config UI mode (dual-mode: UI/JSON)
- Provider test endpoint

### Fixed
- Missing closing div in dashboard section
- Rewrite boot flow for 30min session expiry
- Reliable login page display

### Changed
- Text contrast improvements
- Minimum font sizes bumped to 13px
- Password portal replacing adminToken

## [2.0.0] - 2026-04-23

### Added
- Comprehensive test suite (100+ tests)
- Full documentation overhaul
- Management panel with navigation tabs
- Config editor with live validation
- Setup guide with interactive walkthrough

### Changed
- Architecture upgrade for scalability
- Improved logging system

## [1.x.x] - Earlier Releases

### Added
- SSE real-time push for dashboard updates
- Multi-key pool with round-robin rotation
- Fallback chain for provider failover
- Rate tracker for monitoring
- Kiro Provider (AWS Q/CodeWhisperer integration)
- Password login portal
- Provider factory registry pattern
- CLI args and port error handling
- Crash protection and shutdown guard
- File-based request logging with rotation
- Per-tier timeout configuration
- Session-based admin authentication
- Security headers (CSP, X-Frame-Options, etc.)

[6.0.0]: https://github.com/LeenixP/claude-api-hub/releases/tag/v6.0.0
[5.1.1]: https://github.com/LeenixP/claude-api-hub/releases/tag/v5.1.1
[5.1.0]: https://github.com/LeenixP/claude-api-hub/releases/tag/v5.1.0
[4.0.1]: https://github.com/LeenixP/claude-api-hub/releases/tag/v4.0.1
[4.0.0]: https://github.com/LeenixP/claude-api-hub/releases/tag/v4.0.0
[3.0.0]: https://github.com/LeenixP/claude-api-hub/releases/tag/v3.0.0
[2.0.0]: https://github.com/LeenixP/claude-api-hub/releases/tag/v2.0.0
