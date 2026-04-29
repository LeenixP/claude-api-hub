# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 6.x     | :white_check_mark: |
| < 6.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: leenixp@gmail.com
3. Include: description, steps to reproduce, potential impact
4. You will receive a response within 48 hours

## Security Features

- ANTHROPIC_AUTH_TOKEN proxy authentication via `x-api-key` header (timing-safe comparison)
- Admin token authentication for management API (timing-safe comparison)
- Per-IP sliding window rate limiting with login lockout protection
- CORS origin restriction (defaults to localhost)
- Content Security Policy (CSP) headers — no unsafe-inline for scripts
- Environment variable interpolation whitelist
- API keys masked in all responses and logs
- API key state file hardened with chmod 0o600, keys stored as hashed identifiers
- Request body size limits (10MB inbound, 50MB upstream)
- Stream timeout and idle timeout controls
- Header forwarding whitelist (prevents header injection to upstream providers)
- Security response headers (X-Content-Type-Options, X-Frame-Options, HSTS)
- SSRF protection for external provider URLs (blocks 10.x, 172.16-31.x; allows local/LAN/Tailscale by design)

## Best Practices

- Set `ANTHROPIC_AUTH_TOKEN` environment variable for proxy authentication (recommended)
- Or set `adminToken` in config / `ADMIN_TOKEN` env var for x-hub-token authentication
- Configure `corsOrigins` explicitly for production
- Set `rateLimitRpm` to prevent abuse
- Bind to `127.0.0.1` instead of `0.0.0.0` if not using a reverse proxy
- Use HTTPS via a reverse proxy (nginx, Caddy) in production
