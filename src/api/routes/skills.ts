/**
 * Skills routes — CRUD for /api/skills
 *
 * Supports optional `?source=<id>` query parameter to target a specific
 * storage source. Without it, uses the default provider.
 *
 * Supports optional `?type=<skill|prompt|subagent>` to filter by content type.
 */

import path from 'node:path';
import { Hono } from 'hono';
import { formatContentRef, isContentType, parseContentRef } from '../../core/content-ref.js';
import { getWorkspaceRegistry, requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { deleteLocalWorkspaceRule, readLocalWorkspaceRule, upsertLocalWorkspaceRule } from '../../core/local-rules.js';
import { serializeSkill, validateSkill, extractSkillExtensions, getMarkerFile } from '../../core/skill.js';
import { assertSafeSkillName } from '../../core/sanitize.js';
import { getSkillStats } from '../../core/stats.js';
import {
  buildSkillsHubDiff,
  buildSkillsHubShell,
  buildSkillsHubWorkspaceDetail,
  performSkillsHubDownload,
  performSkillsHubTransfer,
  performSkillsHubUpload,
} from '../../core/skills-hub.js';
import { loadProviderSkillIndex } from '../../core/workspace-catalog.js';
import { buildCloudSkillsCatalog } from '../../core/workspace-catalog.js';
import { loadWorkspaceManifest } from '../../core/workspace.js';
import { normalizeExternalPath } from '../../core/wsl.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { AgentAppId, AhubConfig, ContentRef, ContentType, DeployTarget } from '../../core/types.js';

/** Get a provider, optionally scoped to a specific source. */
function getProviderForSource(config: AhubConfig, sourceId?: string): StorageProvider {
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (src) {
      return createProviderFromSource(src);
    }
  }
  return createProvider(config);
}

export function skillsRoutes(): Hono {
  const app = new Hono();

  // GET /api/skills/catalog?q=<search>&workspaceFilePath=&target=
  app.get('/catalog', async (c) => {
    const config = await requireConfig();
    const provider = createProvider(config);
    const workspaceFilePath = c.req.query('workspaceFilePath');
    const targetParam = c.req.query('target');
    const target = isDeployTarget(targetParam) ? targetParam : undefined;
    const catalog = await buildCloudSkillsCatalog({
      provider,
      loadManifest: loadWorkspaceManifest,
      ...(workspaceFilePath
        ? { workspaceFilePath: await normalizeExternalPath(workspaceFilePath) }
        : {}),
      ...(target ? { target } : {}),
      query: c.req.query('q') ?? undefined,
      type: (c.req.query('type') as ContentType | undefined) ?? undefined,
      category: c.req.query('category') ?? undefined,
      tag: c.req.query('tag') ?? undefined,
      installState: (c.req.query('installState') as 'installed' | 'not_installed' | 'unknown' | undefined) ?? undefined,
    });

    return c.json({ data: catalog });
  });

  app.get('/hub', async (c) => {
    const config = await requireConfig();
    const provider = createProvider(config);
    const registry = await getWorkspaceRegistry();
    const shell = await buildSkillsHubShell({
      config,
      provider,
      registry,
      query: c.req.query('q') ?? undefined,
      type: (c.req.query('type') as ContentType | undefined) ?? undefined,
      category: c.req.query('category') ?? undefined,
      tag: c.req.query('tag') ?? undefined,
    });

    return c.json({ data: shell });
  });

  app.get('/hub/workspace', async (c) => {
    const filePathParam = c.req.query('filePath');
    if (!filePathParam) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'filePath e obrigatorio.' } },
        400,
      );
    }

    const config = await requireConfig();
    const provider = createProvider(config);
    const filePath = await normalizeExternalPath(filePathParam);
    const registry = await getWorkspaceRegistry();
    const detail = await buildSkillsHubWorkspaceDetail({
      config,
      filePath,
      isActive: registry.active === filePath,
      providerIndex: await loadProviderSkillIndex(provider),
      packageLoader: {
        get: async (ref: ContentRef) => provider.get(ref).catch(() => null),
      },
    });

    return c.json({ data: detail });
  });

  app.get('/hub/rules/content', async (c) => {
    const filePathParam = c.req.query('filePath');
    const appId = c.req.query('appId') as AgentAppId | undefined;
    const name = c.req.query('name');
    const detectedPath = c.req.query('detectedPath') ?? undefined;

    if (!filePathParam || !appId || !name) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'filePath, appId e name sao obrigatorios.' } },
        400,
      );
    }

    const filePath = await normalizeExternalPath(filePathParam);
    const workspaceDir = path.dirname(filePath);
    const result = await readLocalWorkspaceRule({
      workspaceDir,
      appId,
      name,
      ...(detectedPath ? { detectedPath: await normalizeExternalPath(detectedPath) } : {}),
    });

    return c.json({ data: result });
  });

  app.put('/hub/rules/local', async (c) => {
    const body = await c.req.json<{
      filePath: string;
      appId: AgentAppId;
      name: string;
      content: string;
      detectedPath?: string;
    }>();

    if (!body.filePath || !body.appId || !body.name || typeof body.content !== 'string') {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'filePath, appId, name e content sao obrigatorios.' } },
        400,
      );
    }

    const filePath = await normalizeExternalPath(body.filePath);
    const workspaceDir = path.dirname(filePath);
    const result = await upsertLocalWorkspaceRule({
      workspaceDir,
      appId: body.appId,
      name: body.name,
      content: body.content,
      ...(body.detectedPath ? { detectedPath: await normalizeExternalPath(body.detectedPath) } : {}),
    });

    return c.json({ data: result });
  });

  app.delete('/hub/rules/local', async (c) => {
    const body = await c.req.json<{
      filePath: string;
      appId: AgentAppId;
      name: string;
      detectedPath?: string;
    }>();

    if (!body.filePath || !body.appId || !body.name) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'filePath, appId e name sao obrigatorios.' } },
        400,
      );
    }

    const filePath = await normalizeExternalPath(body.filePath);
    const workspaceDir = path.dirname(filePath);
    const result = await deleteLocalWorkspaceRule({
      workspaceDir,
      appId: body.appId,
      name: body.name,
      ...(body.detectedPath ? { detectedPath: await normalizeExternalPath(body.detectedPath) } : {}),
    });

    return c.json({ data: result });
  });

  app.get('/hub/diff', async (c) => {
    const filePathParam = c.req.query('filePath');
    const name = c.req.query('name');
    const targetParam = c.req.query('target');
    const type = c.req.query('type');

    if (!filePathParam || !name || !isDeployTarget(targetParam)) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'filePath, name e target valido sao obrigatorios.',
          },
        },
        400,
      );
    }

    const config = await requireConfig();
    const provider = createProvider(config);
    const diff = await buildSkillsHubDiff({
      provider,
      filePath: await normalizeExternalPath(filePathParam),
      target: targetParam,
      name,
      ...(isContentType(type) ? { type } : {}),
    });

    return c.json({ data: diff });
  });

  app.post('/hub/actions/download', async (c) => {
    const body = await c.req.json<{
      filePath: string;
      target: DeployTarget;
      skills: string[];
      contents?: Array<{ type: ContentType; name: string }>;
    }>();
    const contents = normalizeRequestedContents(body.contents, body.skills);

    if (!body.filePath || !isDeployTarget(body.target) || contents.length === 0) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'filePath, target e contents[] ou skills[] sao obrigatorios.' } },
        400,
      );
    }

    const config = await requireConfig();
    const provider = createProvider(config);
    const result = await performSkillsHubDownload({
      config,
      provider,
      filePath: await normalizeExternalPath(body.filePath),
      target: body.target,
      contents,
    });

    return c.json({ data: result });
  });

  app.post('/hub/actions/upload', async (c) => {
    const body = await c.req.json<{
      filePath: string;
      target: DeployTarget;
      skills: string[];
      contents?: Array<{ type: ContentType; name: string }>;
      force?: boolean;
    }>();
    const contents = normalizeRequestedContents(body.contents, body.skills);

    if (!body.filePath || !isDeployTarget(body.target) || contents.length === 0) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'filePath, target e contents[] ou skills[] sao obrigatorios.' } },
        400,
      );
    }

    const provider = createProvider(await requireConfig());
    const result = await performSkillsHubUpload({
      provider,
      filePath: await normalizeExternalPath(body.filePath),
      target: body.target,
      contents,
      force: body.force,
    });

    return c.json({ data: result });
  });

  app.post('/hub/actions/transfer', async (c) => {
    const body = await c.req.json<{
      sourceWorkspaceFilePath: string;
      sourceTarget: DeployTarget;
      destinationWorkspaceFilePath: string;
      destinationTarget: DeployTarget;
      skills: string[];
      contents?: Array<{ type: ContentType; name: string }>;
      mode: 'copy' | 'move';
    }>();
    const contents = normalizeRequestedContents(body.contents, body.skills);

    if (
      !body.sourceWorkspaceFilePath
      || !body.destinationWorkspaceFilePath
      || !isDeployTarget(body.sourceTarget)
      || !isDeployTarget(body.destinationTarget)
      || contents.length === 0
      || (body.mode !== 'copy' && body.mode !== 'move')
    ) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Origem, destino, targets, mode e contents[] ou skills[] sao obrigatorios.',
          },
        },
        400,
      );
    }

    const config = await requireConfig();
    const result = await performSkillsHubTransfer({
      config,
      sourceWorkspaceFilePath: await normalizeExternalPath(body.sourceWorkspaceFilePath),
      sourceTarget: body.sourceTarget,
      destinationWorkspaceFilePath: await normalizeExternalPath(body.destinationWorkspaceFilePath),
      destinationTarget: body.destinationTarget,
      contents,
      mode: body.mode,
    });

    return c.json({ data: result });
  });

  // GET /api/skills?q=<search>&source=<id>&type=<type>&detailed=true
  app.get('/', async (c) => {
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const query = c.req.query('q');
    const type = resolveRequestedType(c.req.path, c.req.query('type'));

    const refs = await provider.listContentRefs(
      query || type ? { query, type } : undefined,
    );

    // If detailed=true, fetch metadata for each skill.
    const detailed = c.req.query('detailed') === 'true';
    if (!detailed) {
      return c.json({ data: refs.map((ref) => formatContentRef(ref)) });
    }

    const skills = await Promise.all(
      refs.slice(0, 100).map(async (ref) => {
        try {
          const pkg = await provider.get(ref);
          const ext = extractSkillExtensions(pkg.skill);
          return {
            name: pkg.skill.name,
            description: pkg.skill.description,
            type: pkg.skill.type ?? 'skill',
            tags: ext.tags ?? [],
            targets: ext.targets ?? [],
            category: ext.category ?? null,
            fileCount: pkg.files.length,
          };
        } catch {
          return { name: ref.name, description: '(could not load)', type: ref.type, tags: [], targets: [], category: null, fileCount: 0 };
        }
      }),
    );

    return c.json({ data: skills });
  });

  // GET /api/content/:type/:name/info?source=<id>
  app.get('/:type/:name/info', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const pkg = await provider.get(ref);
    const stats = getSkillStats(pkg);
    const ext = extractSkillExtensions(pkg.skill);

    const { type: statsType, ...restStats } = stats;

    return c.json({
      data: {
        name: pkg.skill.name,
        type: statsType,
        description: pkg.skill.description,
        ...restStats,
        tags: ext.tags ?? [],
        category: ext.category ?? null,
        targets: ext.targets ?? [],
      },
    });
  });

  // GET /api/content/:type/:name?source=<id>
  app.get('/:type/:name', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const pkg = await provider.get(ref);
    return c.json({ data: pkg });
  });

  // GET /api/skills/:name?source=<id>
  app.get('/:name', async (c) => {
    const ref = resolveRouteContentRef(undefined, c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const pkg = await provider.get(ref);
    return c.json({ data: pkg });
  });

  app.put('/:type/:name', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }

    const body = await c.req.json<{
      description: string;
      body: string;
      type?: ContentType;
      metadata?: Record<string, unknown>;
    }>();

    const contentType = body.type ?? ref.type;
    const skill = {
      name: ref.name,
      description: body.description,
      body: body.body,
      type: contentType,
      metadata: body.metadata ?? {},
    };
    validateSkill(skill);

    const content = serializeSkill(skill);
    const markerFile = getMarkerFile(contentType);
    const pkg = { skill, files: [{ relativePath: markerFile, content }] };

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    await provider.put(pkg);

    return c.json({ data: { name: ref.name, type: contentType } });
  });

  // PUT /api/skills/:name?source=<id>
  app.put('/:name', async (c) => {
    const name = c.req.param('name');
    assertSafeSkillName(name);

    const body = await c.req.json<{
      description: string;
      body: string;
      type?: ContentType;
      metadata?: Record<string, unknown>;
    }>();

    const contentType = body.type ?? resolveRequestedType(c.req.path, c.req.query('type')) ?? 'skill';
    const skill = {
      name,
      description: body.description,
      body: body.body,
      type: contentType,
      metadata: body.metadata ?? {},
    };
    validateSkill(skill);

    const content = serializeSkill(skill);
    const markerFile = getMarkerFile(contentType);
    const pkg = { skill, files: [{ relativePath: markerFile, content }] };

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    await provider.put(pkg);

    return c.json({ data: { name, type: contentType } });
  });

  // PATCH /api/skills/:name?source=<id> — Partial update
  app.patch('/:type/:name', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const pkg = await provider.get(ref);
    const { skill } = pkg;

    const patch = await c.req.json<{
      description?: string;
      body?: string;
      tags?: string[];
      category?: string;
      metadata?: Record<string, unknown>;
    }>();

    if (patch.description !== undefined) skill.description = patch.description;
    if (patch.body !== undefined) skill.body = patch.body;
    if (patch.tags !== undefined) {
      skill.metadata = { ...skill.metadata, tags: patch.tags };
    }
    if (patch.category !== undefined) {
      skill.metadata = { ...skill.metadata, category: patch.category };
    }
    if (patch.metadata !== undefined) {
      skill.metadata = { ...skill.metadata, ...patch.metadata };
    }

    validateSkill(skill);

    const markerFile = getMarkerFile(skill.type);
    const content = serializeSkill(skill);
    const updatedPkg = {
      skill,
      files: [
        { relativePath: markerFile, content },
        ...pkg.files.filter((f) => f.relativePath !== markerFile),
      ],
    };

    await provider.put(updatedPkg);

    return c.json({ data: { name: ref.name, type: skill.type ?? ref.type } });
  });

  app.patch('/:name', async (c) => {
    const name = c.req.param('name');
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    // Fetch existing skill.
    const pkg = await provider.get({ type: resolveRequestedType(c.req.path, c.req.query('type')) ?? 'skill', name });
    const { skill } = pkg;

    // Merge provided fields.
    const patch = await c.req.json<{
      description?: string;
      body?: string;
      tags?: string[];
      category?: string;
      metadata?: Record<string, unknown>;
    }>();

    if (patch.description !== undefined) skill.description = patch.description;
    if (patch.body !== undefined) skill.body = patch.body;
    if (patch.tags !== undefined) {
      skill.metadata = { ...skill.metadata, tags: patch.tags };
    }
    if (patch.category !== undefined) {
      skill.metadata = { ...skill.metadata, category: patch.category };
    }
    if (patch.metadata !== undefined) {
      skill.metadata = { ...skill.metadata, ...patch.metadata };
    }

    validateSkill(skill);

    const markerFile = getMarkerFile(skill.type);
    const content = serializeSkill(skill);
    const updatedPkg = {
      skill,
      files: [
        { relativePath: markerFile, content },
        ...pkg.files.filter((f) => f.relativePath !== markerFile),
      ],
    };

    await provider.put(updatedPkg);

    return c.json({ data: { name, type: skill.type ?? 'skill' } });
  });

  // POST /api/skills/:name/clone?source=<id>
  app.post('/:type/:name/clone', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }
    const { newName } = await c.req.json<{ newName: string }>();
    assertSafeSkillName(newName);

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    if (await provider.exists({ type: ref.type, name: newName })) {
      return c.json({ error: `Content "${ref.type}/${newName}" already exists.` }, 409);
    }

    const pkg = await provider.get(ref);
    const clonedSkill = { ...pkg.skill, name: newName, type: ref.type };
    validateSkill(clonedSkill);

    const markerFile = getMarkerFile(clonedSkill.type);
    const content = serializeSkill(clonedSkill);
    const clonedPkg = {
      skill: clonedSkill,
      files: [
        { relativePath: markerFile, content },
        ...pkg.files.filter((f) => f.relativePath !== markerFile && f.relativePath !== getMarkerFile(pkg.skill.type)),
      ],
    };

    await provider.put(clonedPkg);

    return c.json({ data: { name: newName, clonedFrom: formatContentRef(ref) } });
  });

  app.post('/:name/clone', async (c) => {
    const name = c.req.param('name');
    const { newName } = await c.req.json<{ newName: string }>();
    assertSafeSkillName(newName);

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    if (await provider.exists({ type: 'skill', name: newName })) {
      return c.json({ error: `Skill "${newName}" already exists.` }, 409);
    }

    const pkg = await provider.get({ type: 'skill', name });
    const clonedSkill = { ...pkg.skill, name: newName };
    validateSkill(clonedSkill);

    const markerFile = getMarkerFile(clonedSkill.type);
    const content = serializeSkill(clonedSkill);
    const clonedPkg = {
      skill: clonedSkill,
      files: [
        { relativePath: markerFile, content },
        ...pkg.files.filter((f) => f.relativePath !== markerFile && f.relativePath !== getMarkerFile(pkg.skill.type)),
      ],
    };

    await provider.put(clonedPkg);

    return c.json({ data: { name: newName, clonedFrom: name } });
  });

  // POST /api/skills/:name/rename?source=<id>
  app.post('/:type/:name/rename', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }
    const { newName } = await c.req.json<{ newName: string }>();
    assertSafeSkillName(newName);

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    if (await provider.exists({ type: ref.type, name: newName })) {
      return c.json({ error: `Content "${ref.type}/${newName}" already exists.` }, 409);
    }

    const pkg = await provider.get(ref);
    const renamedSkill = { ...pkg.skill, name: newName, type: ref.type };
    validateSkill(renamedSkill);

    const markerFile = getMarkerFile(renamedSkill.type);
    const content = serializeSkill(renamedSkill);
    const renamedPkg = {
      skill: renamedSkill,
      files: [
        { relativePath: markerFile, content },
        ...pkg.files.filter((f) => f.relativePath !== markerFile && f.relativePath !== getMarkerFile(pkg.skill.type)),
      ],
    };

    await provider.put(renamedPkg);
    await provider.delete(ref);

    return c.json({ data: { oldName: formatContentRef(ref), newName: formatContentRef({ type: ref.type, name: newName }) } });
  });

  app.post('/:name/rename', async (c) => {
    const oldName = c.req.param('name');
    const { newName } = await c.req.json<{ newName: string }>();
    assertSafeSkillName(newName);

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    if (await provider.exists({ type: 'skill', name: newName })) {
      return c.json({ error: `Skill "${newName}" already exists.` }, 409);
    }

    const pkg = await provider.get({ type: 'skill', name: oldName });
    const renamedSkill = { ...pkg.skill, name: newName };
    validateSkill(renamedSkill);

    const markerFile = getMarkerFile(renamedSkill.type);
    const content = serializeSkill(renamedSkill);
    const renamedPkg = {
      skill: renamedSkill,
      files: [
        { relativePath: markerFile, content },
        ...pkg.files.filter((f) => f.relativePath !== markerFile && f.relativePath !== getMarkerFile(pkg.skill.type)),
      ],
    };

    await provider.put(renamedPkg);
    await provider.delete({ type: 'skill', name: oldName });

    return c.json({ data: { oldName, newName } });
  });

  // GET /api/skills/:name/info?source=<id>
  app.get('/:name/info', async (c) => {
    const name = c.req.param('name');
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    const pkg = await provider.get({ type: resolveRequestedType(c.req.path, c.req.query('type')) ?? 'skill', name });
    const stats = getSkillStats(pkg);
    const ext = extractSkillExtensions(pkg.skill);

    const { type: statsType, ...restStats } = stats;

    return c.json({
      data: {
        name: pkg.skill.name,
        type: statsType,
        description: pkg.skill.description,
        ...restStats,
        tags: ext.tags ?? [],
        category: ext.category ?? null,
        targets: ext.targets ?? [],
      },
    });
  });

  // DELETE /api/skills/:name?source=<id>
  app.delete('/:type/:name', async (c) => {
    const ref = resolveRouteContentRef(c.req.param('type'), c.req.param('name'), c.req.path, c.req.query('type'));
    if (!ref) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'type invalido.' } }, 400);
    }
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    await provider.delete(ref);
    return c.json({ data: { deleted: formatContentRef(ref) } });
  });

  app.delete('/:name', async (c) => {
    const name = c.req.param('name');
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    await provider.delete({ type: resolveRequestedType(c.req.path, c.req.query('type')) ?? 'skill', name });
    return c.json({ data: { deleted: name } });
  });

  return app;
}

function isDeployTarget(value?: string): value is DeployTarget {
  return value === 'claude-code' || value === 'codex' || value === 'cursor';
}

function resolveRequestedType(
  requestPath: string,
  rawType?: string,
): ContentType | undefined {
  if (isContentType(rawType)) {
    return rawType;
  }

  if (requestPath.startsWith('/api/skills')) {
    return 'skill';
  }

  return undefined;
}

function resolveRouteContentRef(
  rawType: string | undefined,
  name: string,
  requestPath: string,
  queryType?: string,
): ContentRef | null {
  const type = rawType
    ? (isContentType(rawType) ? rawType : null)
    : (resolveRequestedType(requestPath, queryType) ?? 'skill');

  if (!type) {
    return null;
  }

  return { type, name };
}

function normalizeRequestedContents(
  contents?: Array<{ type: ContentType; name: string }>,
  skills?: string[],
): ContentRef[] {
  if (Array.isArray(contents) && contents.length > 0) {
    return dedupeContentRefs(contents);
  }
  if (!Array.isArray(skills)) {
    return [];
  }
  return dedupeContentRefs(skills.map((name) => parseContentRef(name, 'skill')));
}

function dedupeContentRefs(contents: ContentRef[]): ContentRef[] {
  const unique = new Map<string, ContentRef>();
  for (const content of contents) {
    if (!isContentType(content.type)) continue;
    unique.set(formatContentRef(content), content);
  }
  return [...unique.values()];
}
