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

- **1.0.3** (2025-02-07): Cost tracking and prompt templates
- **1.0.0** (2025-01-13): Initial public release
- **0.1.0** (Development): Internal development version

## Links

- [npm package](https://www.npmjs.com/package/@arikusi/deepseek-mcp-server)
- [GitHub repository](https://github.com/arikusi/deepseek-mcp-server)
- [Issue tracker](https://github.com/arikusi/deepseek-mcp-server/issues)

[Unreleased]: https://github.com/arikusi/deepseek-mcp-server/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v1.0.3
[1.0.0]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v1.0.0
[0.1.0]: https://github.com/arikusi/deepseek-mcp-server/releases/tag/v0.1.0
