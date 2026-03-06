/**
 * `ahub sync [--force] [--dry-run] [--filter <name,...>]`
 *
 * Sync all skills declared in the workspace manifest.
 * Reads the nearest `ahub.workspace.json` (or `.ahub.json`),
 * fetches every skill from storage, and deploys each to the
 * target(s) declared in the manifest.
 */

import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { requireWorkspaceManifest } from '../../core/workspace.js';
import { syncWorkspace } from '../../core/sync.js';
import type { SyncProgressEvent } from '../../core/types.js';

export function createSyncCommand(): Command {
  return new Command('sync')
    .description(
      'Sync all skills from the workspace manifest to their deploy targets',
    )
    .option('-f, --force', 'Force re-fetch even if cache is fresh')
    .option('-n, --dry-run', 'Show what would happen without deploying')
    .option(
      '--filter <names>',
      'Only sync specific skills (comma-separated)',
    )
    .action(
      async (opts: { force?: boolean; dryRun?: boolean; filter?: string }) => {
        try {
          await runSync(opts);
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

async function runSync(opts: {
  force?: boolean;
  dryRun?: boolean;
  filter?: string;
}): Promise<void> {
  // 1. Load config (global provider).
  const config = await requireConfig();

  // 2. Find and load the workspace manifest.
  const { manifest, filePath } = await requireWorkspaceManifest();
  console.log(
    chalk.dim(`Workspace: ${filePath}`),
  );

  if (opts.dryRun) {
    console.log(chalk.yellow('(dry-run mode — no files will be written)\n'));
  }

  // 3. Parse filter option.
  const filter = opts.filter
    ? opts.filter.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  // 4. Run the sync engine with a progress spinner.
  const spinner = ora('Starting sync…').start();

  const result = await syncWorkspace(manifest, config, {
    force: opts.force,
    dryRun: opts.dryRun,
    filter,
    workspaceDir: path.dirname(filePath),
    onProgress: (event: SyncProgressEvent) => {
      if (event.phase === 'fetch') {
        spinner.text = `[${event.current}/${event.total}] Fetching "${event.skill}"…`;
      } else {
        spinner.text = `[${event.current}/${event.total}] Deploying "${event.skill}" → ${event.target}…`;
      }
    },
  });

  spinner.stop();

  // 5. Print summary.
  const { deployed, failed, skipped } = result;

  if (deployed.length > 0) {
    console.log(chalk.green(`\n✔ Deployed (${deployed.length}):`));
    for (const entry of deployed) {
      console.log(chalk.dim(`  ${entry.skill} → ${entry.target}  ${entry.path}`));
    }
  }

  if (skipped.length > 0) {
    console.log(chalk.blue(`\n⏭ Skipped — cache fresh (${skipped.length}):`));
    for (const name of skipped) {
      console.log(chalk.dim(`  ${name}`));
    }
  }

  if (failed.length > 0) {
    console.log(chalk.red(`\n✘ Failed (${failed.length}):`));
    for (const entry of failed) {
      console.log(chalk.red(`  ${entry.skill} → ${entry.target}: ${entry.error}`));
    }
    process.exitCode = 1;
  }

  // Final one-liner.
  const parts: string[] = [];
  if (deployed.length) parts.push(chalk.green(`${deployed.length} deployed`));
  if (skipped.length) parts.push(chalk.blue(`${skipped.length} skipped`));
  if (failed.length) parts.push(chalk.red(`${failed.length} failed`));
  console.log(`\nSync complete: ${parts.join(', ')}.`);
}
