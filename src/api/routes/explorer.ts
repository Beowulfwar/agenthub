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
  pickDirectory,
} from '../../core/explorer.js';
import { normalizeExternalPath } from '../../core/wsl.js';

export function explorerRoutes(): Hono {
  const app = new Hono();

  // GET /api/explorer/browse?dir=/path&hidden=true
  app.get('/browse', async (c) => {
    const dir = c.req.query('dir') || os.homedir();
    const showHidden = c.req.query('hidden') !== 'false';
    const normalized = await normalizeExternalPath(dir);

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
    const normalized = await normalizeExternalPath(dir);

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
    const candidates = suggestStartDirs();
    const results: Array<{
      path: string;
      label: string;
      exists: boolean;
      skillCount: number;
    }> = [];

    for (const { path: dir, label } of candidates) {
      const exists = await isValidDirectory(dir);
      if (!exists) continue;

      // Quick scan for skill dirs in this location
      const detected = await scanForSkillDirs(dir);
      const skillCount = detected.reduce((sum, d) => sum + d.skillCount, 0);
      results.push({ path: dir, label, exists, skillCount });
    }

    return c.json({ data: results });
  });

  // POST /api/explorer/pick-directory
  app.post('/pick-directory', async (c) => {
    const body = await c.req.json<{ initialDir?: string }>().catch(() => ({ initialDir: undefined }));
    const selectedDir = await pickDirectory(body.initialDir);
    return c.json({ data: { selectedDir } });
  });

  return app;
}
