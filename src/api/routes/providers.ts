import { Hono } from 'hono';

import type { GitHubConfig, GitHubRepoVisibility, SourceConfig } from '../../core/types.js';
import { deleteSecret, KEYCHAIN_SERVICE, githubTokenAccountKey } from '../../core/secrets/keychain.js';
import { loadConfigV2, removeSource, upsertSource } from '../../core/config.js';
import { AuthenticationError } from '../../core/errors.js';
import { GitHubOAuthService } from '../../providers/github/github-oauth-service.js';
import {
  DEFAULT_LOCAL_LIBRARY_DIR,
  DEFAULT_GITHUB_SOURCE_ID,
  createGitHubStorageFromConfig,
  ensureCanonicalLocalSource,
  findGitHubSource,
  loadGitHubToken,
  previewGitHubSync,
  syncGitHubFromLocal,
} from '../../providers/github/github-sync-service.js';
import { buildManifestFile } from '../../providers/github/github-storage-provider.js';

const oauthService = new GitHubOAuthService();

function normalizeRepoName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent-hub';
}

function githubSourceFromConfig(config: GitHubConfig): SourceConfig {
  return {
    id: DEFAULT_GITHUB_SOURCE_ID,
    label: 'GitHub Cloud',
    provider: 'github',
    github: config,
    enabled: true,
  };
}

async function ensureBootstrapFiles(githubConfig: GitHubConfig): Promise<void> {
  const storage = await createGitHubStorageFromConfig(githubConfig);
  const manifest = await storage.loadManifest();
  if (!manifest) {
    await storage.saveManifest(buildManifestFile(githubConfig.branch, []));
  }

  const readmes = [
    ['skills/README.md', '# Skills\n\nStorage for skill packages synchronized by agent-hub.\n'],
    ['prompts/README.md', '# Prompts\n\nStorage for prompts synchronized by agent-hub.\n'],
    ['agents/README.md', '# Agents\n\nStorage for subagents synchronized by agent-hub.\n'],
    ['workflows/README.md', '# Workflows\n\nReserved for workflow artifacts managed by agent-hub.\n'],
  ] as const;

  for (const [path, content] of readmes) {
    const existing = await storage.getFile(path);
    if (!existing) {
      await storage.putFile({
        path,
        content,
        message: `Bootstrap ${path}`,
      });
    }
  }
}

function renderPopupResult(params: {
  ok: boolean;
  uiOrigin: string;
  callbackOrigin: string;
  payload: Record<string, unknown>;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub Connection</title>
  </head>
  <body>
    <script>
      (function () {
        var payload = ${JSON.stringify(params.payload)};
        if (window.opener) {
          window.opener.postMessage(payload, ${JSON.stringify(params.uiOrigin)});
        }
        window.close();
      })();
    </script>
    <p>${params.ok ? 'GitHub connected successfully. You can close this window.' : 'GitHub connection failed. You can close this window.'}</p>
  </body>
</html>`;
}

async function buildGitHubStatus() {
  const config = await loadConfigV2();
  const githubSource = findGitHubSource(config);
  if (!githubSource?.github) {
    return {
      connected: false,
      reauthorizationRequired: false,
    };
  }

  const { github } = githubSource;

  try {
    const token = await loadGitHubToken(github);
    const validation = await oauthService.validateToken(token);
    return {
      connected: true,
      accountLogin: github.accountLogin,
      repo: {
        owner: github.owner,
        name: github.repo,
        branch: github.branch,
        basePath: github.basePath,
        visibility: github.visibility,
      },
      scopes: validation.scopes,
      reauthorizationRequired: false,
    };
  } catch {
    return {
      connected: false,
      accountLogin: github.accountLogin,
      repo: {
        owner: github.owner,
        name: github.repo,
        branch: github.branch,
        basePath: github.basePath,
        visibility: github.visibility,
      },
      scopes: [],
      reauthorizationRequired: true,
    };
  }
}

export function providersRoutes(): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    const config = await loadConfigV2();
    const localSource = config?.defaultSource
      ? config.sources?.find((source) => source.id === config.defaultSource && source.provider === 'local')
      : config?.sources?.find((source) => source.provider === 'local');
    return c.json({
      data: {
        github: await buildGitHubStatus(),
        local: {
          sourceId: localSource?.id ?? null,
          directory: localSource?.local?.directory ?? DEFAULT_LOCAL_LIBRARY_DIR,
        },
      },
    });
  });

  app.get('/github/status', async (c) => {
    return c.json({ data: await buildGitHubStatus() });
  });

  app.post('/github/oauth/start', async (c) => {
    const body = await c.req.json<{
      repoName?: string;
      visibility?: GitHubRepoVisibility;
      uiOrigin?: string;
    }>();

    const serverOrigin = new URL(c.req.url).origin;
    const uiOrigin = body.uiOrigin?.trim() || c.req.header('origin') || serverOrigin;
    const repoName = normalizeRepoName(body.repoName ?? 'agent-hub');
    const visibility = body.visibility === 'public' ? 'public' : 'private';

    const result = oauthService.start({
      serverOrigin,
      uiOrigin,
      repoName,
      visibility,
    });

    return c.json({ data: result });
  });

  app.get('/github/oauth/callback', async (c) => {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');
    const serverOrigin = new URL(c.req.url).origin;
    const transaction = state ? oauthService.peek(state) : null;

    if (error) {
      return c.html(renderPopupResult({
        ok: false,
        uiOrigin: transaction?.uiOrigin ?? serverOrigin,
        callbackOrigin: serverOrigin,
        payload: {
          source: 'agent-hub:github-oauth',
          ok: false,
          error,
        },
      }), 400);
    }

    if (!code || !state) {
      throw new AuthenticationError('GitHub OAuth callback is missing code or state.');
    }

    try {
      const completion = await oauthService.complete({ state, code });
      await ensureCanonicalLocalSource();

      const provisionalConfig: GitHubConfig = {
        owner: completion.user.login,
        repo: completion.transaction.repoName,
        branch: 'main',
        basePath: '.',
        accountLogin: completion.user.login,
        accountId: String(completion.user.id),
        visibility: completion.transaction.visibility,
      };

      const storage = await createGitHubStorageFromConfig(provisionalConfig);
      const repository = await storage.bootstrapRepository({
        name: completion.transaction.repoName,
        visibility: completion.transaction.visibility,
        branch: 'main',
        basePath: '.',
      });

      const finalConfig: GitHubConfig = {
        ...provisionalConfig,
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch,
      };
      await upsertSource(githubSourceFromConfig(finalConfig));

      return c.html(renderPopupResult({
        ok: true,
        uiOrigin: completion.transaction.uiOrigin,
        callbackOrigin: serverOrigin,
        payload: {
          source: 'agent-hub:github-oauth',
          ok: true,
          accountLogin: finalConfig.accountLogin,
          repo: finalConfig.repo,
          owner: finalConfig.owner,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.html(renderPopupResult({
        ok: false,
        uiOrigin: serverOrigin,
        callbackOrigin: serverOrigin,
        payload: {
          source: 'agent-hub:github-oauth',
          ok: false,
          error: message,
        },
      }), 400);
    }
  });

  app.post('/github/disconnect', async (c) => {
    const config = await loadConfigV2();
    const githubSource = findGitHubSource(config);
    if (!githubSource?.github) {
      return c.json({ data: { disconnected: false } });
    }

    const token = await loadGitHubToken(githubSource.github).catch(() => null);
    if (token) {
      await oauthService.revokeToken(token).catch(() => undefined);
      await deleteSecret(KEYCHAIN_SERVICE, githubTokenAccountKey(githubSource.github.accountId)).catch(() => undefined);
    }

    await removeSource(githubSource.id);
    return c.json({ data: { disconnected: true } });
  });

  app.post('/github/bootstrap', async (c) => {
    const config = await loadConfigV2();
    const githubSource = findGitHubSource(config);
    if (!githubSource?.github) {
      throw new AuthenticationError('GitHub is not connected.');
    }

    await ensureBootstrapFiles(githubSource.github);
    return c.json({ data: { bootstrapped: true } });
  });

  app.get('/github/sync/preview', async (c) => {
    const config = await loadConfigV2();
    return c.json({ data: await previewGitHubSync(config) });
  });

  app.post('/github/sync', async (c) => {
    const config = await loadConfigV2();
    return c.json({ data: await syncGitHubFromLocal(config) });
  });

  return app;
}
