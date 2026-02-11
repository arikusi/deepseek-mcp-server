import { describe, it, expect } from 'vitest';
import { createServer, version } from './server.js';

describe('server', () => {
  it('should create McpServer with correct name', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('should export version from package.json', () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should have version matching package.json', async () => {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    expect(version).toBe(pkg.version);
  });
});
