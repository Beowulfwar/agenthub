#!/usr/bin/env node

/**
 * MCP Server End-to-End Test
 *
 * Spawns the agent-hub MCP server as a child process and exercises the
 * full JSON-RPC 2.0 protocol over stdio (newline-delimited JSON, as
 * implemented by @modelcontextprotocol/sdk StdioServerTransport).
 *
 * Test plan:
 *   1. initialize + initialized handshake
 *   2. tools/list   — list available MCP tools
 *   3. tools/call   — ahub_list   (expect 3 skills)
 *   4. tools/call   — ahub_search (query "sentry")
 *   5. tools/call   — ahub_health (expect connected status)
 *   6. tools/call   — ahub_get    (name "sentry")
 *
 * Usage:
 *   node tests/mcp/mcp-e2e.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ── Helpers ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const TIMEOUT_MS = 30_000; // per-request timeout

let nextId = 1;
function makeId() {
  return nextId++;
}

// Colours for terminal output
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN  = '\x1b[36m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

// ── Test harness ─────────────────────────────────────────────────────

class McpTestClient {
  constructor() {
    this._pending = new Map();   // id -> { resolve, reject, timer }
    this._buffer = '';
    this._proc = null;
  }

  /** Spawn the MCP server and wire up stdio. */
  start() {
    const bin = path.join(PROJECT_ROOT, 'dist', 'bin', 'ahub.js');
    this._proc = spawn('node', [bin, 'mcp'], {
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    this._proc.stdout.on('data', (chunk) => this._onData(chunk));
    this._proc.stderr.on('data', (chunk) => {
      // Log server stderr for debugging (dimmed)
      const lines = chunk.toString().trim();
      if (lines) {
        for (const line of lines.split('\n')) {
          process.stderr.write(`${DIM}  [server stderr] ${line}${RESET}\n`);
        }
      }
    });

    this._proc.on('exit', (code) => {
      // Reject any pending requests if server exits unexpectedly.
      for (const [id, entry] of this._pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Server exited with code ${code} while waiting for response id=${id}`));
      }
      this._pending.clear();
    });
  }

  /** Send a JSON-RPC request (with id) and wait for the response. */
  request(method, params = undefined) {
    const id = makeId();
    const msg = { jsonrpc: '2.0', id, method };
    if (params !== undefined) {
      msg.params = params;
    }
    return this._send(msg, id);
  }

  /** Send a JSON-RPC notification (no id, no response expected). */
  notify(method, params = undefined) {
    const msg = { jsonrpc: '2.0', method };
    if (params !== undefined) {
      msg.params = params;
    }
    const json = JSON.stringify(msg) + '\n';
    this._proc.stdin.write(json);
  }

  /** Shut down the server cleanly. */
  async close() {
    if (this._proc && !this._proc.killed) {
      this._proc.stdin.end();
      // Give it a moment to exit
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          this._proc.kill('SIGTERM');
          resolve();
        }, 3000);
        this._proc.on('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  // ── Internal ─────────────────────────────────────────────────────

  _send(msg, id) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Timeout waiting for response id=${id} (method=${msg.method})`));
      }, TIMEOUT_MS);

      this._pending.set(id, { resolve, reject, timer });
      const json = JSON.stringify(msg) + '\n';
      this._proc.stdin.write(json);
    });
  }

  _onData(chunk) {
    this._buffer += chunk.toString();
    // The MCP SDK uses newline-delimited JSON.
    let newlineIdx;
    while ((newlineIdx = this._buffer.indexOf('\n')) !== -1) {
      const line = this._buffer.slice(0, newlineIdx).replace(/\r$/, '');
      this._buffer = this._buffer.slice(newlineIdx + 1);
      if (!line) continue;

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        process.stderr.write(`${RED}  [parse error] ${err.message}: ${line}${RESET}\n`);
        continue;
      }

      // Match response to pending request by id.
      if (parsed.id != null && this._pending.has(parsed.id)) {
        const entry = this._pending.get(parsed.id);
        this._pending.delete(parsed.id);
        clearTimeout(entry.timer);
        entry.resolve(parsed);
      }
    }
  }
}

// ── Test definitions ─────────────────────────────────────────────────

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true });
  console.log(`${GREEN}  PASS${RESET}  ${name}${detail ? `  ${DIM}(${detail})${RESET}` : ''}`);
}

function fail(name, reason) {
  results.push({ name, ok: false, reason });
  console.log(`${RED}  FAIL${RESET}  ${name}  — ${reason}`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${CYAN}=== Agent-Hub MCP Server E2E Tests ===${RESET}\n`);

  const client = new McpTestClient();
  client.start();

  try {
    // ── 1. Initialize handshake ────────────────────────────────────
    {
      const testName = 'initialize handshake';
      try {
        const resp = await client.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-e2e-test', version: '1.0.0' },
        });

        if (resp.error) {
          fail(testName, `Server returned error: ${JSON.stringify(resp.error)}`);
        } else if (resp.result && resp.result.serverInfo) {
          pass(testName, `server=${resp.result.serverInfo.name} v${resp.result.serverInfo.version}`);
        } else {
          fail(testName, `Unexpected response shape: ${JSON.stringify(resp)}`);
        }

        // Send initialized notification (required by protocol).
        client.notify('notifications/initialized');
        // Small delay to let the server process the notification.
        await sleep(200);
      } catch (err) {
        fail(testName, err.message);
      }
    }

    // ── 2. tools/list ──────────────────────────────────────────────
    {
      const testName = 'tools/list — list available tools';
      try {
        const resp = await client.request('tools/list', {});

        if (resp.error) {
          fail(testName, `Server returned error: ${JSON.stringify(resp.error)}`);
        } else if (resp.result && Array.isArray(resp.result.tools)) {
          const names = resp.result.tools.map((t) => t.name).sort();
          const expected = ['ahub_deploy', 'ahub_get', 'ahub_health', 'ahub_list', 'ahub_push', 'ahub_search'];
          const missing = expected.filter((n) => !names.includes(n));
          if (missing.length > 0) {
            fail(testName, `Missing tools: ${missing.join(', ')}. Got: ${names.join(', ')}`);
          } else {
            pass(testName, `${resp.result.tools.length} tool(s): ${names.join(', ')}`);
          }
        } else {
          fail(testName, `Unexpected response: ${JSON.stringify(resp)}`);
        }
      } catch (err) {
        fail(testName, err.message);
      }
    }

    // ── 3. tools/call — ahub_list ──────────────────────────────────
    {
      const testName = 'tools/call ahub_list — should return 3 skills';
      try {
        const resp = await client.request('tools/call', {
          name: 'ahub_list',
          arguments: {},
        });

        if (resp.error) {
          fail(testName, `Server returned error: ${JSON.stringify(resp.error)}`);
        } else if (resp.result && Array.isArray(resp.result.content)) {
          const text = resp.result.content.map((c) => c.text).join('\n');
          const hasThreeSkills = text.includes('3 skill');
          const hasSentry = text.toLowerCase().includes('sentry');
          const hasPlaywright = text.toLowerCase().includes('playwright');
          const hasFiscal = text.toLowerCase().includes('fiscal');
          if (hasThreeSkills && hasSentry && hasPlaywright && hasFiscal) {
            pass(testName, 'All 3 skills present');
          } else {
            fail(testName, `Unexpected content: ${text.slice(0, 200)}`);
          }
        } else {
          fail(testName, `Unexpected response: ${JSON.stringify(resp)}`);
        }
      } catch (err) {
        fail(testName, err.message);
      }
    }

    // ── 4. tools/call — ahub_search ────────────────────────────────
    {
      const testName = 'tools/call ahub_search — query "sentry"';
      try {
        const resp = await client.request('tools/call', {
          name: 'ahub_search',
          arguments: { query: 'sentry' },
        });

        if (resp.error) {
          fail(testName, `Server returned error: ${JSON.stringify(resp.error)}`);
        } else if (resp.result && Array.isArray(resp.result.content)) {
          const text = resp.result.content.map((c) => c.text).join('\n');
          if (text.toLowerCase().includes('sentry')) {
            pass(testName, `Found sentry in results`);
          } else {
            fail(testName, `"sentry" not found in: ${text.slice(0, 200)}`);
          }
        } else {
          fail(testName, `Unexpected response: ${JSON.stringify(resp)}`);
        }
      } catch (err) {
        fail(testName, err.message);
      }
    }

    // ── 5. tools/call — ahub_health ────────────────────────────────
    {
      const testName = 'tools/call ahub_health — should return connected';
      try {
        const resp = await client.request('tools/call', {
          name: 'ahub_health',
          arguments: {},
        });

        if (resp.error) {
          fail(testName, `Server returned error: ${JSON.stringify(resp.error)}`);
        } else if (resp.result && Array.isArray(resp.result.content)) {
          const text = resp.result.content.map((c) => c.text).join('\n');
          const isConnected = text.includes('Connected') || text.toLowerCase().includes('ok');
          const hasProvider = text.toLowerCase().includes('git') || text.toLowerCase().includes('provider');
          if (isConnected && hasProvider) {
            pass(testName, 'Provider connected');
          } else {
            fail(testName, `Unexpected status: ${text.slice(0, 200)}`);
          }
        } else {
          fail(testName, `Unexpected response: ${JSON.stringify(resp)}`);
        }
      } catch (err) {
        fail(testName, err.message);
      }
    }

    // ── 6. tools/call — ahub_get ───────────────────────────────────
    {
      const testName = 'tools/call ahub_get — get "sentry" skill content';
      try {
        const resp = await client.request('tools/call', {
          name: 'ahub_get',
          arguments: { name: 'sentry' },
        });

        if (resp.error) {
          fail(testName, `Server returned error: ${JSON.stringify(resp.error)}`);
        } else if (resp.result && Array.isArray(resp.result.content)) {
          const text = resp.result.content.map((c) => c.text).join('\n');
          const isError = resp.result.isError === true;
          if (isError) {
            fail(testName, `Tool returned error: ${text.slice(0, 200)}`);
          } else if (text.toLowerCase().includes('sentry') && text.length > 50) {
            pass(testName, `Got ${text.length} chars of content`);
          } else {
            fail(testName, `Content too short or missing "sentry": ${text.slice(0, 200)}`);
          }
        } else {
          fail(testName, `Unexpected response: ${JSON.stringify(resp)}`);
        }
      } catch (err) {
        fail(testName, err.message);
      }
    }

  } finally {
    await client.close();
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n${CYAN}=== Summary ===${RESET}`);
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`  ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : DIM}${failed} failed${RESET}, ${results.length} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(`\n${RED}Fatal error: ${err.message}${RESET}\n`);
  process.exit(2);
});
