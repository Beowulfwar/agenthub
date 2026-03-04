/**
 * `ahub init` — Zero-config setup for a storage backend.
 *
 * Git:   auto-creates a GitHub repo via `gh` CLI (no manual setup).
 * Drive: auto-creates a Google Drive folder via OAuth2 (no manual setup).
 *
 * The user just picks a provider — everything else is automatic.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { simpleGit } from 'simple-git';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { saveConfig, loadConfig } from '../../core/config.js';
import type { AhubConfig } from '../../core/types.js';

const execFileAsync = promisify(execFile);

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialise a storage backend (git or Google Drive)')
    .option('-p, --provider <provider>', 'Storage provider: git or drive')
    .option('-r, --repo <url>', 'Git repository URL (skip auto-creation)')
    .option('-n, --name <name>', 'Repository/folder name (default: ahub-skills)')
    .option('-b, --branch <branch>', 'Git branch to sync (default: main)')
    .option('-d, --skills-dir <dir>', 'Sub-directory for skills (default: .)')
    .option('--private', 'Create private repository (default)', true)
    .option('--public', 'Create public repository')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (opts: {
      provider?: string;
      repo?: string;
      name?: string;
      branch?: string;
      skillsDir?: string;
      private?: boolean;
      public?: boolean;
      yes?: boolean;
    }) => {
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
// Types
// ---------------------------------------------------------------------------

interface InitOpts {
  provider?: string;
  repo?: string;
  name?: string;
  branch?: string;
  skillsDir?: string;
  private?: boolean;
  public?: boolean;
  yes?: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runInit(opts: InitOpts): Promise<void> {
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
          { name: 'Git (GitHub) — requires gh CLI', value: 'git' },
          { name: 'Google Drive — just a Google account', value: 'drive' },
        ],
      },
    ]);
    provider = answer.provider;
  }

  if (provider === 'git') {
    await initGit(opts);
  } else if (provider === 'drive') {
    await initDrive(opts);
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

/** Run a shell command and return stdout, or null on failure. */
async function exec(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 30_000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Git flow — auto-create GitHub repo
// ---------------------------------------------------------------------------

async function initGit(opts: InitOpts): Promise<void> {
  let repoUrl: string;
  const branch = opts.branch ?? 'main';
  const skillsDir = opts.skillsDir ?? '.';

  if (opts.repo) {
    // User explicitly provided a repo URL — skip auto-creation.
    repoUrl = opts.repo;
    console.log(chalk.dim(`Using existing repo: ${repoUrl}`));
  } else {
    // Auto-create a GitHub repo via gh CLI.
    repoUrl = await autoCreateGitHubRepo(opts);
  }

  // Clone & bootstrap.
  await cloneAndBootstrap(repoUrl, branch);

  const config: AhubConfig = {
    provider: 'git',
    git: { repoUrl, branch, skillsDir },
  };

  await saveConfig(config);
  printSuccess();
}

/**
 * Auto-create a GitHub repository using the `gh` CLI.
 * Returns the HTTPS clone URL of the newly created repo.
 */
async function autoCreateGitHubRepo(opts: InitOpts): Promise<string> {
  // 1. Check gh is installed.
  const ghVersion = await exec('gh', ['--version']);
  if (!ghVersion) {
    console.log('');
    console.log(chalk.red('GitHub CLI (gh) is not installed.'));
    console.log('');
    console.log('Install it:');
    console.log(`  ${chalk.cyan('https://cli.github.com/')}`);
    console.log('');
    console.log('Or use Google Drive instead:');
    console.log(`  ${chalk.cyan('ahub init --provider drive')}`);
    console.log('');
    throw new Error('gh CLI not found. Install it or use --provider drive.');
  }

  // 2. Check gh is authenticated.
  const authStatus = await exec('gh', ['auth', 'status']);
  if (!authStatus) {
    console.log('');
    console.log(chalk.yellow('GitHub CLI is not authenticated.'));
    console.log('');
    console.log('Run this first:');
    console.log(`  ${chalk.cyan('gh auth login')}`);
    console.log('');
    throw new Error('gh CLI not authenticated. Run "gh auth login" first.');
  }

  // 3. Get GitHub username for display.
  const ghUser = await exec('gh', ['api', 'user', '--jq', '.login']);
  const username = ghUser ?? 'user';

  // 4. Determine repo name.
  let repoName: string;
  if (opts.name) {
    repoName = opts.name;
  } else if (opts.yes) {
    repoName = 'ahub-skills';
  } else {
    const answer = await inquirer.prompt<{ repoName: string }>([
      {
        type: 'input',
        name: 'repoName',
        message: 'Repository name:',
        default: 'ahub-skills',
      },
    ]);
    repoName = answer.repoName.trim();
  }

  const visibility = opts.public ? 'public' : 'private';
  const fullName = `${username}/${repoName}`;

  // 5. Check if repo already exists.
  const existing = await exec('gh', ['repo', 'view', fullName, '--json', 'url', '--jq', '.url']);
  if (existing) {
    console.log(chalk.dim(`Repository ${fullName} already exists, using it.`));
    return existing.endsWith('.git') ? existing : `${existing}.git`;
  }

  // 6. Create the repo.
  console.log(chalk.dim(`Creating ${visibility} repository ${fullName} on GitHub...`));

  const createResult = await exec('gh', [
    'repo', 'create', repoName,
    `--${visibility}`,
    '--description', 'Skills managed by agent-hub',
    '--clone=false',
  ]);

  if (!createResult) {
    throw new Error(`Failed to create GitHub repository "${repoName}".`);
  }

  // 7. Get the clone URL.
  const cloneUrl = await exec('gh', ['repo', 'view', fullName, '--json', 'url', '--jq', '.url']);
  if (!cloneUrl) {
    throw new Error(`Repository created but could not retrieve URL for "${fullName}".`);
  }

  console.log(chalk.green(`✔ Created ${cloneUrl}`));
  return cloneUrl.endsWith('.git') ? cloneUrl : `${cloneUrl}.git`;
}

// ---------------------------------------------------------------------------
// Clone & bootstrap (shared logic)
// ---------------------------------------------------------------------------

async function cloneAndBootstrap(repoUrl: string, branch: string): Promise<void> {
  const repoName = repoUrl
    .replace(/\.git\/?$/, '')
    .split(/[/:]/)
    .filter(Boolean)
    .at(-1) ?? 'repo';
  const localDir = path.join(os.homedir(), '.ahub', 'repos', repoName);

  // Clean up previous clone.
  if (await dirExists(localDir)) {
    await rm(localDir, { recursive: true, force: true });
  }

  console.log(chalk.dim(`Cloning into ${localDir}...`));
  await mkdir(path.dirname(localDir), { recursive: true });

  const git = simpleGit();

  try {
    await git.clone(repoUrl, localDir, ['--branch', branch, '--single-branch']);
  } catch {
    // Clean up failed clone.
    if (await dirExists(localDir)) {
      await rm(localDir, { recursive: true, force: true });
    }

    console.log(chalk.dim('Branch not found, cloning default branch...'));
    await git.clone(repoUrl, localDir);

    const localGit = simpleGit(localDir);

    // Empty repo → create initial commit.
    const log = await localGit.log().catch(() => null);
    if (!log || log.total === 0) {
      console.log(chalk.dim('Empty repository — creating initial commit...'));
      await writeFile(
        path.join(localDir, 'README.md'),
        '# agent-hub store\n\nSkills managed by [agent-hub](https://github.com/Beowulfwar/agenthub).\n',
      );
      await localGit.add('.');
      await localGit.commit('Initial commit');
    }

    // Ensure requested branch exists.
    const branches = await localGit.branchLocal();
    if (!branches.all.includes(branch)) {
      await localGit.checkoutLocalBranch(branch);
    } else if (branches.current !== branch) {
      await localGit.checkout(branch);
    }

    // Push so future pulls work.
    try {
      await localGit.push('origin', branch, ['--set-upstream']);
    } catch {
      // OK — we'll push on first `ahub push`.
    }
  }
}

// ---------------------------------------------------------------------------
// Google Drive flow — zero-config with OAuth2
// ---------------------------------------------------------------------------

async function initDrive(opts: InitOpts): Promise<void> {
  const folderName = opts.name ?? 'ahub-skills';

  console.log('');
  console.log(chalk.bold('Google Drive setup'));
  console.log(chalk.dim('A folder will be created automatically in your Drive.'));
  console.log(chalk.dim('You will be asked to sign in with your Google account.'));
  console.log('');

  // The actual OAuth flow + folder creation happens lazily on first use
  // via DriveProvider.ensureClient(). We just save the config here.
  const config: AhubConfig = {
    provider: 'drive',
    drive: {
      folderId: folderName,
    },
  };

  await saveConfig(config);

  console.log(chalk.green(`✔ Configuration saved (folder: "${folderName}")`));
  console.log(chalk.dim('  OAuth sign-in will happen on first use (ahub list, ahub push, etc.)'));
  printSuccess();
}

// ---------------------------------------------------------------------------
// Shared output
// ---------------------------------------------------------------------------

function printSuccess(): void {
  console.log('');
  console.log(chalk.green('✔ agent-hub is ready!'));
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  ${chalk.cyan('ahub list')}            List available skills`);
  console.log(`  ${chalk.cyan('ahub push <path>')}     Push a local skill`);
  console.log(`  ${chalk.cyan('ahub deploy <name>')}   Deploy a skill to your IDE`);
}
