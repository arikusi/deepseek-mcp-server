# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:

https://github.com/arikusi/deepseek-mcp-server/security/advisories/new

Do not open a public issue for security problems. You will get an acknowledgement,
and once a fix ships the advisory is published with credit to the reporter (let us
know how you would like to be credited). Coordinated disclosure is appreciated.

## Supported versions

Always use the latest release. Four disclosed vulnerabilities affect older versions:

| Affected | Issue | Fixed in |
|---|---|---|
| `>= 1.4.2, < 1.7.0` | Cross-session data exposure in HTTP transport (CVE-2026-55604, GHSA-fh3r-g96v-f578) | 1.7.0 |
| `>= 1.4.2, < 1.8.0` | Missing authentication on the self-hosted HTTP endpoint (CVE-2026-55605, GHSA-72f3-6w86-7rv3) | 1.8.0 |
| `>= 1.8.0, < 2.3.0` | DNS rebinding against the shipped Docker default, exposing the API key to unauthenticated tool calls (GHSA-pf89-39r3-75vq) | 2.3.0 |
| `>= 2.2.0, < 2.3.0` | `response_schema` ReDoS guard bypassed through `$ref` past the schema depth cap (GHSA-x8gc-v7v9-72wv) | 2.3.0 |

Upgrade if you are on an earlier version.

## Hardening self-hosted HTTP mode

The default `stdio` transport runs one process per client and has no network
surface. The optional HTTP transport (`TRANSPORT=http`) is different: the process
holds your `DEEPSEEK_API_KEY` and uses it for every `deepseek_chat` call, so any
client that can reach `POST /mcp` can invoke tools and spend that key.

The defaults are built to keep that endpoint closed unless you deliberately open it:

1. `HTTP_HOST` defaults to `127.0.0.1`. A plain run listens on loopback only, and the SDK's DNS rebinding protection is active. Nothing off the machine can reach it.
2. Set `HTTP_AUTH_TOKEN` to require `Authorization: Bearer <token>` on `/mcp`. `/health` stays open for probes.
3. Set `HTTP_ALLOWED_HOSTS` (comma-separated) to keep host-header validation when binding to `0.0.0.0`.
4. Since 2.3.0, binding `0.0.0.0` with neither of those two set is refused at startup rather than warned about, because that combination leaves the endpoint open to DNS rebinding. `HTTP_ALLOW_UNPROTECTED_BIND=true` overrides the refusal.
5. For internet-facing deployments, terminate TLS and authenticate at a reverse proxy in front of the server.

The bundled `Dockerfile` binds `0.0.0.0` inside the container because a published
port needs it, so since 2.3.0 the image also ships
`HTTP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1]` to keep the host-header check
installed. Publishing on loopback is not sufficient on its own: DNS rebinding
targets the loopback address your own browser can already reach. Publishing under
a real hostname? Add it to that list. Publishing on a public interface? Set
`HTTP_AUTH_TOKEN` as well.

## Session isolation

Since 1.7.0, each HTTP MCP session gets its own `SessionStore`. Conversation
history, session listings, and deletions are scoped to the session that created
them, so one client cannot read, enumerate, or clear another client's sessions.
