/**
 * `ahub edit <name>` — Open a skill in $EDITOR, then push changes back.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { requireConfig } from '../../core/config.js';
import { createProvider, createProviderFromSource } from '../../storage/factory.js';
import { getMarkerFile, parseSkill, serializeSkill, validateSkill } from '../../core/skill.js';

export function createEditCommand(): Command {
  return new Command('edit')
    .description('Open a skill in $EDITOR, then push changes back to the store')
    .argument('<name>', 'Skill name to edit')
    .option('-s, --source <id>', 'Fetch from / push to this source')
    .option('-e, --editor <cmd>', 'Editor command (defaults to $EDITOR or vi)')
    .action(async (name: string, opts: { source?: string; editor?: string }) => {
      try {
        await runEdit(name, opts.source, opts.editor);
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

async function runEdit(
  name: string,
  sourceId?: string,
  editorOverride?: string,
): Promise<void> {
  const config = await requireConfig();

  let provider;
  if (sourceId && config.version === 2 && config.sources) {
    const src = config.sources.find((s) => s.id === sourceId);
    if (!src) throw new Error(`Source "${sourceId}" not found.`);
    provider = createProviderFromSource(src);
  } else {
    provider = createProvider(config);
  }

  // 1. Fetch the skill.
  const spinner = ora(`Fetching "${name}"...`).start();
  const pkg = await provider.get(name);
  spinner.succeed(`Fetched "${name}"`);

  // 2. Write marker file to a temp directory.
  const markerFile = getMarkerFile(pkg.skill.type);
  const originalContent = serializeSkill(pkg.skill);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `ahub-edit-${name}-`));
  const tmpFile = path.join(tmpDir, markerFile);
  await writeFile(tmpFile, originalContent, 'utf-8');

  try {
    // 3. Open in editor.
    const editor = editorOverride || process.env.EDITOR || 'vi';
    console.log(chalk.dim(`Opening ${markerFile} in ${editor}...`));
    execFileSync(editor, [tmpFile], { stdio: 'inherit' });

    // 4. Read modified content.
    const modifiedContent = await readFile(tmpFile, 'utf-8');

    // 5. Check if anything changed.
    if (modifiedContent === originalContent) {
      console.log(chalk.yellow('No changes detected — skipping push.'));
      return;
    }

    // 6. Parse and validate.
    const updatedSkill = parseSkill(modifiedContent);
    // Preserve the original name (don't allow renaming via edit).
    updatedSkill.name = pkg.skill.name;
    // Preserve type.
    if (!updatedSkill.type) {
      updatedSkill.type = pkg.skill.type;
    }
    validateSkill(updatedSkill);

    // 7. Push back.
    const pushSpinner = ora('Pushing changes...').start();
    const updatedPkg = {
      skill: updatedSkill,
      files: [{ relativePath: markerFile, content: serializeSkill(updatedSkill) }],
    };
    await provider.put(updatedPkg);
    pushSpinner.succeed(`Updated "${name}" in ${provider.name} storage`);
  } finally {
    // 8. Clean up temp directory.
    await rm(tmpDir, { recursive: true, force: true });
  }
}
