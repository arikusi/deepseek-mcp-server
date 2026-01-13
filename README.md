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

> **⚠️ Note**: This is an unofficial community project and is not affiliated with DeepSeek.

## ⚡ Quick Start

### For Claude Code

```bash
# Install and configure in one step
claude mcp add deepseek npx @arikusi/deepseek-mcp-server

# Enter your DeepSeek API key when prompted
```

### For Gemini CLI

```bash
# Install and configure with API key
gemini mcp add deepseek npx @arikusi/deepseek-mcp-server -e DEEPSEEK_API_KEY=your-key-here
```

**Get your API key:** [https://platform.deepseek.com](https://platform.deepseek.com)

That's it! Your MCP client can now use DeepSeek models! 🎉

---

## Features

- 🤖 **DeepSeek Chat**: Fast and capable general-purpose model
- 🧠 **DeepSeek Reasoner (R1)**: Advanced reasoning with chain-of-thought explanations
- 🔄 **Streaming Support**: Real-time response generation
- 🛡️ **Type-Safe**: Full TypeScript implementation
- 🎯 **MCP Compatible**: Works with any MCP-compatible CLI (Claude Code, Gemini CLI, etc.)

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

**Note**: Config file location varies by client (e.g., `~/.claude/mcp_settings.json` for Claude Code).

## Available Tools

### `deepseek_chat`

Chat with DeepSeek AI models.

**Parameters:**

- `messages` (required): Array of conversation messages
  - `role`: "system" | "user" | "assistant"
  - `content`: Message text
- `model` (optional): "deepseek-chat" (default) or "deepseek-reasoner"
- `temperature` (optional): 0-2, controls randomness (default: 1.0)
- `max_tokens` (optional): Maximum tokens to generate
- `stream` (optional): Enable streaming mode (default: false)

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

## Development

### Project Structure

```
deepseek-mcp-server/
├── src/
│   ├── index.ts           # Main MCP server
│   ├── deepseek-client.ts # DeepSeek API wrapper
│   └── types.ts           # TypeScript definitions
├── dist/                  # Compiled JavaScript
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

Make sure you've set your API key in the MCP settings `env` section or as an environment variable.

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

- 📖 [Documentation](https://github.com/arikusi/deepseek-mcp-server#readme)
- 🐛 [Bug Reports](https://github.com/arikusi/deepseek-mcp-server/issues)
- 💬 [Discussions](https://github.com/arikusi/deepseek-mcp-server/discussions)
- 📧 Contact: [GitHub Issues](https://github.com/arikusi/deepseek-mcp-server/issues)

## Resources

- [DeepSeek Platform](https://platform.deepseek.com) - Get your API key
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [DeepSeek API Documentation](https://api-docs.deepseek.com) - API reference

## Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Uses [OpenAI SDK](https://github.com/openai/openai-node) for API compatibility
- Created for the MCP community

---

**Made with ❤️ by [@arikusi](https://github.com/arikusi)**

This is an unofficial community project and is not affiliated with DeepSeek.
