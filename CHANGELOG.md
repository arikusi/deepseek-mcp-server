# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-07-01

### Added
- **`deepseek_fim` tool: Fill-in-the-Middle completion.** Provide a `prompt` (prefix) and an optional `suffix`; the model completes the text in between. Built for code completion and content infilling. Runs against DeepSeek's Beta completions endpoint in non-thinking mode, with output capped at 4096 tokens. Supports `model`, `max_tokens`, `temperature`, and `stop`, with the same cache-aware cost tracking as `deepseek_chat`. On the npm/stdio server it also reuses the circuit breaker and model fallback (v4-flash <-> v4-pro). The `deepseek-chat` / `deepseek-reasoner` aliases resolve to v4-flash since FIM has no thinking mode.
- `deepseek_fim` is available on both the npm/stdio server and the hosted worker endpoint (`deepseek-mcp.tahirl.com`), which was bumped to 2.1.0 in step.
- `fim` capability listed on both models in the `deepseek://models` resource.

## [2.0.0] - 2026-06-22

### Changed
- **DeepSeek V4 migration.** `deepseek-v4-flash` (new default) and `deepseek-v4-pro` are now the primary models, both with 1M context and up to 384K output tokens. `deepseek-chat` and `deepseek-reasoner` are kept as backward-compatible aliases that resolve to `deepseek-v4-flash` (chat maps to non-thinking, reasoner to thinking). The DeepSeek API retires those two names on 2026-07-24, so the server translates them before sending the request.
- **Default model is now `deepseek-v4-flash`** (was `deepseek-chat`). Direct v4 calls default to non-thinking for fast responses; enable reasoning with `thinking: {type: "enabled"}` or the `deepseek-reasoner` alias. The V4 API defaults thinking to enabled, so the server now always sends an explicit thinking flag.
- V4 pricing per 1M tokens: v4-flash `$0.0028` cache hit / `$0.14` cache miss / `$0.28` output; v4-pro `$0.003625` / `$0.435` / `$0.87`.
- `max_tokens` upper bound raised to 384000.
- Model fallback now pairs `deepseek-v4-flash` with `deepseek-v4-pro`.
- The hosted worker endpoint (`deepseek-mcp.tahirl.com`) was migrated to V4 as well.

### Added
- `reasoning_effort` parameter (`high` / `max`) for thinking mode.

### Fixed
- Declared `cost_usd` and `routed_from` in the `deepseek_chat` output schema. Strict MCP clients rejected every response under the SDK 1.29 structured-content validation because these fields were returned but not declared.

### Removed
- Stopped sending `frequency_penalty` / `presence_penalty`, which the V4 API deprecated and ignores.

## [1.8.0] - 2026-06-14

### Security
- **Missing authentication on the self-hosted HTTP endpoint.** In HTTP transport mode the server holds your `DEEPSEEK_API_KEY` and uses it for every `deepseek_chat` call, yet `POST /mcp` had no authentication and the server bound to `0.0.0.0`, so any client that could reach the port could initialize a session, enumerate tools, and invoke them. The defaults now bind to loopback and an optional bearer token guards the endpoint. Reported independently. Tracked as CVE-2026-55605 (GHSA-72f3-6w86-7rv3).

### Changed
- HTTP transport now binds to `127.0.0.1` by default (configurable via `HTTP_HOST`). The SDK's DNS rebinding protection is active on loopback. Binding to `0.0.0.0` without a token prints a startup security warning.
- `docker-compose.yml` publishes the port to `127.0.0.1` only, and the README's `docker run` example does the same.
- **Minimum Node.js is now 20.** Node 18 reached end of life in April 2025 and the test toolchain (vitest 4) no longer runs on it. The published package follows suit (`engines.node` is `>=20.0.0`); CI tests on Node 20, 22, and 24.

### Added
- `HTTP_AUTH_TOKEN`: when set, `POST/GET/DELETE /mcp` require `Authorization: Bearer <token>` (constant-time comparison). `/health` stays open for probes.
- `HTTP_ALLOWED_HOSTS`: comma-separated allowed `Host` headers, keeping DNS rebinding protection when binding to `0.0.0.0`.
- `SECURITY.md` with the disclosure policy and self-hosted HTTP hardening guidance.
- Auth and host-binding tests (`src/transport-auth.test.ts`).

### Fixed
- Bumped `@modelcontextprotocol/sdk` to 1.29.0 and `vitest`/`@vitest/coverage-v8` to 4.1.8, clearing all transitive `npm audit` advisories (13 to 0).

## [1.7.0] - 2026-04-22

### Security
- **Cross-session data exposure in HTTP transport (high severity).** The `SessionStore` was a process-wide singleton shared across all connected HTTP clients. In HTTP transport mode, any client that provided another client's `session_id` to `deepseek_chat` would read that client's conversation history. The `deepseek_sessions` tool compounded this by letting any client enumerate all active session IDs (`list`), delete any session (`delete`), or wipe every tenant's sessions at once (`clear`). STDIO transport was unaffected because each STDIO client runs its own server process. Tracked as CVE-2026-55604 (GHSA-fh3r-g96v-f578).

### Changed
- **BREAKING (HTTP transport only).** Each HTTP session now gets an isolated `SessionStore` instance. Conversation history, session listings, and session deletion are scoped to the HTTP session that created them. Clients on the same server no longer share session state.
- `SessionStore` is no longer a singleton. `SessionStore.getInstance()` and `SessionStore.resetInstance()` have been removed. Construct instances with `new SessionStore()` and pass them explicitly to `registerChatTool`, `registerSessionsTool`, and `registerAllTools`.
- `UsageTracker.getStats().activeSessions` is wired to the STDIO store via `UsageTracker.setSessionSource()`. In HTTP transport it reports `0` by design — a process-wide count across isolated stores would be both meaningless and a minor cross-tenant information leak.

### Added
- `SessionStore` isolation tests: independent instances, no shared state, no cross-store effects on `clear`/`delete`/`list`.
- HTTP transport integration test (`src/transport-isolation.test.ts`) proving each `serverFactory` invocation produces a fresh store and that user-supplied `session_id` collisions across HTTP sessions do not merge data.

## [1.6.0] - 2026-03-17

### Added
- Transparent reasoner routing: all `deepseek-reasoner` requests are now routed through `deepseek-chat` + thinking mode for full feature support including function calling
- Model-aware parameter filtering prevents sending unsupported sampling params to thinking mode

### Fixed
- Function calling now works with `deepseek-reasoner` (via transparent routing to `deepseek-chat` + thinking)
- Sampling parameters (temperature, top_p, frequency_penalty, presence_penalty) properly filtered for reasoning requests
- Thinking parameter now passed as top-level property instead of extra_body (OpenAI SDK v6 compatibility)
- Corrected model capabilities in `deepseek://models` resource

### Changed
- `deepseek-reasoner` capability list updated: added `function_calling`, removed `thinking_mode`
- Both `deepseek-chat` and `deepseek-reasoner` run DeepSeek V3.2. The reasoner model is now transparently handled as `deepseek-chat` with `thinking: {type: "enabled"}`, which provides identical reasoning behavior plus function calling support

## [1.5.2] - 2026-03-11

### Fixed
- Worker hang on non-POST requests to `/mcp` endpoint. External GET requests caused the stateless MCP transport to hang indefinitely, triggering Cloudflare Worker "code hung" errors. Now returns 405 for non-POST methods.

### Changed
- Worker VERSION synced to 1.5.2
- Added `websiteUrl` to server.json

## [1.5.1] - 2026-03-09

### Fixed
- Update `@modelcontextprotocol/sdk` to ^1.27.1 to patch cross-client data leak vulnerability (CVE-2026-25536)
- Update `wrangler` to ^4.71.0 to patch OS command injection vulnerability (CVE-2026-0933)

### Changed
- Circuit breaker is now per-model instead of shared across all models. If one model becomes unhealthy, the other remains available independently.

## [1.5.0] - 2026-03-07

### Added
- **Remote Endpoint**: Hosted BYOK (Bring Your Own Key) endpoint at `https://deepseek-mcp.tahirl.com/mcp`. Users send their own DeepSeek API key as Bearer token — no server-side key stored.
- **Cloudflare Worker**: Stateless MCP server on Cloudflare Workers edge network. Zero cold start, global distribution, free tier (100K requests/day).
- **Remote Quick Start**: Claude Code, Cursor, Windsurf can connect to the remote endpoint with `--transport http` — no npm install or Node.js required.

### Changed
- README restructured: Remote (no install) as primary quick start, local stdio as secondary.
- server.json: Added streamableHttp transport package for remote endpoint.
- llms.txt/llms-full.txt: Updated with remote endpoint documentation.

## [1.4.3] - 2026-03-07

### Fixed
- **MCP Registry**: Shortened server.json description to meet 100-char limit

## [1.4.2] - 2026-03-07

### Added
- **Streamable HTTP Transport**: New `TRANSPORT=http` mode with Express-based Streamable HTTP server. Per-session McpServer instances with shared DeepSeekClient. Supports POST/GET/DELETE on `/mcp` endpoint and SSE streaming.
- **Health Endpoint**: `GET /health` returns server status, version, uptime, and transport type.
- **Docker Support**: Multi-stage `Dockerfile`, `docker-compose.yml`, and `.dockerignore` for containerized deployment. Default transport is HTTP in Docker.
- **Docker CI**: GitHub Actions job for Docker build smoke test with health endpoint verification.
- **New Config Variables**: `TRANSPORT` (stdio|http, default: stdio), `HTTP_PORT` (default: 3000).
- **253 Tests**: Up from 241, with 12 new tests covering HTTP transport endpoints, config transport/port parsing, and session lifecycle.

### Changed
- Entry point (`index.ts`) now branches on `config.transport` — stdio (default) or HTTP mode.
- CI dist check includes `transport-http.js`.

## [1.4.1] - 2026-03-07

### Added
- **MCP Registry**: `mcpName` for official MCP Registry (registry.modelcontextprotocol.io) publishing
- **Glama Registry**: `glama.json` for glama.ai server listing
- **Smithery Compatibility**: CJS bundler fallback in `server.ts`, `createSandboxServer()` export

### Changed
- **server.json**: Updated to official MCP Registry schema format
- **README**: Added Glama badge

## [1.4.0] - 2026-03-07

### Added
- **Model-Aware Pricing**: `MODEL_PRICING` map with per-model pricing, `getPricing(model?)` helper. `calculateCost()` now accepts optional `model` parameter for accurate per-model cost calculation.
- **Multimodal Content Types**: `TextContentPart`, `ImageContentPart`, `ContentPart` types. Message `content` now supports `string | ContentPart[]` (OpenAI-compatible format).
- **Multimodal Schema Validation**: `ContentPartSchema` (discriminated union), `ContentSchema`, `ExtendedMessageSchema` with array content support.
- **ENABLE_MULTIMODAL Config**: Feature flag (default: `false`) to enable multimodal input. Rejects array content when disabled with clear error message.
- **getTextContent() Helper**: Extracts text from `string | ContentPart[]` for validation and JSON mode checks.
- **MCP Registry Metadata**: `server.json` file for official MCP Registry submission with tools, resources, prompts, and configuration metadata.
- **241 Tests**: Up from 212, with 29 new tests covering model-aware pricing, multimodal schemas, content part validation, getTextContent, multimodal guard, and array content validation.

### Changed
- **Flexible Fallback Chain**: `FALLBACK_ORDER` (Record<string, string[]>) replaces `FALLBACK_MODEL` — supports 3+ model fallback chains for future model additions.
- **Models Resource**: `buildModelsData()` now uses `getPricing()` from cost.ts instead of static pricing constants.
- **Tool Handler**: `calculateCost()` now receives `response.model` for model-aware pricing. `validateMessageLength` uses `getTextContent()` for multimodal content.
- **Config Resource**: Exposes `enableMultimodal` field.

## [1.3.3] - 2026-03-07

### Added
- **Streaming Fallback Tests**: 4 new tests covering streaming fallback success, both-models-fail, non-retryable skip, and disabled fallback scenarios
- **Configurable Circuit Breaker**: `CIRCUIT_BREAKER_THRESHOLD` (default: 5) and `CIRCUIT_BREAKER_RESET_TIMEOUT` (default: 30000ms) environment variables
- **Session Message Limit**: `MAX_SESSION_MESSAGES` (default: 200) environment variable prevents unbounded memory growth with sliding window eviction
- **212 Tests**: Up from 208, covering streaming fallback edge cases

### Fixed
- **Session Tool Calls**: `ChatMessage` interface now includes `tool_calls` field — multi-turn function calling no longer loses tool context between requests
- **Default Model Config**: `DEFAULT_MODEL` env variable now correctly applies to the `deepseek_chat` tool schema default value
- **Double Config Load**: Removed redundant `loadConfig()` call in `index.ts` — config is now loaded once and retrieved with `getConfig()`
- **Circuit Breaker Hardcoded Params**: Circuit breaker threshold and reset timeout are now read from config instead of being hardcoded (5, 30000)
- **Config Resource**: `deepseek://config` resource now exposes `circuitBreakerThreshold`, `circuitBreakerResetTimeout`, and `maxSessionMessages` fields

## [1.3.2] - 2026-03-06

### Changed
- **OpenAI SDK v6**: Upgraded from v4.104.0 to v6.27.0. No breaking changes for our usage — `chat.completions.create()` API unchanged.
- **Zod v4**: Upgraded from v3.25.76 to v4.3.6. Fixed `z.record()` call for v4 compatibility.
- **New Config**: `DEFAULT_MODEL` env variable (default: `deepseek-chat`) for configurable default model.
- **Keywords**: Added `gemini-cli`, `mcp-server` to npm package keywords.

## [1.3.1] - 2026-03-06

### Added
- **Test Coverage**: `deepseek_sessions` tool tests (8 tests, 0% → 90%+ coverage)
- **Test Coverage**: Tool registration aggregator tests (2 tests)
- **208 Tests**: Up from 198, covering session tool actions and tool registration

### Fixed
- **Security**: Updated transitive dependencies via `npm audit fix` — resolved 5 vulnerabilities (3 high) in hono, @hono/node-server, rollup, ajv, qs

## [1.3.0] - 2026-03-04

### Added
- **Multi-Turn Sessions**: `session_id` parameter on `deepseek_chat` for multi-turn conversations. Session history is stored in memory and automatically prepended to requests. Sessions have configurable TTL and max count.
- **Session Management Tool**: `deepseek_sessions` tool with `list`, `delete`, and `clear` actions for managing active sessions.
- **Circuit Breaker**: Protects against cascading API failures. After 5 consecutive failures, fast-fails for 30 seconds, then probes for recovery.
- **Model Fallback**: Automatic fallback between `deepseek-chat` and `deepseek-reasoner` on retryable errors (429, 503, timeout). Configurable via `FALLBACK_ENABLED`.
- **MCP Resources**: 3 read-only resources following MCP Resources spec:
  - `deepseek://models`: Model list with capabilities, context limits, and pricing
  - `deepseek://config`: Current server configuration (API key masked)
  - `deepseek://usage`: Real-time usage statistics (requests, tokens, costs, sessions)
- **Usage Tracker**: Global usage statistics tracking across all requests.
- **New Error Classes**: `FallbackExhaustedError`, `CircuitBreakerOpenError` for resilience error handling.
- **New Config**: `SESSION_TTL_MINUTES` (default: 30), `MAX_SESSIONS` (default: 100), `FALLBACK_ENABLED` (default: true).
- **198 Tests**: Up from 150, covering sessions, circuit breaker, fallback, and MCP resources.

### Changed
- `deepseek-client.ts` now wraps API calls in circuit breaker and supports automatic model fallback.
- `deepseek_chat` tool description updated to mention sessions, fallback, and circuit breaker.
- `tools/index.ts` now registers both `deepseek_chat` and `deepseek_sessions` tools.
- `index.ts` now registers MCP resources via `registerAllResources()`.

## [1.2.0] - 2026-02-26

### Added
- **Thinking Mode**: Enable thinking on deepseek-chat with `thinking: {type: "enabled"}` parameter. Automatically filters incompatible params (temperature, top_p, etc.) with logged warnings.
- **JSON Output Mode**: Structured JSON responses with `json_mode: true`. Supported by both models. Warns if "json" word missing from prompt.
- **Cache-Aware Cost Tracking**: V3.2 API returns `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`. Cost display now shows cache hit ratio and savings.
- **CostBreakdown Interface**: `calculateCost()` returns structured `{inputCost, outputCost, totalCost, cacheHitRatio?, cacheSavings?}` instead of flat number.

### Changed
- **DeepSeek V3.2 Pricing**: Unified pricing for both models — cache hit $0.028/1M, cache miss $0.28/1M, output $0.42/1M (replaces old per-model pricing).
- **max_tokens Limit**: Updated from 32768 to 65536 (reasoner max). Model-specific warnings: deepseek-chat warns above 8192, deepseek-reasoner warns above 65536.
- **Tool Description**: Updated to mention V3.2, thinking mode, JSON mode, and cache-aware cost tracking.
- **150 Tests**: Up from 126, covering thinking mode, JSON mode, cache tokens, and cost breakdown.

### Fixed
- **Incorrect Cost Reports**: Old flat pricing ($0.14/$0.28 chat, $0.55/$2.19 reasoner) replaced with accurate V3.2 unified pricing.

## [1.1.1] - 2026-02-11

### Added
- **Custom Error Classes** (`src/errors.ts`): `BaseError`, `ConfigError`, `ApiError`, `RateLimitError`, `AuthenticationError`, `ValidationError`, `ConnectionError` with error cause chaining
- **DeepSeek Type Extensions** (`src/types.ts`): `DeepSeekRawResponse`, `DeepSeekStreamChunk`, `DeepSeekStreamDelta` types and `hasReasoningContent()`, `getErrorMessage()` type guards
- **Message Content Length Limit**: `MAX_MESSAGE_LENGTH` config (default: 100K chars) prevents excessive API costs
- **Optional Connection Test**: `SKIP_CONNECTION_TEST=true` env skips startup API call for faster boot
- **AI Discoverability**: `llms.txt` and `llms-full.txt` for LLM/AI agent consumption
- **New Tests**: 126 tests (up from 85) covering errors, server factory, tool handlers, prompt registration

### Changed
- **Modular Architecture**: Monolithic `index.ts` (783 lines) split into focused modules:
  - `src/server.ts`: McpServer factory with auto-version from package.json
  - `src/tools/deepseek-chat.ts`: Tool handler (extracted from index.ts)
  - `src/tools/index.ts`: Tool registration aggregator
  - `src/prompts/core.ts`: 5 core reasoning prompts
  - `src/prompts/advanced.ts`: 5 advanced prompts
  - `src/prompts/function-calling.ts`: 2 function calling prompts
  - `src/prompts/index.ts`: Prompt registration aggregator
  - `src/index.ts`: Slim bootstrap (~80 lines)
- **DRY Refactoring** (`deepseek-client.ts`): Extracted `buildRequestParams()` and `wrapError()` methods (eliminated code duplication)
- **Type Safety**: Replaced 16 `any` casts with proper DeepSeek type extensions and type guards (`error: unknown` pattern)
- **Config**: `process.exit(1)` replaced with `throw ConfigError` for testability
- **Version**: Single source of truth from `package.json` via `createRequire` (no more manual sync)

### Fixed
- **Security**: Updated `@modelcontextprotocol/sdk` to fix cross-client data leak (GHSA-345p-7cg4-v4c7)
- **Security**: Fixed `hono` transitive dependency vulnerabilities (XSS, cache deception, IP spoofing)
- CI dist check updated for new file structure

## [1.1.0] - 2026-02-10

### Added
- **Function Calling Support**: Full OpenAI-compatible function calling via `tools` and `tool_choice` parameters
  - Define up to 128 tool definitions with JSON Schema parameters
  - Control tool behavior with `tool_choice`: auto, none, required, or specific function
  - Tool call results formatted in response with call IDs and arguments
  - Streaming + function calling works together (delta accumulation)
  - `tool` message role for sending tool results back
- **Centralized Config System** (`src/config.ts`)
  - Zod-validated configuration from environment variables
  - `DEEPSEEK_BASE_URL`: Custom API endpoint (default: `https://api.deepseek.com`)
  - `SHOW_COST_INFO`: Toggle cost display in responses (default: true)
  - `REQUEST_TIMEOUT`: API request timeout in ms (default: 60000)
  - `MAX_RETRIES`: Maximum API retry count (default: 2)
- **Test Suite**: 85 tests with Vitest
  - Config, Cost, Schemas, Client, and Function Calling tests
  - 80%+ code coverage with v8 provider
  - `npm test`, `npm run test:watch`, `npm run test:coverage` scripts
- **2 New Prompt Templates** (total: 12)
  - `function_call_debug`: Debug function calling issues
  - `create_function_schema`: Generate JSON Schema from natural language
- CI coverage job in GitHub Actions

### Changed
- **Project Structure**: Modularized codebase
  - `src/config.ts`: Centralized configuration
  - `src/cost.ts`: Cost calculation (extracted from index.ts)
  - `src/schemas.ts`: Zod validation schemas (extracted from index.ts)
- `DeepSeekClient` constructor now uses centralized config (no manual apiKey passing)
- Server version bumped to 1.1.0
- Updated `deepseek_chat` tool description to mention function calling

## [1.0.3] - 2025-02-07

### Added
- Cost tracking for API requests
  - Automatic cost calculation based on token usage
  - USD cost included in response output
  - Cost data available in `structuredContent.cost_usd`
- 10 MCP prompt templates for common reasoning tasks
  - `debug_with_reasoning`: Debug code with step-by-step analysis
  - `code_review_deep`: Comprehensive code review
  - `research_synthesis`: Research and synthesize information
  - `strategic_planning`: Create strategic plans with reasoning
  - `explain_like_im_five`: Explain complex topics simply
  - `mathematical_proof`: Prove mathematical statements
  - `argument_validation`: Analyze arguments for logical fallacies
  - `creative_ideation`: Generate creative ideas with feasibility analysis
  - `cost_comparison`: Compare LLM costs
  - `pair_programming`: Interactive coding assistant
- Enhanced response format with request information section
  - Token breakdown (prompt + completion)
  - Model name
  - Cost in USD

### Changed
- Updated DeepSeek Reasoner pricing to current rates ($0.55/$2.19 per 1M tokens)

## [1.0.0] - 2025-01-13

### Added
- Initial release of DeepSeek MCP Server
- Support for `deepseek-chat` model
- Support for `deepseek-reasoner` (R1) model with reasoning traces
- Streaming mode support
- Full TypeScript implementation with type safety
- OpenAI-compatible API client
- Comprehensive error handling
- MCP protocol compliance via stdio transport
- Tool: `deepseek_chat` for chat completions
- Environment variable configuration for API key
- Detailed documentation and examples
- MIT License

### Features
- **Models**:
  - deepseek-chat: Fast general-purpose model
  - deepseek-reasoner: Advanced reasoning with chain-of-thought
- **Parameters**:
  - temperature: Control randomness (0-2)
  - max_tokens: Limit response length
  - stream: Enable streaming mode
- **Output**:
  - Text content with formatting
  - Reasoning traces for R1 model
  - Token usage statistics
  - Structured response data

### Technical
- Built with @modelcontextprotocol/sdk v1.0.4
- Uses OpenAI SDK v4.77.3 for API compatibility
- Zod v3.24.1 for schema validation
- TypeScript v5.7.3
- Node.js 18+ required
- Stdio-based transport for process communication

## [0.1.0] - Development

### Added
- Initial project setup
- Basic MCP server structure
- DeepSeek API integration prototype

---

## Version History

- **1.5.2** (2026-03-11): Fix worker hang on non-POST /mcp requests, add registry badges
- **1.5.1** (2026-03-09): CVE patches, per-model circuit breaker
- **1.5.0** (2026-03-07): Cloudflare Workers remote endpoint (BYOK), deepseek-mcp.tahirl.com
- **1.4.3** (2026-03-07): MCP Registry description fix
- **1.4.2** (2026-03-07): Streamable HTTP transport, Docker support, health endpoint, 253 tests
- **1.4.1** (2026-03-07): MCP Registry, Glama registry, Smithery compatibility
- **1.4.0** (2026-03-07): Model-aware pricing, multimodal content types, flexible fallback chain, MCP Registry, 241 tests
- **1.3.3** (2026-03-07): Streaming fallback tests, session tool_calls fix, configurable circuit breaker, session message limit, 212 tests
- **1.3.2** (2026-03-06): OpenAI SDK v6, Zod v4, DEFAULT_MODEL config
- **1.3.1** (2026-03-06): Security fixes, session tool tests, 208 tests
- **1.3.0** (2026-03-04): Sessions, circuit breaker, model fallback, MCP resources, 198 tests
- **1.2.0** (2026-02-26): DeepSeek V3.2 support — thinking mode, JSON mode, cache-aware pricing, 150 tests
- **1.1.1** (2026-02-11): Modular architecture, type safety, security fixes, 126 tests
- **1.1.0** (2026-02-10): Function calling, config system, test suite
- **1.0.3** (2025-02-07): Cost tracking and prompt templates
- **1.0.0** (2025-01-13): Initial public release
- **0.1.0** (Development): Internal development version

## Links

- [npm package](https://www.npmjs.com/package/@arikusi/deepseek-mcp-server)
- [GitHub repository](https://github.com/arikusi/deepseek-mcp-server)
- [Issue tracker](https://github.com/arikusi/deepseek-mcp-server/issues)

[Unreleased]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.5.2...HEAD
[1.5.2]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.4.3...v1.5.0
[1.4.3]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v1.0.3
[1.0.0]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v1.0.0
[0.1.0]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v0.1.0
