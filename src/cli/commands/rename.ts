/**
 * `ahub rename <old-name> <new-name>` — Rename a skill in the store.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { getMarkerFile, serializeSkill, validateSkill } from '../../core/skill.js';
import { assertSafeSkillName } from '../../core/sanitize.js';

export function createRenameCommand(): Command {
  return new Command('rename')
    .description('Rename a skill in the store')
    .argument('<old-name>', 'Current skill name')
    .argument('<new-name>', 'New skill name')
    .option('-s, --source <id>', 'Storage source')
    .action(
      async (
        oldName: string,
        newName: string,
        opts: { source?: string },
      ) => {
        try {
          await runRename(oldName, newName, opts.source);
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

async function runRename(
  oldName: string,
  newName: string,
  sourceId?: string,
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

  // Check that destination doesn't exist.
  if (await provider.exists(newName)) {
    throw new Error(
      `Skill "${newName}" already exists. Delete it first or choose another name.`,
    );
  }

  // Fetch original.
  const spinner = ora(`Fetching "${oldName}"...`).start();
  const pkg = await provider.get(oldName);
  spinner.succeed(`Fetched "${oldName}"`);

  // Create renamed copy.
  const renamedSkill = { ...pkg.skill, name: newName };
  validateSkill(renamedSkill);

  const markerFile = getMarkerFile(renamedSkill.type);
  const content = serializeSkill(renamedSkill);

  // Build new package: marker file with updated content + companion files as-is.
  const renamedFiles = [
    { relativePath: markerFile, content },
    ...pkg.files.filter((f) => f.relativePath !== markerFile && f.relativePath !== getMarkerFile(pkg.skill.type)),
  ];

  const renamedPkg = { skill: renamedSkill, files: renamedFiles };

  // Push new, then delete old.
  const pushSpinner = ora(`Renaming "${oldName}" → "${newName}"...`).start();
  await provider.put(renamedPkg);
  await provider.delete(oldName);
  pushSpinner.succeed(`Renamed "${oldName}" → "${newName}"`);
}
