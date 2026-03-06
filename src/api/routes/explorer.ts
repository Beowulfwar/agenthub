/**
 * Explorer routes — filesystem browsing and skill directory detection.
 *
 * GET /api/explorer/browse?dir=/path   → list directory contents
 * GET /api/explorer/scan?dir=/path     → scan for well-known skill dirs
 * GET /api/explorer/suggestions        → suggested starting directories
 */

import os from 'node:os';
import { Hono } from 'hono';
import {
  scanForSkillDirs,
  listDirectory,
  suggestStartDirs,
  isValidDirectory,
} from '../../core/explorer.js';
import { normalizePath } from '../../core/wsl.js';

export function explorerRoutes(): Hono {
  const app = new Hono();

  // GET /api/explorer/browse?dir=/path&hidden=true
  app.get('/browse', async (c) => {
    const dir = c.req.query('dir') || os.homedir();
    const showHidden = c.req.query('hidden') !== 'false';
    const normalized = normalizePath(dir);

    if (!(await isValidDirectory(normalized))) {
      return c.json({ error: { code: 'INVALID_DIR', message: `Not a valid directory: ${dir}` } }, 400);
    }

    const entries = await listDirectory(normalized, showHidden);
    return c.json({
      data: {
        currentDir: normalized,
        entries,
      },
    });
  });

  // GET /api/explorer/scan?dir=/path
  app.get('/scan', async (c) => {
    const dir = c.req.query('dir') || os.homedir();
    const normalized = normalizePath(dir);

    if (!(await isValidDirectory(normalized))) {
      return c.json({ error: { code: 'INVALID_DIR', message: `Not a valid directory: ${dir}` } }, 400);
    }

    const detected = await scanForSkillDirs(normalized);
    return c.json({
      data: {
        baseDir: normalized,
        detected,
      },
    });
  });

  // GET /api/explorer/suggestions
  app.get('/suggestions', async (c) => {
    const dirs = suggestStartDirs();
    const valid: Array<{ path: string; exists: boolean }> = [];

    for (const dir of dirs) {
      const exists = await isValidDirectory(dir);
      valid.push({ path: dir, exists });
    }

    return c.json({ data: valid.filter((d) => d.exists) });
  });

  return app;
}
