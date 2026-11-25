# DeepSeek MCP Server

## Tagline
Use DeepSeek V4.1 Flash and V4 Pro from any MCP client, with sessions, fallback and cost tracking.

## Description
MCP Server for DeepSeek API integration that enables Claude Code, Gemini CLI, and other MCP-compatible clients to use DeepSeek models for chat, reasoning and code completion. Supports multi-turn conversation sessions, function calling, thinking mode, JSON output with optional JSON Schema validation, fill-in-the-middle completion, model fallback with circuit breaker protection, and peak/off-peak aware cost tracking. Available as both a local stdio server and a hosted remote endpoint (BYOK).

## Setup Requirements
* `DEEPSEEK_API_KEY` (required): Your DeepSeek API key. Sign up and generate one at https://platform.deepseek.com
* `DEFAULT_MODEL` (optional): Default model. Options: `deepseek-flash` or `deepseek-v4-pro`. The legacy names `deepseek-v4-flash`, `deepseek-chat` and `deepseek-reasoner` are still accepted and resolve to `deepseek-flash`. Default: `deepseek-flash`.
* `DEEPSEEK_BASE_URL` (optional): Custom API base URL for proxies or compatible endpoints. Default: `https://api.deepseek.com`.
* `FALLBACK_ENABLED` (optional): Enable automatic model fallback on failures. Default: `true`.
* `SESSION_TTL_MINUTES` (optional): Session expiry time in minutes. Default: `30`.

## Category
AI & ML

## Features
* Chat with DeepSeek models: `deepseek-flash` (V4.1 Flash, the default) and `deepseek-v4-pro`, both with a 1M-token context
* Multi-turn conversation sessions with automatic context management
* Function calling / tool use support (up to 128 tool definitions)
* Thinking mode for step-by-step reasoning on either model, with `reasoning_effort` low, high or max
* JSON output mode, plus `response_schema` to validate the output against a JSON Schema
* Fill-in-the-middle code completion through the `deepseek_fim` tool
* Automatic model fallback with circuit breaker protection
* Cost tracking with cache hit/miss breakdown, priced at DeepSeek's peak or off-peak rate
* 12 built-in prompt templates for debugging, code review, research, and more
* MCP resources for model info, server config, and usage statistics
* Remote hosted endpoint (BYOK), no local install needed
* Docker support with health checks
* Session management with configurable TTL, max sessions, and sliding message window

## Getting Started
* "Ask DeepSeek to review this code for security issues"
* "Start a multi-turn debugging session with DeepSeek in thinking mode"
* "Compare the cost of deepseek-flash and deepseek-v4-pro for this task"
* Tool: deepseek_chat, send messages to DeepSeek models with optional sessions, thinking mode, function calling, JSON output and schema validation
* Tool: deepseek_fim, complete code or text between a prefix and a suffix
* Tool: deepseek_sessions, list, clear, or delete multi-turn conversation sessions
* Resource: deepseek://models, available models with capabilities and pricing
* Resource: deepseek://usage, token usage and cost statistics

## Tags
deepseek, ai, llm, mcp, chat, reasoner, function-calling, fim, code-completion, multi-turn, sessions, cost-tracking, circuit-breaker, thinking-mode, typescript, claude-code, gemini-cli

## Documentation URL
https://github.com/arikusi/deepseek-mcp-server#readme

## Health Check URL
https://deepseek-mcp.tahirl.com/health
