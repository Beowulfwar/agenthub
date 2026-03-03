/**
 * `ahub push <path>` — Push a local skill directory to the remote store.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import { loadSkillPackage } from '../../core/skill.js';
import { SkillValidationError } from '../../core/errors.js';

export function createPushCommand(): Command {
  return new Command('push')
    .description('Push a local skill directory to the store')
    .argument('<path>', 'Path to the skill directory (must contain SKILL.md)')
    .action(async (dirPath: string) => {
      try {
        await runPush(dirPath);
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

async function runPush(dirPath: string): Promise<void> {
  // Load and validate.
  const spinner = ora('Loading skill package...').start();
  const pkg = await loadSkillPackage(dirPath);
  spinner.succeed(`Loaded "${pkg.skill.name}"`);

  // Basic validation.
  const violations: string[] = [];
  if (!pkg.skill.name) violations.push('Skill name is required.');
  if (!pkg.skill.description) violations.push('Skill description is required.');
  if (!pkg.files.some((f) => f.relativePath === 'SKILL.md')) {
    violations.push('Package must include a SKILL.md file.');
  }
  if (violations.length > 0) {
    throw new SkillValidationError(violations);
  }

  // Push to remote.
  const config = await requireConfig();
  const provider = createProvider(config);

  const pushSpinner = ora(
    `Pushing "${pkg.skill.name}" to ${provider.name}...`,
  ).start();
  await provider.put(pkg);
  pushSpinner.succeed(
    `Pushed "${pkg.skill.name}" (${pkg.files.length} file(s))`,
  );
}
