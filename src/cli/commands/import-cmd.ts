/**
 * `ahub import <path>` — Import a local skill directory or .zip into the store.
 *
 * Accepts either:
 *   - A folder path containing a SKILL.md file.
 *   - A .zip archive of such a folder (extracted to a temp dir first).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import os from 'node:os';
import { stat } from 'node:fs/promises';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';
import { loadSkillPackage } from '../../core/skill.js';

export function createImportCommand(): Command {
  return new Command('import')
    .description('Import a skill from a local directory or .zip file')
    .argument('<path>', 'Path to a skill directory or .zip archive')
    .action(async (inputPath: string) => {
      try {
        await runImport(inputPath);
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

async function runImport(inputPath: string): Promise<void> {
  const resolved = path.resolve(inputPath);

  let dirToLoad: string;
  let tempDir: string | null = null;

  if (resolved.endsWith('.zip') && (await isFile(resolved))) {
    // Extract zip to a temp directory.
    const spinner = ora('Extracting archive...').start();
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ahub-import-'));
    await extractZip(resolved, tempDir);
    spinner.succeed('Archive extracted');

    // The zip may contain a single directory or files directly.
    dirToLoad = await findSkillDir(tempDir);
  } else if (await isDirectory(resolved)) {
    dirToLoad = resolved;
  } else {
    throw new Error(
      `"${inputPath}" is not a directory or .zip file. ` +
        'Provide a folder with a SKILL.md or a .zip archive.',
    );
  }

  try {
    const spinner = ora('Loading skill package...').start();
    const pkg = await loadSkillPackage(dirToLoad);
    spinner.succeed(`Loaded "${pkg.skill.name}"`);

    const config = await requireConfig();
    const provider = createProvider(config);

    const pushSpinner = ora(
      `Pushing "${pkg.skill.name}" to ${provider.name}...`,
    ).start();
    await provider.put(pkg);
    pushSpinner.succeed(
      `Imported "${pkg.skill.name}" (${pkg.files.length} file(s))`,
    );
  } finally {
    // Clean up temp directory if we created one.
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Return true when `p` exists and is a regular file. */
async function isFile(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Return true when `p` exists and is a directory. */
async function isDirectory(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Zip helpers
// ---------------------------------------------------------------------------

/**
 * Extract a .zip file into `destDir`.
 *
 * Since Node.js does not have native zip support, we shell out to `unzip`.
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);

  try {
    await exec('unzip', ['-o', '-q', zipPath, '-d', destDir]);
  } catch {
    throw new Error(
      'Failed to extract .zip file. Ensure "unzip" is installed ' +
        'or provide an extracted directory instead.',
    );
  }
}

/**
 * Given an extracted directory, find where SKILL.md lives.
 * If the zip contained a single wrapper directory, descend into it.
 */
async function findSkillDir(dir: string): Promise<string> {
  if (await isFile(path.join(dir, 'SKILL.md'))) {
    return dir;
  }

  // Check if there's a subdirectory containing SKILL.md.
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  for (const d of dirs) {
    const candidate = path.join(dir, d.name);
    if (await isFile(path.join(candidate, 'SKILL.md'))) {
      return candidate;
    }
  }

  throw new Error(
    'No SKILL.md found in the extracted archive. ' +
      'The archive must contain a directory with a SKILL.md file.',
  );
}
