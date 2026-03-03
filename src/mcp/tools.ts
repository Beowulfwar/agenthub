import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../core/config.js';
import { createProvider } from '../storage/factory.js';
import { parseSkill, serializeSkill, validateSkill } from '../core/skill.js';
import { createDeployer } from '../deploy/deployer.js';
import type { StorageProvider } from '../storage/provider.js';
import type { AhubConfig, DeployTarget } from '../core/types.js';

async function getProvider(): Promise<StorageProvider> {
  const config = await loadConfig();
  if (!config) {
    throw new Error(
      'agent-hub not configured. Run "ahub init" first to set up a storage provider.',
    );
  }
  return createProvider(config);
}

export function registerTools(server: McpServer): void {
  // ─── ahub_list ───────────────────────────────────────────────
  server.tool(
    'ahub_list',
    'List all available skills in the agent-hub store',
    { query: z.string().optional().describe('Filter skills by name substring') },
    async ({ query }) => {
      try {
        const provider = await getProvider();
        const skills = await provider.list(query);

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
    { name: z.string().describe('Skill name to retrieve') },
    async ({ name }) => {
      try {
        const provider = await getProvider();
        const pkg = await provider.get(name);
        const { skill } = pkg;

        const header = `# ${skill.name}\n\n**Description:** ${skill.description}\n`;
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
    { query: z.string().describe('Search query') },
    async ({ query }) => {
      try {
        const provider = await getProvider();
        const matches = await provider.list(query);

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
    },
    async ({ name, target }) => {
      try {
        const provider = await getProvider();
        const pkg = await provider.get(name);
        const deployer = await createDeployer(target as DeployTarget);
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
    },
    async ({ name, description, body }) => {
      try {
        const provider = await getProvider();
        const skill = { name, description, body, metadata: {} };
        validateSkill(skill);

        const content = serializeSkill(skill);
        const pkg = {
          skill,
          files: [{ relativePath: 'SKILL.md', content }],
        };

        await provider.put(pkg);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Skill "${name}" pushed successfully to ${provider.name} storage.`,
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

  // ─── ahub_health ─────────────────────────────────────────────
  server.tool(
    'ahub_health',
    'Check agent-hub storage provider connectivity and status',
    {},
    async () => {
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

        const provider = createProvider(config);
        const health = await provider.healthCheck();
        const status = health.ok ? '✅ Connected' : '❌ Disconnected';
        const text = `Provider: ${config.provider}\nStatus: ${status}\nMessage: ${health.message}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
