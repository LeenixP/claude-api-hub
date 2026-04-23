# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: leenixp@gmail.com
3. Include: description, steps to reproduce, potential impact
4. You will receive a response within 48 hours

## Security Features

- Admin token authentication for management API (timing-safe comparison)
- Per-IP sliding window rate limiting
- CORS origin restriction (defaults to localhost)
- Environment variable interpolation whitelist
- API keys masked in all responses and logs
- Request body size limits (10MB inbound, 50MB upstream)
- Stream timeout and idle timeout controls
- Security response headers (X-Content-Type-Options, X-Frame-Options)

## Best Practices

- Always set `adminToken` in production
- Configure `corsOrigins` explicitly
- Set `rateLimitRpm` to prevent abuse
- Bind to `127.0.0.1` instead of `0.0.0.0` if not using a reverse proxy
- Use HTTPS via a reverse proxy (nginx, Caddy) in production
