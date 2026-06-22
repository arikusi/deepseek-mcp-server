# DeepSeek MCP Server

## Tagline
Use DeepSeek V4 models (v4-flash & v4-pro) from any MCP client with sessions, fallback & cost tracking.

## Description
MCP Server for DeepSeek API integration that enables Claude Code, Gemini CLI, and other MCP-compatible clients to use DeepSeek models for chat and reasoning. Supports multi-turn conversation sessions, function calling, thinking mode, JSON output, model fallback with circuit breaker protection, and real-time cost tracking. Available as both a local stdio server and a hosted remote endpoint (BYOK).

## Setup Requirements
- `DEEPSEEK_API_KEY` (required): Your DeepSeek API key. Sign up and generate one at https://platform.deepseek.com
- `DEFAULT_MODEL` (optional): Default model. Options: `deepseek-v4-flash` or `deepseek-v4-pro` (`deepseek-chat` / `deepseek-reasoner` accepted as aliases). Default: `deepseek-v4-flash`.
- `DEEPSEEK_BASE_URL` (optional): Custom API base URL for proxies or compatible endpoints. Default: `https://api.deepseek.com`.
- `FALLBACK_ENABLED` (optional): Enable automatic model fallback on failures. Default: `true`.
- `SESSION_TTL_MINUTES` (optional): Session expiry time in minutes. Default: `30`.

## Category
AI & ML

## Features
- Chat with DeepSeek V4 models (deepseek-v4-flash and deepseek-v4-pro, 1M context)
- Multi-turn conversation sessions with automatic context management
- Function calling / tool use support (up to 128 tool definitions)
- Thinking mode for step-by-step reasoning (optional on any V4 model)
- JSON output mode for structured responses
- Automatic model fallback with circuit breaker protection
- Real-time cost tracking with cache hit/miss breakdown
- 12 built-in prompt templates for debugging, code review, research, and more
- MCP resources for model info, server config, and usage statistics
- Remote hosted endpoint (BYOK) — no local install needed
- Docker support with health checks
- Session management with configurable TTL, max sessions, and sliding message window

## Getting Started
- "Ask DeepSeek to review this code for security issues"
- "Start a multi-turn debugging session with DeepSeek Reasoner"
- "Compare the cost of using deepseek-chat vs deepseek-reasoner for this task"
- Tool: deepseek_chat — Send messages to DeepSeek models with optional sessions, thinking mode, function calling, and JSON output
- Tool: deepseek_sessions — List, clear, or delete multi-turn conversation sessions
- Resource: deepseek://models — View available models with capabilities and pricing
- Resource: deepseek://usage — Check real-time token usage and cost statistics

## Tags
deepseek, ai, llm, mcp, chat, reasoner, function-calling, multi-turn, sessions, cost-tracking, circuit-breaker, thinking-mode, typescript, claude-code, gemini-cli

## Documentation URL
https://github.com/arikusi/deepseek-mcp-server#readme

## Health Check URL
https://deepseek-mcp.tahirl.com/health
