/**
 * `ahub workspace` — Manage workspace registrations.
 *
 * Sub-commands:
 *   register [path]   Interactive directory explorer for registering skill directories
 *   list               List all registered workspaces
 *   active [path]      Set active workspace
 *   unregister <path>  Remove a workspace from registry
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'node:path';

import {
  getWorkspaceRegistry,
  registerWorkspace,
  unregisterWorkspace,
  setActiveWorkspace,
} from '../../core/config.js';
import {
  scanForSkillDirs,
  listDirectory,
  suggestStartDirs,
  isValidDirectory,
  WELL_KNOWN_SKILL_DIRS,
} from '../../core/explorer.js';
import type { DetectedSkillDir } from '../../core/explorer.js';
import { normalizePath } from '../../core/wsl.js';
import {
  findWorkspaceManifest,
  loadWorkspaceManifest,
  saveWorkspaceManifest,
} from '../../core/workspace.js';
import type { WorkspaceManifest } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Command factory
// ---------------------------------------------------------------------------

export function createWorkspaceCommand(): Command {
  const cmd = new Command('workspace')
    .description('Manage workspace registrations and skill directories');

  cmd
    .command('register')
    .alias('add')
    .description('Interactive explorer to find and register skill directories')
    .argument('[path]', 'Starting directory to explore')
    .option('-y, --yes', 'Skip confirmations')
    .action(async (startPath?: string, opts?: { yes?: boolean }) => {
      try {
        await runRegister(startPath, opts?.yes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .alias('ls')
    .description('List all registered workspaces')
    .action(async () => {
      try {
        await runList();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  cmd
    .command('active [path]')
    .description('Set the active workspace')
    .action(async (manifestPath?: string) => {
      try {
        await runSetActive(manifestPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  cmd
    .command('unregister <path>')
    .alias('remove')
    .description('Unregister a workspace')
    .action(async (manifestPath: string) => {
      try {
        await unregisterWorkspace(manifestPath);
        console.log(chalk.green(`Unregistered: ${manifestPath}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  return cmd;
}

// ---------------------------------------------------------------------------
// register — Interactive directory explorer
// ---------------------------------------------------------------------------

async function runRegister(startPath?: string, skipConfirm?: boolean): Promise<void> {
  console.log('');
  console.log(chalk.bold('Workspace Registration'));
  console.log(chalk.dim('Navigate to a project directory to detect skill locations.'));
  console.log('');

  // Determine starting directory
  let currentDir: string;

  if (startPath) {
    currentDir = normalizePath(path.resolve(startPath));
    if (!(await isValidDirectory(currentDir))) {
      throw new Error(`Directory not found: ${currentDir}`);
    }
  } else {
    currentDir = await chooseStartDir();
  }

  // Quick-scan for skill directories at current location
  console.log(chalk.dim(`\nScanning ${currentDir} for skill directories...`));
  let detected = await scanForSkillDirs(currentDir);

  if (detected.length > 0) {
    printDetected(detected);
    const choice = await promptDetectedAction(detected, currentDir);

    if (choice === 'accept') {
      await registerDetected(detected, currentDir, skipConfirm);
      return;
    } else if (choice === 'select') {
      await selectAndRegister(detected, currentDir, skipConfirm);
      return;
    }
    // choice === 'browse' — fall through to explorer
  } else {
    console.log(chalk.yellow('No skill directories detected at this location.'));
    console.log('');
  }

  // Interactive directory browser loop
  while (true) {
    const entries = await listDirectory(currentDir);

    const choices: Array<{ name: string; value: string }> = [
      {
        name: chalk.bold.green('>> Use this directory'),
        value: '__SELECT_CURRENT__',
      },
      {
        name: chalk.dim('.. (parent directory)'),
        value: '__GO_UP__',
      },
      {
        name: chalk.cyan('Type a path manually'),
        value: '__MANUAL__',
      },
    ];

    for (const entry of entries) {
      let display = `  ${entry.name}/`;
      if (entry.skillMatch) {
        display += chalk.green(
          ` [${entry.skillMatch.label}: ${entry.skillMatch.count} items]`,
        );
      }
      choices.push({ name: display, value: entry.fullPath });
    }

    const { action } = await inquirer.prompt<{ action: string }>([
      {
        type: 'list',
        name: 'action',
        message: `${chalk.bold(currentDir)}\nSelect a directory:`,
        choices,
      } as never,
    ]);

    if (action === '__SELECT_CURRENT__') {
      detected = await scanForSkillDirs(currentDir);
      if (detected.length > 0) {
        printDetected(detected);
        await selectAndRegister(detected, currentDir, skipConfirm);
      } else {
        // No known patterns — ask user to pick or create a manifest
        await registerManual(currentDir, skipConfirm);
      }
      return;
    }

    if (action === '__GO_UP__') {
      const parent = path.dirname(currentDir);
      if (parent !== currentDir) {
        currentDir = parent;
      }
      continue;
    }

    if (action === '__MANUAL__') {
      const { manualPath } = await inquirer.prompt<{ manualPath: string }>([
        {
          type: 'input',
          name: 'manualPath',
          message: 'Enter absolute path:',
          default: currentDir,
        },
      ]);
      const resolved = normalizePath(path.resolve(manualPath));
      if (await isValidDirectory(resolved)) {
        currentDir = resolved;
      } else {
        console.log(chalk.red(`Not a valid directory: ${resolved}`));
      }
      continue;
    }

    // Navigate into selected directory
    if (await isValidDirectory(action)) {
      currentDir = action;

      // Quick-scan the new location
      detected = await scanForSkillDirs(currentDir);
      if (detected.length > 0) {
        printDetected(detected);
        const choice = await promptDetectedAction(detected, currentDir);
        if (choice === 'accept') {
          await registerDetected(detected, currentDir, skipConfirm);
          return;
        } else if (choice === 'select') {
          await selectAndRegister(detected, currentDir, skipConfirm);
          return;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Start directory picker
// ---------------------------------------------------------------------------

async function chooseStartDir(): Promise<string> {
  const suggestions = suggestStartDirs();
  const validSuggestions: Array<{ name: string; value: string }> = [];

  for (const dir of suggestions) {
    if (await isValidDirectory(dir)) {
      const label = dir === process.cwd() ? `${dir} (current)` : dir;
      validSuggestions.push({ name: label, value: dir });
    }
  }

  validSuggestions.push({
    name: chalk.cyan('Enter a custom path'),
    value: '__CUSTOM__',
  });

  const { startDir } = await inquirer.prompt<{ startDir: string }>([
    {
      type: 'list',
      name: 'startDir',
      message: 'Where do you want to start exploring?',
      choices: validSuggestions,
    },
  ]);

  if (startDir === '__CUSTOM__') {
    const { customPath } = await inquirer.prompt<{ customPath: string }>([
      {
        type: 'input',
        name: 'customPath',
        message: 'Enter directory path:',
        default: process.cwd(),
      },
    ]);
    const resolved = normalizePath(path.resolve(customPath));
    if (!(await isValidDirectory(resolved))) {
      throw new Error(`Not a valid directory: ${resolved}`);
    }
    return resolved;
  }

  return startDir;
}

// ---------------------------------------------------------------------------
// Detection display & prompts
// ---------------------------------------------------------------------------

function printDetected(detected: DetectedSkillDir[]): void {
  console.log('');
  console.log(chalk.green.bold(`Found ${detected.length} skill director${detected.length === 1 ? 'y' : 'ies'}:`));
  console.log('');

  for (const dir of detected) {
    const toolBadge = chalk.bgBlue.white(` ${dir.tool} `);
    console.log(`  ${toolBadge} ${chalk.bold(dir.label)}`);
    console.log(`    ${chalk.dim(dir.absolutePath)} (${dir.skillCount} items)`);
  }
  console.log('');
}

async function promptDetectedAction(
  detected: DetectedSkillDir[],
  baseDir: string,
): Promise<'accept' | 'select' | 'browse'> {
  const { action } = await inquirer.prompt<{ action: 'accept' | 'select' | 'browse' }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          name: `Register all ${detected.length} detected directories`,
          value: 'accept',
        },
        {
          name: 'Select which ones to register',
          value: 'select',
        },
        {
          name: 'Keep browsing',
          value: 'browse',
        },
      ],
    },
  ]);
  return action;
}

// ---------------------------------------------------------------------------
// Registration actions
// ---------------------------------------------------------------------------

async function registerDetected(
  detected: DetectedSkillDir[],
  baseDir: string,
  skipConfirm?: boolean,
): Promise<void> {
  // Check for existing manifest or create one
  const manifestPath = await ensureManifest(baseDir, skipConfirm);

  for (const dir of detected) {
    await registerWorkspace(manifestPath);
    console.log(chalk.green(`  Registered: ${dir.label} (${dir.absolutePath})`));
  }

  console.log('');
  console.log(chalk.green.bold('Workspace registered successfully.'));
  console.log(chalk.dim(`  Manifest: ${manifestPath}`));
  printNextSteps();
}

async function selectAndRegister(
  detected: DetectedSkillDir[],
  baseDir: string,
  skipConfirm?: boolean,
): Promise<void> {
  const { selected } = await inquirer.prompt<{ selected: string[] }>([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select directories to register:',
      choices: detected.map((d) => ({
        name: `${d.label} — ${d.absolutePath} (${d.skillCount} items)`,
        value: d.absolutePath,
        checked: true,
      })),
    },
  ]);

  if (selected.length === 0) {
    console.log(chalk.yellow('Nothing selected. Aborted.'));
    return;
  }

  const manifestPath = await ensureManifest(baseDir, skipConfirm);

  for (const dirPath of selected) {
    const match = detected.find((d) => d.absolutePath === dirPath);
    await registerWorkspace(manifestPath);
    console.log(chalk.green(`  Registered: ${match?.label ?? dirPath}`));
  }

  console.log('');
  console.log(chalk.green.bold('Workspace registered successfully.'));
  console.log(chalk.dim(`  Manifest: ${manifestPath}`));
  printNextSteps();
}

async function registerManual(baseDir: string, skipConfirm?: boolean): Promise<void> {
  console.log(chalk.yellow('No well-known skill directories found here.'));
  console.log('');

  const { action } = await inquirer.prompt<{ action: string }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          name: 'Create a new workspace manifest here',
          value: 'create',
        },
        {
          name: 'Register an existing manifest file',
          value: 'existing',
        },
        {
          name: 'Cancel',
          value: 'cancel',
        },
      ],
    },
  ]);

  if (action === 'cancel') return;

  if (action === 'create') {
    const manifestPath = await ensureManifest(baseDir, skipConfirm);
    await registerWorkspace(manifestPath);
    console.log(chalk.green.bold(`\nWorkspace registered: ${manifestPath}`));
    printNextSteps();
    return;
  }

  if (action === 'existing') {
    const manifest = await findWorkspaceManifest(baseDir);
    if (manifest) {
      await registerWorkspace(manifest);
      console.log(chalk.green.bold(`\nWorkspace registered: ${manifest}`));
      printNextSteps();
    } else {
      console.log(chalk.red('No manifest file found in or above this directory.'));
    }
  }
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

async function ensureManifest(baseDir: string, skipConfirm?: boolean): Promise<string> {
  // Check for existing manifest in or above baseDir
  const existing = await findWorkspaceManifest(baseDir);
  if (existing) return existing;

  // Create a new manifest
  const manifestPath = path.join(baseDir, 'ahub.workspace.json');

  if (!skipConfirm) {
    const { create } = await inquirer.prompt<{ create: boolean }>([
      {
        type: 'confirm',
        name: 'create',
        message: `No manifest found. Create ${chalk.cyan('ahub.workspace.json')} at ${baseDir}?`,
        default: true,
      },
    ]);
    if (!create) {
      throw new Error('Aborted — workspace manifest is required for registration.');
    }
  }

  const manifest: WorkspaceManifest = {
    version: 1,
    name: path.basename(baseDir),
    defaultTargets: ['claude-code'],
    skills: [],
  };

  await saveWorkspaceManifest(manifestPath, manifest);
  console.log(chalk.dim(`  Created: ${manifestPath}`));
  return manifestPath;
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function runList(): Promise<void> {
  const registry = await getWorkspaceRegistry();

  if (registry.paths.length === 0) {
    console.log(chalk.yellow('No workspaces registered.'));
    console.log(chalk.dim('Run "ahub workspace register" to add one.'));
    return;
  }

  console.log(chalk.bold(`\nRegistered workspaces (${registry.paths.length}):\n`));

  for (const wsPath of registry.paths) {
    const isActive = wsPath === registry.active;
    const marker = isActive ? chalk.green('*') : ' ';
    const label = isActive ? chalk.green.bold(wsPath) : wsPath;

    try {
      const manifest = await loadWorkspaceManifest(wsPath);
      const name = manifest.name ?? path.basename(path.dirname(wsPath));
      console.log(`  ${marker} ${chalk.bold(name)}`);
      console.log(`    ${chalk.dim(label)}`);
      if (manifest.skills?.length || manifest.groups?.length) {
        const skillCount = (manifest.skills?.length ?? 0) +
          (manifest.groups?.reduce((s, g) => s + g.skills.length, 0) ?? 0);
        console.log(`    ${chalk.dim(`${skillCount} skills configured`)}`);
      }
    } catch {
      console.log(`  ${marker} ${label}`);
      console.log(`    ${chalk.red('(manifest not found or invalid)')}`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// active
// ---------------------------------------------------------------------------

async function runSetActive(manifestPath?: string): Promise<void> {
  const registry = await getWorkspaceRegistry();

  if (registry.paths.length === 0) {
    console.log(chalk.yellow('No workspaces registered.'));
    return;
  }

  let target: string;

  if (manifestPath) {
    target = normalizePath(path.resolve(manifestPath));
  } else {
    // Interactive selection
    const { selected } = await inquirer.prompt<{ selected: string }>([
      {
        type: 'list',
        name: 'selected',
        message: 'Select the active workspace:',
        choices: registry.paths.map((p) => ({
          name: p === registry.active ? `${p} (current)` : p,
          value: p,
        })),
      },
    ]);
    target = selected;
  }

  await setActiveWorkspace(target);
  console.log(chalk.green(`Active workspace set to: ${target}`));
}

// ---------------------------------------------------------------------------
// Shared output
// ---------------------------------------------------------------------------

function printNextSteps(): void {
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  ${chalk.cyan('ahub workspace list')}    View registered workspaces`);
  console.log(`  ${chalk.cyan('ahub sync')}              Sync skills to deploy targets`);
  console.log(`  ${chalk.cyan('ahub list')}              List available skills`);
}
