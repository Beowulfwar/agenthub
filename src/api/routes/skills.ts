/**
 * Skills routes — CRUD for /api/skills
 *
 * Supports optional `?source=<id>` query parameter to target a specific
 * storage source. Without it, uses the default provider.
 *
 * Supports optional `?type=<skill|prompt|subagent>` to filter by content type.
 */

import { Hono } from 'hono';
import { getWorkspaceRegistry, requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { serializeSkill, validateSkill, extractSkillExtensions, getMarkerFile } from '../../core/skill.js';
import { assertSafeSkillName } from '../../core/sanitize.js';
import { getSkillStats, formatBytes } from '../../core/stats.js';
import { buildSkillsCatalog } from '../../core/workspace-catalog.js';
import { loadWorkspaceManifest } from '../../core/workspace.js';
import type { StorageProvider } from '../../storage/provider.js';
import type { AhubConfig, ContentType } from '../../core/types.js';

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

  // GET /api/skills/catalog?q=<search>
  app.get('/catalog', async (c) => {
    const config = await requireConfig();
    const provider = createProvider(config);
    const registry = await getWorkspaceRegistry();
    const catalog = await buildSkillsCatalog(registry, provider, loadWorkspaceManifest);
    const query = c.req.query('q')?.trim().toLowerCase();

    if (!query) {
      return c.json({ data: catalog });
    }

    return c.json({
      data: {
        ...catalog,
        workspaces: catalog.workspaces
          .map((workspace) => ({
            ...workspace,
            skills: workspace.skills.filter((skill) => matchesCatalogQuery(skill, query)),
          }))
          .filter((workspace) => workspace.skills.length > 0),
        unassigned: catalog.unassigned.filter((skill) => matchesCatalogQuery(skill, query)),
      },
    });
  });

  // GET /api/skills?q=<search>&source=<id>&type=<type>&detailed=true
  app.get('/', async (c) => {
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const query = c.req.query('q');
    const type = c.req.query('type') as ContentType | undefined;

    const names = await provider.list(
      query || type ? { query, type } : undefined,
    );

    // If detailed=true, fetch metadata for each skill.
    const detailed = c.req.query('detailed') === 'true';
    if (!detailed) {
      return c.json({ data: names });
    }

    const skills = await Promise.all(
      names.slice(0, 100).map(async (name) => {
        try {
          const pkg = await provider.get(name);
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
          return { name, description: '(could not load)', type: 'skill', tags: [], targets: [], category: null, fileCount: 0 };
        }
      }),
    );

    return c.json({ data: skills });
  });

  // GET /api/skills/:name?source=<id>
  app.get('/:name', async (c) => {
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    const pkg = await provider.get(c.req.param('name'));
    return c.json({ data: pkg });
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

    const contentType = body.type ?? 'skill';
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
  app.patch('/:name', async (c) => {
    const name = c.req.param('name');
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    // Fetch existing skill.
    const pkg = await provider.get(name);
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
  app.post('/:name/clone', async (c) => {
    const name = c.req.param('name');
    const { newName } = await c.req.json<{ newName: string }>();
    assertSafeSkillName(newName);

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    if (await provider.exists(newName)) {
      return c.json({ error: `Skill "${newName}" already exists.` }, 409);
    }

    const pkg = await provider.get(name);
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
  app.post('/:name/rename', async (c) => {
    const oldName = c.req.param('name');
    const { newName } = await c.req.json<{ newName: string }>();
    assertSafeSkillName(newName);

    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    if (await provider.exists(newName)) {
      return c.json({ error: `Skill "${newName}" already exists.` }, 409);
    }

    const pkg = await provider.get(oldName);
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
    await provider.delete(oldName);

    return c.json({ data: { oldName, newName } });
  });

  // GET /api/skills/:name/info?source=<id>
  app.get('/:name/info', async (c) => {
    const name = c.req.param('name');
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);

    const pkg = await provider.get(name);
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
  app.delete('/:name', async (c) => {
    const name = c.req.param('name');
    const config = await requireConfig();
    const sourceId = c.req.query('source');
    const provider = getProviderForSource(config, sourceId);
    await provider.delete(name);
    return c.json({ data: { deleted: name } });
  });

  return app;
}

function matchesCatalogQuery(
  skill: {
    name: string;
    description?: string | null;
    category?: string | null;
    tags?: string[];
  },
  query: string,
): boolean {
  const haystack = [
    skill.name,
    skill.description ?? '',
    skill.category ?? '',
    ...(skill.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}
