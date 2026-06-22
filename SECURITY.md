# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:

https://github.com/arikusi/deepseek-mcp-server/security/advisories/new

Do not open a public issue for security problems. You will get an acknowledgement,
and once a fix ships the advisory is published with credit to the reporter (let us
know how you would like to be credited). Coordinated disclosure is appreciated.

## Supported versions

Always use the latest release. Two disclosed vulnerabilities affect older versions:
`>= 1.4.2, < 1.7.0` (cross-session data exposure in HTTP transport, CVE-2026-55604)
and `>= 1.4.2, < 1.8.0` (missing authentication on the self-hosted HTTP endpoint,
CVE-2026-55605). Both are fixed in 1.8.0 and later. Upgrade if you are on an earlier
version.

## Hardening self-hosted HTTP mode

The default `stdio` transport runs one process per client and has no network
surface. The optional HTTP transport (`TRANSPORT=http`) is different: the process
holds your `DEEPSEEK_API_KEY` and uses it for every `deepseek_chat` call, so any
client that can reach `POST /mcp` can invoke tools and spend that key.

The defaults are built to keep that endpoint closed unless you deliberately open it:

1. `HTTP_HOST` defaults to `127.0.0.1`. A plain run listens on loopback only, and the SDK's DNS rebinding protection is active. Nothing off the machine can reach it.
2. Set `HTTP_AUTH_TOKEN` to require `Authorization: Bearer <token>` on `/mcp`. `/health` stays open for probes. Binding to `0.0.0.0` without a token prints a startup warning.
3. Set `HTTP_ALLOWED_HOSTS` (comma-separated) to keep host-header validation when binding to `0.0.0.0`.
4. For internet-facing deployments, terminate TLS and authenticate at a reverse proxy in front of the server.

The bundled `Dockerfile` binds `0.0.0.0` inside the container because a published
port needs it; the bundled `docker-compose.yml` publishes to `127.0.0.1` only.
If you publish the port on a public interface, set `HTTP_AUTH_TOKEN`.

## Session isolation

Since 1.7.0, each HTTP MCP session gets its own `SessionStore`. Conversation
history, session listings, and deletions are scoped to the session that created
them, so one client cannot read, enumerate, or clear another client's sessions.
