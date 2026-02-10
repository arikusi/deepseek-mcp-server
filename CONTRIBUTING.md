# Contributing to DeepSeek MCP Server

Thank you for your interest in contributing to DeepSeek MCP Server! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions. We're here to build something useful for the community.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, Node version, package version)
- **Relevant logs or error messages**
- **Code samples** if applicable

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) when available.

### Suggesting Enhancements

Enhancement suggestions are welcome! Please include:

- **Clear title and description** of the enhancement
- **Use cases** - why would this be useful?
- **Expected behavior** - how should it work?
- **Alternative solutions** you've considered
- **Additional context** - mockups, examples, etc.

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) when available.

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Write clear commit messages** (see guidelines below)
6. **Submit a pull request** with a clear description

#### Pull Request Guidelines

- **One feature/fix per PR** - keep PRs focused
- **Link related issues** using `Fixes #123` or `Relates to #456`
- **Include tests** for new functionality
- **Update CHANGELOG.md** under "Unreleased" section
- **Ensure CI passes** before requesting review
- **Respond to feedback** promptly and professionally

## Development Setup

### Prerequisites

- Node.js 18+
- Git
- TypeScript knowledge
- A DeepSeek API key for testing

### Setup Steps

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/deepseek-mcp-server.git
cd deepseek-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Watch for changes (development)
npm run watch

# Run type checking
npm run lint
```

### Project Structure

```
deepseek-mcp-server/
├── src/
│   ├── index.ts              # Main MCP server
│   ├── deepseek-client.ts    # DeepSeek API client
│   └── types.ts              # TypeScript types
├── dist/                     # Compiled output (git-ignored)
├── .github/                  # GitHub templates and workflows
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── README.md                 # Main documentation
├── CONTRIBUTING.md           # This file
├── CHANGELOG.md              # Version history
└── LICENSE                   # MIT License
```

## Coding Standards

### TypeScript

- Use **strict mode** - all types should be explicit
- Prefer **interfaces** over type aliases for object shapes
- Use **async/await** over raw promises
- Document complex functions with **JSDoc comments**
- Follow **functional programming** principles where appropriate

### Code Style

We use TypeScript's built-in formatter. Key points:

- **2 spaces** for indentation
- **Single quotes** for strings
- **Semicolons** required
- **Trailing commas** in multi-line structures
- **Meaningful variable names** - clarity over brevity

### Example

```typescript
/**
 * Creates a chat completion using DeepSeek API
 * @param params - Chat completion parameters
 * @returns Promise resolving to chat response
 */
async function createChatCompletion(
  params: ChatCompletionParams
): Promise<ChatCompletionResponse> {
  // Implementation
}
```

## Commit Message Guidelines

Write clear, concise commit messages that explain **what** changed and **why**.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### Examples

```
feat(client): add streaming support for chat completions

Implements streaming mode using OpenAI SDK's streaming API.
Returns full response after all chunks are collected.

Closes #42
```

```
fix(server): handle empty API responses gracefully

Previously crashed when DeepSeek returned empty choices array.
Now returns appropriate error message to client.

Fixes #38
```

## Testing

Currently, the project uses basic testing. We welcome contributions to improve test coverage!

### Running Tests

```bash
npm test
```

### Writing Tests

(TODO: Add testing framework and guidelines)

## Documentation

Good documentation is crucial! When contributing:

- **Update README.md** if you change user-facing behavior
- **Update CHANGELOG.md** for all notable changes
- **Add JSDoc comments** for public APIs
- **Include code examples** where helpful
- **Keep it concise** but complete

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Commit: `chore(release): v1.x.x`
4. Tag: `git tag v1.x.x`
5. Push: `git push origin main --tags`
6. Publish: `npm publish --access public`
7. Create GitHub release

## Getting Help

- Read the [README](README.md)
- Check [existing issues](https://github.com/arikusi/deepseek-mcp-server/issues)
- Start a [discussion](https://github.com/arikusi/deepseek-mcp-server/discussions)
- Open a [new issue](https://github.com/arikusi/deepseek-mcp-server/issues/new)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to DeepSeek MCP Server!
