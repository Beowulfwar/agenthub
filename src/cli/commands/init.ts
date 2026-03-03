/**
 * `ahub init` — Interactive setup for a storage backend.
 *
 * Guides the user through choosing a provider (git / drive) and
 * configuring it.  Persists the result to ~/.ahub/config.json.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { simpleGit } from 'simple-git';
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm, stat } from 'node:fs/promises';
import { saveConfig, loadConfig } from '../../core/config.js';
import type { AhubConfig } from '../../core/types.js';

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialise a storage backend (git or Google Drive)')
    .option('-p, --provider <provider>', 'Storage provider: git or drive')
    .option('-r, --repo <url>', 'Git repository URL (only with --provider git)')
    .option('-b, --branch <branch>', 'Git branch to sync (default: main)')
    .option('-d, --skills-dir <dir>', 'Sub-directory for skills (default: .)')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (opts: { provider?: string; repo?: string; branch?: string; skillsDir?: string; yes?: boolean }) => {
      try {
        await runInit(opts);
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

async function runInit(opts: { provider?: string; repo?: string; branch?: string; skillsDir?: string; yes?: boolean }): Promise<void> {
  const existing = await loadConfig();
  if (existing && !opts.yes) {
    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'A configuration already exists. Overwrite it?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Determine provider.
  let provider: 'git' | 'drive' = opts.provider as 'git' | 'drive';

  if (!provider) {
    const answer = await inquirer.prompt<{ provider: 'git' | 'drive' }>([
      {
        type: 'list',
        name: 'provider',
        message: 'Choose a storage provider:',
        choices: [
          { name: 'Git repository', value: 'git' },
          { name: 'Google Drive', value: 'drive' },
        ],
      },
    ]);
    provider = answer.provider;
  }

  if (provider === 'git') {
    await initGit(opts.repo, opts.branch, opts.skillsDir);
  } else if (provider === 'drive') {
    await initDrive();
  } else {
    throw new Error(`Unknown provider "${provider}". Expected "git" or "drive".`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Git flow
// ---------------------------------------------------------------------------

async function initGit(repoUrlArg?: string, branchArg?: string, skillsDirArg?: string): Promise<void> {
  let repoUrl: string;
  if (!repoUrlArg) {
    const answer = await inquirer.prompt<{ repoUrl: string }>([
      {
        type: 'input',
        name: 'repoUrl',
        message: 'Git repository URL (HTTPS or SSH):',
        validate: (input: string) =>
          input.trim().length > 0 || 'Repository URL is required.',
      },
    ]);
    repoUrl = answer.repoUrl.trim();
  } else {
    repoUrl = repoUrlArg;
  }

  let branch: string;
  if (branchArg) {
    branch = branchArg;
  } else {
    const answer = await inquirer.prompt<{ branch: string }>([
      {
        type: 'input',
        name: 'branch',
        message: 'Branch to sync:',
        default: 'main',
      },
    ]);
    branch = answer.branch;
  }

  let skillsDir: string;
  if (skillsDirArg) {
    skillsDir = skillsDirArg;
  } else {
    const answer = await inquirer.prompt<{ skillsDir: string }>([
      {
        type: 'input',
        name: 'skillsDir',
        message: 'Sub-directory for skills (. for repo root):',
        default: '.',
      },
    ]);
    skillsDir = answer.skillsDir;
  }

  // Derive local clone path.
  const repoName = repoUrl
    .replace(/\.git\/?$/, '')
    .split(/[/:]/)
    .filter(Boolean)
    .at(-1) ?? 'repo';
  const localDir = path.join(os.homedir(), '.ahub', 'repos', repoName);

  // Clean up previous clone if it exists.
  if (await dirExists(localDir)) {
    await rm(localDir, { recursive: true, force: true });
  }

  console.log(chalk.dim(`Cloning into ${localDir}...`));
  await mkdir(path.dirname(localDir), { recursive: true });

  const git = simpleGit();

  // Try cloning with the requested branch first.
  // If the repo is empty (no branches), fall back to a plain clone
  // and create the branch locally.
  try {
    await git.clone(repoUrl, localDir, [
      '--branch',
      branch,
      '--single-branch',
    ]);
  } catch {
    // Clean up failed clone attempt.
    if (await dirExists(localDir)) {
      await rm(localDir, { recursive: true, force: true });
    }

    // Plain clone (works for empty repos and repos whose default branch
    // differs from the requested one).
    console.log(chalk.dim('Branch not found, cloning default branch...'));
    await git.clone(repoUrl, localDir);

    const localGit = simpleGit(localDir);

    // If the repo is completely empty, create an initial commit so the
    // branch can exist.
    const log = await localGit.log().catch(() => null);
    if (!log || log.total === 0) {
      console.log(chalk.dim('Empty repository — creating initial commit...'));
      const readmePath = path.join(localDir, 'README.md');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(readmePath, '# agent-hub store\n\nSkills managed by agent-hub.\n');
      await localGit.add('.');
      await localGit.commit('Initial commit');
    }

    // Ensure the requested branch exists.
    const branches = await localGit.branchLocal();
    if (!branches.all.includes(branch)) {
      await localGit.checkoutLocalBranch(branch);
    } else if (branches.current !== branch) {
      await localGit.checkout(branch);
    }

    // Push the branch to the remote so future pulls work.
    try {
      await localGit.push('origin', branch, ['--set-upstream']);
    } catch {
      // Push may fail for local bare repos without a matching branch —
      // that's ok, we'll push on the first `ahub push`.
    }
  }

  const config: AhubConfig = {
    provider: 'git',
    git: {
      repoUrl,
      branch,
      skillsDir,
    },
  };

  await saveConfig(config);

  console.log('');
  console.log(chalk.green('✔ Configuration saved to ~/.ahub/config.json'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  ${chalk.cyan('ahub list')}            List available skills`);
  console.log(`  ${chalk.cyan('ahub push <path>')}     Push a local skill`);
  console.log(`  ${chalk.cyan('ahub deploy <name>')}   Deploy a skill to your IDE`);
}

// ---------------------------------------------------------------------------
// Google Drive flow
// ---------------------------------------------------------------------------

async function initDrive(): Promise<void> {
  console.log(chalk.yellow('Google Drive provider setup'));
  console.log('');
  console.log(
    'You need a GCP project with the Drive API enabled and OAuth2 credentials.',
  );
  console.log(
    'Follow: https://developers.google.com/drive/api/quickstart/nodejs',
  );
  console.log('');

  const { credentialsPath } = await inquirer.prompt<{ credentialsPath: string }>([
    {
      type: 'input',
      name: 'credentialsPath',
      message: 'Path to GCP credentials JSON (leave blank to skip for now):',
      default: '',
    },
  ]);

  const { folderId } = await inquirer.prompt<{ folderId: string }>([
    {
      type: 'input',
      name: 'folderId',
      message:
        'Drive folder ID (leave blank to create "ahub-store" folder on first use):',
      default: '',
    },
  ]);

  const config: AhubConfig = {
    provider: 'drive',
    drive: {
      folderId: folderId || 'ahub-store',
      ...(credentialsPath ? { credentialsPath } : {}),
    },
  };

  await saveConfig(config);

  console.log('');
  console.log(chalk.green('✔ Configuration saved to ~/.ahub/config.json'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(
    `  ${chalk.cyan('ahub list')}   List skills`,
  );
}
