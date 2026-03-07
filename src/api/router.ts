/**
 * API router — wires all route modules under `/api`.
 */

import { Hono } from 'hono';
import { errorHandler } from './middleware.js';
import { healthRoutes } from './routes/health.js';
import { skillsRoutes } from './routes/skills.js';
import { configRoutes } from './routes/config.js';
import { cacheRoutes } from './routes/cache.js';
import { workspaceRoutes } from './routes/workspace.js';
import { deployRoutes } from './routes/deploy.js';
import { syncRoutes } from './routes/sync.js';
import { sourcesRoutes } from './routes/sources.js';
import { explorerRoutes } from './routes/explorer.js';
import { appsRoutes } from './routes/apps.js';
import { migrationsRoutes } from './routes/migrations.js';

/**
 * Create the Hono app with all API routes mounted.
 */
export function createApiApp(): Hono {
  const app = new Hono();

  // Global error handler.
  app.onError(errorHandler);

  // Mount route modules.
  app.route('/api/health', healthRoutes());
  app.route('/api/skills', skillsRoutes());
  app.route('/api/config', configRoutes());
  app.route('/api/cache', cacheRoutes());
  app.route('/api/workspace', workspaceRoutes());
  app.route('/api/deploy', deployRoutes());
  app.route('/api/sync', syncRoutes());
  app.route('/api/sources', sourcesRoutes());
  app.route('/api/explorer', explorerRoutes());
  app.route('/api/apps', appsRoutes());
  app.route('/api/migrations', migrationsRoutes());

  return app;
}
