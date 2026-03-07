/**
 * HTTP server — serves the API and (optionally) static frontend files.
 *
 * In production mode (`ahub ui`), the built frontend at `dist/ui/` is served
 * as static files, with a catch-all fallback to `index.html` for client-side
 * routing.
 *
 * In dev mode (`ahub ui --dev`), only the API is served and the Vite dev
 * server handles the frontend separately.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { createApiApp } from './router.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

export interface ServerOptions {
  port?: number;
  /** Path to the built frontend directory (e.g. dist/ui). */
  staticDir?: string;
  /** Enable CORS for dev mode (Vite on a different port). */
  devMode?: boolean;
}

/**
 * Start the HTTP server.
 *
 * Returns a handle with the server instance and resolved port.
 */
export async function startApiServer(options: ServerOptions = {}) {
  const { port = 3837, staticDir, devMode = false } = options;

  const app = createApiApp();

  // Dev mode: allow Vite dev server (default :5173) to call the API.
  if (devMode) {
    app.use(
      '/api/*',
      cors({
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      }),
    );
  }

  // Static file serving when a build directory is provided.
  if (staticDir) {
    app.get('*', async (c) => {
      const urlPath = new URL(c.req.url).pathname;

      // Don't serve static for API routes (already handled above).
      if (urlPath.startsWith('/api/')) {
        return c.notFound();
      }

      // Try to serve the exact file.
      const filePath = join(staticDir, urlPath === '/' ? 'index.html' : urlPath);
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          const content = await readFile(filePath);
          const ext = extname(filePath);
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          return new Response(content, {
            headers: { 'Content-Type': contentType },
          });
        }
      } catch {
        // File not found — fall through to SPA fallback.
      }

      // SPA fallback: serve index.html for client-side routing.
      try {
        const indexPath = join(staticDir, 'index.html');
        const indexContent = await readFile(indexPath);
        return new Response(indexContent, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch {
        return c.notFound();
      }
    });
  }

  const server = serve({
    fetch: app.fetch,
    port,
  });

  return { server, port, app };
}
