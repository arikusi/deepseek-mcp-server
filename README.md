# DeepSeek MCP Server

[![npm version](https://img.shields.io/npm/v/@arikusi/deepseek-mcp-server.svg)](https://www.npmjs.com/package/@arikusi/deepseek-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@arikusi/deepseek-mcp-server.svg)](https://www.npmjs.com/package/@arikusi/deepseek-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@arikusi/deepseek-mcp-server.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Build Status](https://github.com/arikusi/deepseek-mcp-server/workflows/CI/badge.svg)](https://github.com/arikusi/deepseek-mcp-server/actions)

A Model Context Protocol (MCP) server that integrates DeepSeek AI models with MCP-compatible clients. Access DeepSeek's powerful chat and reasoning models directly from your development environment.

**Compatible with:**
- Claude Code CLI
- Gemini CLI (if MCP support is available)
- Any MCP-compatible client

> **Note**: This is an unofficial community project and is not affiliated with DeepSeek.

## Quick Start

### For Claude Code

```bash
# Install and configure with API key (available in all projects)
claude mcp add -s user deepseek npx @arikusi/deepseek-mcp-server -e DEEPSEEK_API_KEY=your-key-here

# Or install for current project only
claude mcp add deepseek npx @arikusi/deepseek-mcp-server -e DEEPSEEK_API_KEY=your-key-here
```

**Scope options:**
- `-s user`: Available in all your projects (recommended)
- `-s local`: Only in current project (default)
- `-s project`: Project-specific `.mcp.json` file

### For Gemini CLI

```bash
# Install and configure with API key
gemini mcp add deepseek npx @arikusi/deepseek-mcp-server -e DEEPSEEK_API_KEY=your-key-here
```

**Get your API key:** [https://platform.deepseek.com](https://platform.deepseek.com)

That's it! Your MCP client can now use DeepSeek models!

---

## Features

- **DeepSeek Chat**: Fast and capable general-purpose model
- **DeepSeek Reasoner (R1)**: Advanced reasoning with chain-of-thought explanations
- **Function Calling**: OpenAI-compatible tool use with up to 128 tool definitions
- **Cost Tracking**: Automatic cost calculation for every request (USD)
- **Configurable**: Environment-based configuration with validation
- **12 Prompt Templates**: Pre-built templates for debugging, code review, function calling, and more
- **Streaming Support**: Real-time response generation
- **Tested**: 85 tests with 80%+ code coverage
- **Type-Safe**: Full TypeScript implementation
- **MCP Compatible**: Works with any MCP-compatible CLI (Claude Code, Gemini CLI, etc.)

## Installation

### Prerequisites

- Node.js 18+
- A DeepSeek API key (get one at [https://platform.deepseek.com](https://platform.deepseek.com))

### Manual Installation

If you prefer to install manually:

```bash
npm install -g @arikusi/deepseek-mcp-server
```

### From Source

1. **Clone the repository**

```bash
git clone https://github.com/arikusi/deepseek-mcp-server.git
cd deepseek-mcp-server
```

2. **Install dependencies**

```bash
npm install
```

3. **Build the project**

```bash
npm run build
```

## Usage

Once configured, your MCP client will have access to the `deepseek_chat` tool and can use DeepSeek models.

**Example prompts:**
```
"Use DeepSeek to explain quantum computing"
"Ask DeepSeek Reasoner to solve: If I have 10 apples and buy 5 more..."
```

Your MCP client will automatically call the `deepseek_chat` tool.

### Manual Configuration (Advanced)

If your MCP client doesn't support the `add` command, manually add to your config file:

```json
{
  "mcpServers": {
    "deepseek": {
      "command": "npx",
      "args": ["@arikusi/deepseek-mcp-server"],
      "env": {
        "DEEPSEEK_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Config file locations:**
- **Claude Code**: `~/.claude.json` (add to `projects["your-project-path"].mcpServers` section)
- **Other MCP clients**: Check your client's documentation for config file location

## Available Tools

### `deepseek_chat`

Chat with DeepSeek AI models with automatic cost tracking and function calling support.

**Parameters:**

- `messages` (required): Array of conversation messages
  - `role`: "system" | "user" | "assistant" | "tool"
  - `content`: Message text
  - `tool_call_id` (optional): Required for tool role messages
- `model` (optional): "deepseek-chat" (default) or "deepseek-reasoner"
- `temperature` (optional): 0-2, controls randomness (default: 1.0)
- `max_tokens` (optional): Maximum tokens to generate
- `stream` (optional): Enable streaming mode (default: false)
- `tools` (optional): Array of tool definitions for function calling (max 128)
- `tool_choice` (optional): "auto" | "none" | "required" | `{type: "function", function: {name: "..."}}`

**Response includes:**
- Content with formatting
- Function call results (if tools were used)
- Request information (tokens, model, cost in USD)
- Structured data with `cost_usd` and `tool_calls` fields

**Example:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Explain the theory of relativity in simple terms"
    }
  ],
  "model": "deepseek-chat",
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**DeepSeek Reasoner Example:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "If I have 10 apples and eat 3, then buy 5 more, how many do I have?"
    }
  ],
  "model": "deepseek-reasoner"
}
```

The reasoner model will show its thinking process in `<thinking>` tags followed by the final answer.

**Function Calling Example:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's the weather in Istanbul?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name"
            }
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

When the model decides to call a function, the response includes `tool_calls` with the function name and arguments. You can then send the result back using a `tool` role message with the matching `tool_call_id`.

## Available Prompts

Pre-built prompt templates for common tasks (12 total):

### Core Reasoning
- **debug_with_reasoning**: Debug code with step-by-step analysis
- **code_review_deep**: Comprehensive code review (security, performance, quality)
- **research_synthesis**: Research topics and create structured reports
- **strategic_planning**: Create strategic plans with reasoning
- **explain_like_im_five**: Explain complex topics in simple terms

### Advanced
- **mathematical_proof**: Prove mathematical statements rigorously
- **argument_validation**: Analyze arguments for logical fallacies
- **creative_ideation**: Generate creative ideas with feasibility analysis
- **cost_comparison**: Compare LLM costs for tasks
- **pair_programming**: Interactive coding with explanations

### Function Calling
- **function_call_debug**: Debug function calling issues with tool definitions and messages
- **create_function_schema**: Generate JSON Schema for function calling from natural language

Each prompt is optimized for the DeepSeek Reasoner model to provide detailed reasoning.

## Models

### deepseek-chat

- **Best for**: General conversations, coding, content generation
- **Speed**: Fast
- **Context**: 64K tokens
- **Cost**: Most economical

### deepseek-reasoner (R1)

- **Best for**: Complex reasoning, math, logic problems, multi-step tasks
- **Speed**: Slower (shows thinking process)
- **Context**: 64K tokens
- **Special**: Provides chain-of-thought reasoning
- **Output**: Both reasoning process and final answer

## Configuration

The server is configured via environment variables. All settings except `DEEPSEEK_API_KEY` are optional.

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | (required) | Your DeepSeek API key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Custom API endpoint |
| `SHOW_COST_INFO` | `true` | Show cost info in responses |
| `REQUEST_TIMEOUT` | `60000` | Request timeout in milliseconds |
| `MAX_RETRIES` | `2` | Maximum retry count for failed requests |

**Example with custom config:**
```bash
claude mcp add -s user deepseek npx @arikusi/deepseek-mcp-server \
  -e DEEPSEEK_API_KEY=your-key \
  -e SHOW_COST_INFO=false \
  -e REQUEST_TIMEOUT=30000
```

## Development

### Project Structure

```
deepseek-mcp-server/
├── src/
│   ├── index.ts              # Main MCP server, tool & prompt registration
│   ├── deepseek-client.ts    # DeepSeek API wrapper (OpenAI SDK)
│   ├── config.ts             # Centralized config with Zod validation
│   ├── cost.ts               # Cost calculation and formatting
│   ├── schemas.ts            # Zod input validation schemas
│   ├── types.ts              # TypeScript type definitions
│   ├── config.test.ts        # Config tests
│   ├── cost.test.ts          # Cost tests
│   ├── schemas.test.ts       # Schema validation tests
│   ├── deepseek-client.test.ts    # Client tests
│   └── function-calling.test.ts   # Function calling tests
├── dist/                     # Compiled JavaScript
├── vitest.config.ts          # Test configuration
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
npm run build
```

### Watch Mode (for development)

```bash
npm run watch
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

### Testing Locally

```bash
# Set API key
export DEEPSEEK_API_KEY="your-key"

# Run the server
npm start
```

The server will start and wait for MCP client connections via stdio.

## Troubleshooting

### "DEEPSEEK_API_KEY environment variable is not set"

**Option 1: Use the correct installation command**
```bash
# Make sure to include -e flag with your API key
claude mcp add deepseek npx @arikusi/deepseek-mcp-server -e DEEPSEEK_API_KEY=your-key-here
```

**Option 2: Manually edit the config file**

If you already installed without the API key, edit your config file:

1. **For Claude Code**: Open `~/.claude.json` (Windows: `C:\Users\USERNAME\.claude.json`)
2. Find the `"mcpServers"` section under your project path
3. Add the `env` field with your API key:
```json
"deepseek": {
  "type": "stdio",
  "command": "npx",
  "args": ["@arikusi/deepseek-mcp-server"],
  "env": {
    "DEEPSEEK_API_KEY": "your-api-key-here"
  }
}
```
4. Save and restart Claude Code

### "Failed to connect to DeepSeek API"

1. Check your API key is valid
2. Verify you have internet connection
3. Check DeepSeek API status at [https://status.deepseek.com](https://status.deepseek.com)

### Server not appearing in your MCP client

1. Verify the path to `dist/index.js` is correct
2. Make sure you ran `npm run build`
3. Check your MCP client's logs for errors
4. Restart your MCP client completely

### Permission Denied on macOS/Linux

Make the file executable:

```bash
chmod +x dist/index.js
```

## Publishing to npm

To share this MCP server with others:

1. Run `npm login`
2. Run `npm publish --access public`

Users can then install with:

```bash
npm install -g @arikusi/deepseek-mcp-server
```

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting PRs.

### Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/arikusi/deepseek-mcp-server/issues/new/choose) using our templates.

### Development

```bash
# Clone the repo
git clone https://github.com/arikusi/deepseek-mcp-server.git
cd deepseek-mcp-server

# Install dependencies
npm install

# Build in watch mode
npm run watch

# Run tests
npm test

# Lint
npm run lint
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- [Documentation](https://github.com/arikusi/deepseek-mcp-server#readme)
- [Bug Reports](https://github.com/arikusi/deepseek-mcp-server/issues)
- [Discussions](https://github.com/arikusi/deepseek-mcp-server/discussions)
- Contact: [GitHub Issues](https://github.com/arikusi/deepseek-mcp-server/issues)

## Resources

- [DeepSeek Platform](https://platform.deepseek.com) - Get your API key
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [DeepSeek API Documentation](https://api-docs.deepseek.com) - API reference

## Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Uses [OpenAI SDK](https://github.com/openai/openai-node) for API compatibility
- Created for the MCP community

---

**Made by [@arikusi](https://github.com/arikusi)**

This is an unofficial community project and is not affiliated with DeepSeek.
