/**
 * `ahub export <name> [--format zip|folder] [--output <path>]`
 *
 * Export a skill from the store to a local directory or .zip file.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import { saveSkillPackage } from '../../core/skill.js';

export function createExportCommand(): Command {
  return new Command('export')
    .description('Export a skill to a local directory or .zip file')
    .argument('<name>', 'Skill name to export')
    .option(
      '-f, --format <format>',
      'Output format: folder or zip',
      'folder',
    )
    .option(
      '-o, --output <path>',
      'Output path (defaults to ./<name>/ or ./<name>.zip)',
    )
    .action(
      async (name: string, opts: { format: string; output?: string }) => {
        try {
          await runExport(name, opts);
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

async function runExport(
  name: string,
  opts: { format: string; output?: string },
): Promise<void> {
  const format = opts.format as 'folder' | 'zip';
  if (format !== 'folder' && format !== 'zip') {
    throw new Error(
      `Invalid format "${opts.format}". Expected "folder" or "zip".`,
    );
  }

  const config = await requireConfig();
  const provider = createProvider(config);

  const spinner = ora(`Fetching "${name}"...`).start();
  const pkg = await provider.get(name);
  spinner.succeed(`Fetched "${name}"`);

  if (format === 'folder') {
    const outputDir = opts.output
      ? path.resolve(opts.output)
      : path.resolve(name);

    await saveSkillPackage(outputDir, pkg);
    console.log(chalk.green(`Exported to: ${outputDir}`));
  } else {
    // zip
    const zipPath = opts.output
      ? path.resolve(opts.output)
      : path.resolve(`${name}.zip`);

    await exportAsZip(pkg, zipPath);
    console.log(chalk.green(`Exported to: ${zipPath}`));
  }
}

// ---------------------------------------------------------------------------
// Zip helper
// ---------------------------------------------------------------------------

/**
 * Create a .zip archive from a skill package.
 *
 * We shell out to `zip` for simplicity; Node.js does not include a
 * built-in zip writer.
 */
async function exportAsZip(
  pkg: { skill: { name: string }; files: Array<{ relativePath: string; content: string }> },
  zipPath: string,
): Promise<void> {
  const os = await import('node:os');
  const { mkdtemp, rm } = await import('node:fs/promises');

  // Write package to a temp directory first.
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), 'ahub-export-'),
  );
  const pkgDir = path.join(tempDir, pkg.skill.name);

  await mkdir(pkgDir, { recursive: true });
  for (const file of pkg.files) {
    const filePath = path.join(pkgDir, file.relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, 'utf-8');
  }

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    await mkdir(path.dirname(zipPath), { recursive: true });
    await exec('zip', ['-r', '-q', zipPath, pkg.skill.name], {
      cwd: tempDir,
    });
  } catch {
    throw new Error(
      'Failed to create .zip archive. Ensure "zip" is installed ' +
        'or export as a folder instead.',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
