# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Nothing yet

### Changed
- Nothing yet

### Fixed
- Nothing yet

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

- **1.1.1** (2026-02-11): Modular architecture, type safety, security fixes, 126 tests
- **1.1.0** (2026-02-10): Function calling, config system, test suite
- **1.0.3** (2025-02-07): Cost tracking and prompt templates
- **1.0.0** (2025-01-13): Initial public release
- **0.1.0** (Development): Internal development version

## Links

- [npm package](https://www.npmjs.com/package/@arikusi/deepseek-mcp-server)
- [GitHub repository](https://github.com/arikusi/deepseek-mcp-server)
- [Issue tracker](https://github.com/arikusi/deepseek-mcp-server/issues)

[Unreleased]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v1.0.3
[1.0.0]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v1.0.0
[0.1.0]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v0.1.0
