/**
 * `ahub list` — List all skills available in the configured storage backend.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig, getWorkspaceRegistry } from '../../core/config.js';
import { loadWorkspaceManifest, resolveManifestSkills } from '../../core/workspace.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import type { ContentType } from '../../core/types.js';
import path from 'node:path';

export function createListCommand(): Command {
  return new Command('list')
    .alias('ls')
    .description('List all available skills')
    .option('-s, --source <id>', 'Only list skills from this source')
    .option('-T, --type <type>', 'Filter by content type (skill, prompt, subagent)')
    .option('-w, --workspace', 'Group skills by workspace membership')
    .action(async (opts: { source?: string; type?: string; workspace?: boolean }) => {
      try {
        await runList(opts.source, opts.type as ContentType | undefined, opts.workspace);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runList(sourceId?: string, type?: ContentType, groupByWorkspace?: boolean): Promise<void> {
  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  const spinner = ora('Loading skills...').start();
  const names = await provider.list(type ? { type } : undefined);
  spinner.stop();

  if (names.length === 0) {
    const suffix = type ? ` of type "${type}"` : '';
    console.log(chalk.yellow(`No skills found${suffix} in the store.`));
    return;
  }

  if (groupByWorkspace) {
    await printGroupedByWorkspace(names);
    return;
  }

  // Formatted table output.
  const header = type ? `  #  ${type.charAt(0).toUpperCase() + type.slice(1)} Name` : '  #  Skill Name';
  console.log('');
  console.log(chalk.bold(header));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  for (let i = 0; i < names.length; i++) {
    const idx = String(i + 1).padStart(3, ' ');
    console.log(`  ${chalk.dim(idx)}  ${names[i]}`);
  }

  console.log('');
  console.log(chalk.dim(`  ${names.length} item(s) total`));
}

async function printGroupedByWorkspace(allSkills: string[]): Promise<void> {
  const registry = await getWorkspaceRegistry();

  // Build workspace → skill names mapping
  interface WsGroup {
    name: string;
    isActive: boolean;
    skills: string[];
  }

  const groups: WsGroup[] = [];
  const assignedSkills = new Set<string>();

  for (const filePath of registry.paths) {
    try {
      const manifest = await loadWorkspaceManifest(filePath);
      const wsName = manifest.name || path.basename(path.dirname(filePath));
      const resolved = resolveManifestSkills(manifest);
      const skillNames = resolved.map((r) => r.name).filter((n) => allSkills.includes(n));
      skillNames.forEach((n) => assignedSkills.add(n));
      if (skillNames.length > 0) {
        groups.push({
          name: wsName,
          isActive: filePath === registry.active,
          skills: skillNames,
        });
      }
    } catch {
      // skip broken manifests
    }
  }

  const unassigned = allSkills.filter((n) => !assignedSkills.has(n));
  let counter = 0;

  console.log('');
  for (const group of groups) {
    const label = group.isActive ? `${group.name} ${chalk.green('(active)')}` : group.name;
    console.log(chalk.bold(`  ${label}`));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const skill of group.skills) {
      counter++;
      const idx = String(counter).padStart(3, ' ');
      console.log(`  ${chalk.dim(idx)}  ${skill}`);
    }
    console.log('');
  }

  if (unassigned.length > 0) {
    console.log(chalk.bold.dim('  Unassigned'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const skill of unassigned) {
      counter++;
      const idx = String(counter).padStart(3, ' ');
      console.log(`  ${chalk.dim(idx)}  ${skill}`);
    }
    console.log('');
  }

  const wsCount = groups.length;
  console.log(chalk.dim(`  ${allSkills.length} item(s) total across ${wsCount} workspace(s)`));
}
