/**
 * `ahub source` — Manage named storage sources (multi-repo configuration).
 *
 * Sub-commands:
 *   ahub source add      — Add a new source
 *   ahub source remove   — Remove a source
 *   ahub source list     — List all sources
 *   ahub source default  — Set the default source
 *   ahub source enable   — Enable a source
 *   ahub source disable  — Disable a source
 *   ahub source detect   — Auto-detect local skill directories
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  addSource,
  removeSource,
  listSources,
  setDefaultSource,
  setSourceEnabled,
  detectLocalSkillDirs,
  loadConfigV2,
} from '../../core/config.js';
import { assertSafeSourceId } from '../../core/sanitize.js';
import type { SourceConfig } from '../../core/types.js';

export function createSourceCommand(): Command {
  const cmd = new Command('source')
    .description('Manage named storage sources');

  // ─── source add ───────────────────────────────────────────
  cmd
    .command('add')
    .description('Add a new storage source')
    .requiredOption('--id <id>', 'Unique source ID (kebab-case)')
    .requiredOption('--provider <type>', 'Provider type: git, drive, github, or local')
    .option('--repo <url>', 'Git repository URL (for git provider)')
    .option('--branch <branch>', 'Git branch (default: main)')
    .option('--skills-dir <dir>', 'Skills subdirectory within repo (default: .)')
    .option('--dir <path>', 'Local directory path (for local provider)')
    .option('--folder <id>', 'Google Drive folder ID (for drive provider)')
    .option('--owner <login>', 'GitHub owner/login (for github provider)')
    .option('--repo-name <name>', 'GitHub repository name (for github provider)')
    .option('--base-path <path>', 'Base path inside GitHub repository (default: .)')
    .option('--account-login <login>', 'Authenticated GitHub account login (for github provider)')
    .option('--account-id <id>', 'Authenticated GitHub account id (for github provider)')
    .option('--visibility <visibility>', 'GitHub repository visibility: private or public')
    .option('--label <label>', 'Human-readable label')
    .action(async (opts) => {
      try {
        assertSafeSourceId(opts.id);

        const source: SourceConfig = {
          id: opts.id,
          label: opts.label,
          provider: opts.provider,
          enabled: true,
        };

        switch (opts.provider) {
          case 'git':
            if (!opts.repo) {
              console.error(chalk.red('Error: --repo is required for git provider.'));
              process.exitCode = 1;
              return;
            }
            source.git = {
              repoUrl: opts.repo,
              branch: opts.branch ?? 'main',
              skillsDir: opts.skillsDir ?? '.',
            };
            break;

          case 'local':
            if (!opts.dir) {
              console.error(chalk.red('Error: --dir is required for local provider.'));
              process.exitCode = 1;
              return;
            }
            source.local = {
              directory: opts.dir,
            };
          break;

          case 'github':
            if (!opts.owner || !opts.repoName || !opts.accountLogin || !opts.accountId) {
              console.error(
                chalk.red(
                  'Error: --owner, --repo-name, --account-login and --account-id are required for github provider.',
                ),
              );
              process.exitCode = 1;
              return;
            }
            source.github = {
              owner: opts.owner,
              repo: opts.repoName,
              branch: opts.branch ?? 'main',
              basePath: opts.basePath ?? '.',
              accountLogin: opts.accountLogin,
              accountId: opts.accountId,
              visibility: opts.visibility === 'public' ? 'public' : 'private',
            };
            break;

          case 'drive':
            if (!opts.folder) {
              console.error(chalk.red('Error: --folder is required for drive provider.'));
              process.exitCode = 1;
              return;
            }
            source.drive = {
              folderId: opts.folder,
            };
            break;

          default:
            console.error(chalk.red(`Error: Unknown provider "${opts.provider}". Use git, drive, github, or local.`));
            process.exitCode = 1;
            return;
        }

        await addSource(source);
        console.log(chalk.green(`Source "${opts.id}" added successfully.`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ─── source remove ────────────────────────────────────────
  cmd
    .command('remove <id>')
    .description('Remove a storage source')
    .action(async (id: string) => {
      try {
        await removeSource(id);
        console.log(chalk.green(`Source "${id}" removed.`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ─── source list ──────────────────────────────────────────
  cmd
    .command('list')
    .alias('ls')
    .description('List all configured sources')
    .action(async () => {
      try {
        const sources = await listSources();
        const cfg = await loadConfigV2();
        const defaultId = cfg?.defaultSource;

        if (sources.length === 0) {
          console.log(chalk.yellow('No sources configured. Run "ahub source add" to add one.'));
          return;
        }

        console.log('');
        console.log(chalk.bold('  ID              Provider  Status    Details'));
        console.log(chalk.dim('  ' + '─'.repeat(65)));

        for (const s of sources) {
          const isDefault = s.id === defaultId;
          const enabled = s.enabled !== false;
          const status = enabled ? chalk.green('enabled') : chalk.dim('disabled');
          const defaultMark = isDefault ? chalk.cyan(' (default)') : '';
          const detail = getSourceDetail(s);
          const id = s.label ? `${s.id} (${s.label})` : s.id;

          console.log(`  ${id.padEnd(16)} ${s.provider.padEnd(10)}${status.padEnd(18)}${detail}${defaultMark}`);
        }

        console.log('');
        console.log(chalk.dim(`  ${sources.length} source(s) configured`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ─── source default ───────────────────────────────────────
  cmd
    .command('default <id>')
    .description('Set the default source')
    .action(async (id: string) => {
      try {
        await setDefaultSource(id);
        console.log(chalk.green(`Default source set to "${id}".`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ─── source enable ────────────────────────────────────────
  cmd
    .command('enable <id>')
    .description('Enable a source')
    .action(async (id: string) => {
      try {
        await setSourceEnabled(id, true);
        console.log(chalk.green(`Source "${id}" enabled.`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ─── source disable ───────────────────────────────────────
  cmd
    .command('disable <id>')
    .description('Disable a source')
    .action(async (id: string) => {
      try {
        await setSourceEnabled(id, false);
        console.log(chalk.yellow(`Source "${id}" disabled.`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ─── source detect ────────────────────────────────────────
  cmd
    .command('detect')
    .description('Auto-detect local .skills/ directories')
    .option('--from <dir>', 'Start searching from this directory (default: cwd)')
    .action(async (opts) => {
      try {
        const spinner = ora('Searching for .skills/ directories...').start();
        const dirs = await detectLocalSkillDirs(opts.from);
        spinner.stop();

        if (dirs.length === 0) {
          console.log(chalk.yellow('No .skills/ directories found with SKILL.md files.'));
          return;
        }

        console.log(chalk.green(`Found ${dirs.length} skill director${dirs.length === 1 ? 'y' : 'ies'}:`));
        console.log('');
        for (const dir of dirs) {
          console.log(`  ${dir}`);
        }
        console.log('');
        console.log(chalk.dim('Add one with: ahub source add --id <name> --provider local --dir <path>'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  return cmd;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSourceDetail(source: SourceConfig): string {
  switch (source.provider) {
    case 'git':
      return source.git?.repoUrl ?? '(no repo)';
    case 'drive':
      return source.drive?.folderId ?? '(no folder)';
    case 'local':
      return source.local?.directory ?? '(no directory)';
    case 'github':
      return source.github ? `${source.github.owner}/${source.github.repo}` : '(no repository)';
    default:
      return '';
  }
}
