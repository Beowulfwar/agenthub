/**
 * `ahub clone <name> --as <new-name>` — Duplicate a skill under a new name.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { getMarkerFile, serializeSkill, validateSkill } from '../../core/skill.js';
import { assertSafeSkillName } from '../../core/sanitize.js';

export function createCloneCommand(): Command {
  return new Command('clone')
    .description('Duplicate a skill under a new name')
    .argument('<name>', 'Source skill name')
    .requiredOption('--as <new-name>', 'New skill name for the clone')
    .option('-s, --source <id>', 'Storage source')
    .option('--force', 'Overwrite if destination already exists')
    .action(
      async (
        name: string,
        opts: { as: string; source?: string; force?: boolean },
      ) => {
        try {
          await runClone(name, opts.as, opts.source, opts.force);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(chalk.red(`Error: ${msg}`));
          process.exitCode = 1;
        }
      },
    );
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runClone(
  name: string,
  newName: string,
  sourceId?: string,
  force?: boolean,
): Promise<void> {
  assertSafeSkillName(newName);

  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  // Check for existing destination.
  if (!force && (await provider.exists(newName))) {
    throw new Error(
      `Skill "${newName}" already exists. Use --force to overwrite.`,
    );
  }

  // Fetch original.
  const spinner = ora(`Fetching "${name}"...`).start();
  const pkg = await provider.get(name);
  spinner.succeed(`Fetched "${name}"`);

  // Create clone with updated name.
  const clonedSkill = { ...pkg.skill, name: newName };
  validateSkill(clonedSkill);

  const markerFile = getMarkerFile(clonedSkill.type);
  const content = serializeSkill(clonedSkill);

  // Build new package: marker file with new content + companion files as-is.
  const clonedFiles = [
    { relativePath: markerFile, content },
    ...pkg.files.filter((f) => f.relativePath !== markerFile && f.relativePath !== getMarkerFile(pkg.skill.type)),
  ];

  const clonedPkg = { skill: clonedSkill, files: clonedFiles };

  const pushSpinner = ora(`Cloning as "${newName}"...`).start();
  await provider.put(clonedPkg);
  pushSpinner.succeed(
    `Cloned "${name}" → "${newName}" (${clonedFiles.length} file(s))`,
  );
}
