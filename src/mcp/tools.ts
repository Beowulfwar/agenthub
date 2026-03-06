import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, requireConfig, listSources } from '../core/config.js';
import { createProvider, createAggregateProvider, createProviderFromSource } from '../storage/factory.js';
import { parseSkill, serializeSkill, validateSkill, getMarkerFile, extractSkillExtensions } from '../core/skill.js';
import { assertSafeSkillName } from '../core/sanitize.js';
import { createDeployer } from '../deploy/deployer.js';
import { findWorkspaceManifest, loadWorkspaceManifest, resolveManifestSkills } from '../core/workspace.js';
import { syncWorkspace } from '../core/sync.js';
import { getSkillStats, formatBytes } from '../core/stats.js';
import type { StorageProvider } from '../storage/provider.js';
import type { ContentType, DeployTarget } from '../core/types.js';

const CONTENT_TYPE_ENUM = z.enum(['skill', 'prompt', 'subagent']).optional();

/**
 * Get a provider for the given source (or default).
 * When `source` is provided and the config is v2, returns that specific source's provider.
 * Otherwise returns the default provider.
 */
async function getProvider(source?: string): Promise<StorageProvider> {
  const config = await loadConfig();
  if (!config) {
    throw new Error(
      'agent-hub not configured. Run "ahub init" first to set up a storage provider.',
    );
  }

  if (source && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === source);
    if (!src) {
      throw new Error(`Source "${source}" not found. Run "ahub source list" to see available sources.`);
    }
    return createProviderFromSource(src);
  }

  return createProvider(config);
}

export function registerTools(server: McpServer): void {
  // ─── ahub_sources ─────────────────────────────────────────────
  server.tool(
    'ahub_sources',
    'List all configured storage sources and their status',
    {},
    async () => {
      try {
        const sources = await listSources();
        const config = await loadConfig();

        if (sources.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No sources configured. Run "ahub source add" to add one.' }],
          };
        }

        const lines: string[] = [`${sources.length} source(s) configured:\n`];
        for (const src of sources) {
          const isDefault = config?.defaultSource === src.id;
          const status = src.enabled !== false ? 'enabled' : 'disabled';
          const marker = isDefault ? ' (default)' : '';
          lines.push(`  ${src.id}${marker} [${src.provider}] ${status}${src.label ? ` — ${src.label}` : ''}`);
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_list ───────────────────────────────────────────────
  server.tool(
    'ahub_list',
    'List all available skills in the agent-hub store',
    {
      query: z.string().optional().describe('Filter skills by name substring'),
      source: z.string().optional().describe('Only list skills from this source ID'),
      type: CONTENT_TYPE_ENUM.describe('Filter by content type (skill, prompt, subagent)'),
    },
    async ({ query, source, type }) => {
      try {
        const provider = await getProvider(source);
        const skills = await provider.list(
          query || type ? { query, type: type as ContentType | undefined } : undefined,
        );

        if (skills.length === 0) {
          const msg = query
            ? `No skills found matching "${query}".`
            : 'No skills found in the store.';
          return { content: [{ type: 'text' as const, text: msg }] };
        }

        const list = skills.map((s, i) => `${i + 1}. ${s}`).join('\n');
        const text = `Found ${skills.length} skill(s):\n\n${list}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_get ────────────────────────────────────────────────
  server.tool(
    'ahub_get',
    'Get the full content of a skill by name',
    {
      name: z.string().describe('Skill name to retrieve'),
      source: z.string().optional().describe('Source ID to fetch from'),
    },
    async ({ name, source }) => {
      try {
        const provider = await getProvider(source);
        const pkg = await provider.get(name);
        const { skill } = pkg;

        const typeLine = skill.type && skill.type !== 'skill' ? `**Type:** ${skill.type}\n` : '';
        const header = `# ${skill.name}\n\n${typeLine}**Description:** ${skill.description}\n`;
        const files =
          pkg.files.length > 0
            ? `\n**Files:** ${pkg.files.map((f) => f.relativePath).join(', ')}`
            : '';
        const body = `\n\n---\n\n${skill.body}`;

        return { content: [{ type: 'text' as const, text: header + files + body }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_search ─────────────────────────────────────────────
  server.tool(
    'ahub_search',
    'Search skills by keyword in name or description',
    {
      query: z.string().describe('Search query'),
      source: z.string().optional().describe('Source ID to search in'),
      type: CONTENT_TYPE_ENUM.describe('Filter by content type (skill, prompt, subagent)'),
    },
    async ({ query, source, type }) => {
      try {
        const provider = await getProvider(source);
        const matches = await provider.list(
          type ? { query, type: type as ContentType | undefined } : query,
        );

        if (matches.length === 0) {
          return {
            content: [
              { type: 'text' as const, text: `No skills found matching "${query}".` },
            ],
          };
        }

        // Get descriptions for matched skills
        const results: string[] = [];
        for (const name of matches.slice(0, 20)) {
          try {
            const pkg = await provider.get(name);
            results.push(`- **${name}**: ${pkg.skill.description}`);
          } catch {
            results.push(`- **${name}**: (could not load description)`);
          }
        }

        const text =
          `Found ${matches.length} skill(s) matching "${query}":\n\n` + results.join('\n');
        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_deploy ─────────────────────────────────────────────
  server.tool(
    'ahub_deploy',
    'Deploy a skill to an agent target (claude-code, codex, cursor)',
    {
      name: z.string().describe('Skill name to deploy'),
      target: z
        .enum(['claude-code', 'codex', 'cursor'])
        .describe('Deployment target'),
      source: z.string().optional().describe('Source ID to fetch from'),
    },
    async ({ name, target, source }) => {
      try {
        const provider = await getProvider(source);
        const pkg = await provider.get(name);
        const config = await loadConfig();
        const customPath = config?.deployTargets?.[target as DeployTarget];
        const deployer = await createDeployer(target as DeployTarget, customPath);
        const deployedPath = await deployer.deploy(pkg);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Skill "${name}" deployed to ${target} at:\n${deployedPath}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_push ───────────────────────────────────────────────
  server.tool(
    'ahub_push',
    'Create or update a skill in the store from content',
    {
      name: z.string().describe('Skill name'),
      description: z.string().describe('Skill description'),
      body: z.string().describe('Skill markdown body content'),
      type: CONTENT_TYPE_ENUM.describe('Content type (skill, prompt, subagent). Defaults to skill.'),
      source: z.string().optional().describe('Source ID to push to'),
    },
    async ({ name, description, body, type, source }) => {
      try {
        assertSafeSkillName(name);
        const provider = await getProvider(source);
        const contentType = (type as ContentType | undefined) ?? 'skill';
        const skill = { name, description, body, type: contentType, metadata: {} };
        validateSkill(skill);

        const content = serializeSkill(skill);
        const markerFile = getMarkerFile(contentType);
        const pkg = {
          skill,
          files: [{ relativePath: markerFile, content }],
        };

        await provider.put(pkg);

        return {
          content: [
            {
              type: 'text' as const,
              text: `${contentType === 'skill' ? 'Skill' : contentType.charAt(0).toUpperCase() + contentType.slice(1)} "${name}" pushed successfully to ${provider.name} storage.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_sync ──────────────────────────────────────────────
  server.tool(
    'ahub_sync',
    'Sync all skills declared in the workspace manifest (ahub.workspace.json) to their deploy targets',
    {
      force: z.boolean().optional().describe('Force re-fetch even if cache is fresh'),
      filter: z.array(z.string()).optional().describe('Only sync specific skills'),
      manifestPath: z.string().optional().describe('Path to workspace manifest (auto-detected if omitted)'),
    },
    async ({ force, filter, manifestPath }) => {
      try {
        const config = await requireConfig();

        let manifest;
        if (manifestPath) {
          manifest = await loadWorkspaceManifest(manifestPath);
        } else {
          const found = await findWorkspaceManifest();
          if (!found) {
            return {
              content: [{
                type: 'text' as const,
                text: 'No workspace manifest found. Create an ahub.workspace.json in your project root or run "ahub workspace init".',
              }],
            };
          }
          manifest = await loadWorkspaceManifest(found);
        }

        const result = await syncWorkspace(manifest, config, { force, filter });

        const lines: string[] = [];
        if (result.deployed.length > 0) {
          lines.push(`Deployed (${result.deployed.length}):`);
          for (const e of result.deployed) {
            lines.push(`  ${e.skill} -> ${e.target}  ${e.path}`);
          }
        }
        if (result.skipped.length > 0) {
          lines.push(`Skipped (${result.skipped.length}): ${result.skipped.join(', ')}`);
        }
        if (result.failed.length > 0) {
          lines.push(`Failed (${result.failed.length}):`);
          for (const e of result.failed) {
            lines.push(`  ${e.skill} -> ${e.target}: ${e.error}`);
          }
        }

        const text = lines.length > 0
          ? lines.join('\n')
          : 'Sync complete — nothing to do (no skills matched).';

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_workspace_status ────────────────────────────────────
  server.tool(
    'ahub_workspace_status',
    'Show the status of the current workspace manifest: which skills would be synced and to which targets',
    {
      manifestPath: z.string().optional().describe('Path to workspace manifest (auto-detected if omitted)'),
    },
    async ({ manifestPath }) => {
      try {
        let manifest;
        let resolvedPath: string;
        if (manifestPath) {
          manifest = await loadWorkspaceManifest(manifestPath);
          resolvedPath = manifestPath;
        } else {
          const found = await findWorkspaceManifest();
          if (!found) {
            return {
              content: [{
                type: 'text' as const,
                text: 'No workspace manifest found. Create an ahub.workspace.json in your project root.',
              }],
            };
          }
          manifest = await loadWorkspaceManifest(found);
          resolvedPath = found;
        }

        const resolved = resolveManifestSkills(manifest);

        const lines: string[] = [
          `Workspace: ${manifest.name ?? '(unnamed)'}`,
          `Manifest:  ${resolvedPath}`,
          `Skills:    ${resolved.length}`,
          '',
        ];

        for (const { name, targets } of resolved) {
          lines.push(`  ${name} -> ${targets.join(', ')}`);
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_health ─────────────────────────────────────────────
  server.tool(
    'ahub_health',
    'Check agent-hub storage provider connectivity and status',
    {
      source: z.string().optional().describe('Check a specific source only'),
    },
    async ({ source }) => {
      try {
        const config = await loadConfig();
        if (!config) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'agent-hub is not configured. Run "ahub init" to set up.',
              },
            ],
          };
        }

        if (source) {
          const provider = await getProvider(source);
          const health = await provider.healthCheck();
          const status = health.ok ? 'Connected' : 'Disconnected';
          const text = `Source: ${source}\nProvider: ${provider.name}\nStatus: ${status}\nMessage: ${health.message}`;
          return { content: [{ type: 'text' as const, text }] };
        }

        // Check all sources via aggregate
        const aggregate = createAggregateProvider(config);
        const health = await aggregate.healthCheck();
        const status = health.ok ? 'Connected' : 'Disconnected';
        const text = `Status: ${status}\n${health.message}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_edit ──────────────────────────────────────────────
  server.tool(
    'ahub_edit',
    'Update specific fields of an existing skill (partial update). Fetches the skill, merges provided fields, and pushes back.',
    {
      name: z.string().describe('Skill name to edit'),
      source: z.string().optional().describe('Source ID'),
      body: z.string().optional().describe('New markdown body (replaces existing)'),
      description: z.string().optional().describe('New description'),
      tags: z.array(z.string()).optional().describe('New tags array (replaces existing)'),
      category: z.string().optional().describe('New category'),
    },
    async ({ name, source, body, description, tags, category }) => {
      try {
        const provider = await getProvider(source);
        const pkg = await provider.get(name);
        const { skill } = pkg;

        // Merge provided fields.
        if (description !== undefined) skill.description = description;
        if (body !== undefined) skill.body = body;
        if (tags !== undefined) {
          skill.metadata = { ...skill.metadata, tags };
        }
        if (category !== undefined) {
          skill.metadata = { ...skill.metadata, category };
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

        const changed: string[] = [];
        if (description !== undefined) changed.push('description');
        if (body !== undefined) changed.push('body');
        if (tags !== undefined) changed.push('tags');
        if (category !== undefined) changed.push('category');

        return {
          content: [{
            type: 'text' as const,
            text: `Updated "${name}": ${changed.join(', ')} modified.`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_clone ─────────────────────────────────────────────
  server.tool(
    'ahub_clone',
    'Duplicate a skill under a new name',
    {
      name: z.string().describe('Source skill name'),
      newName: z.string().describe('New skill name for the clone'),
      source: z.string().optional().describe('Source ID'),
    },
    async ({ name, newName, source }) => {
      try {
        assertSafeSkillName(newName);
        const provider = await getProvider(source);

        if (await provider.exists(newName)) {
          throw new Error(`Skill "${newName}" already exists.`);
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

        return {
          content: [{
            type: 'text' as const,
            text: `Cloned "${name}" → "${newName}" (${clonedPkg.files.length} file(s)).`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_rename ────────────────────────────────────────────
  server.tool(
    'ahub_rename',
    'Rename a skill in the store (creates new, deletes old)',
    {
      oldName: z.string().describe('Current skill name'),
      newName: z.string().describe('New skill name'),
      source: z.string().optional().describe('Source ID'),
    },
    async ({ oldName, newName, source }) => {
      try {
        assertSafeSkillName(newName);
        const provider = await getProvider(source);

        if (await provider.exists(newName)) {
          throw new Error(`Skill "${newName}" already exists.`);
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

        return {
          content: [{
            type: 'text' as const,
            text: `Renamed "${oldName}" → "${newName}".`,
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── ahub_info ──────────────────────────────────────────────
  server.tool(
    'ahub_info',
    'Get detailed statistics and metadata for a skill',
    {
      name: z.string().describe('Skill name'),
      source: z.string().optional().describe('Source ID'),
    },
    async ({ name, source }) => {
      try {
        const provider = await getProvider(source);
        const pkg = await provider.get(name);
        const stats = getSkillStats(pkg);
        const ext = extractSkillExtensions(pkg.skill);

        const lines = [
          `# ${pkg.skill.name}`,
          '',
          `**Type:** ${stats.type}`,
          `**Description:** ${pkg.skill.description}`,
          `**Words:** ${stats.wordCount}`,
          `**Lines:** ${stats.lineCount}`,
          `**Characters:** ${stats.charCount}`,
          `**Files:** ${stats.fileCount} (${pkg.files.map((f) => f.relativePath).join(', ')})`,
          `**Total size:** ${formatBytes(stats.totalBytes)}`,
        ];

        if (ext.tags && ext.tags.length > 0) {
          lines.push(`**Tags:** ${ext.tags.join(', ')}`);
        }
        if (ext.category) {
          lines.push(`**Category:** ${ext.category}`);
        }
        if (ext.targets && ext.targets.length > 0) {
          lines.push(`**Targets:** ${ext.targets.join(', ')}`);
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
