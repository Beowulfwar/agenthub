/**
 * `ahub config set <key> <value>` / `ahub config get [key]`
 *
 * Read or update individual keys in ~/.ahub/config.json.
 * Supports dot notation for nested keys (e.g. "git.branch").
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadConfig,
  getConfigValue,
  setConfigValue,
  CONFIG_PATH,
} from '../../core/config.js';

export function createConfigCommand(): Command {
  const config = new Command('config').description(
    'View or update ahub configuration',
  );

  // ── config get ────────────────────────────────────────────────────────
  config
    .command('get [key]')
    .description('Show a config value (or the entire config if no key given)')
    .action(async (key?: string) => {
      try {
        await runConfigGet(key);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ── config set ────────────────────────────────────────────────────────
  config
    .command('set <key> <value>')
    .description('Set a config value (supports dot notation, e.g. "git.branch")')
    .action(async (key: string, value: string) => {
      try {
        await runConfigSet(key, value);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });

  return config;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runConfigGet(key?: string): Promise<void> {
  if (!key) {
    // Show entire config.
    const cfg = await loadConfig();
    if (!cfg) {
      console.log(
        chalk.yellow('No configuration file found. Run "ahub init" first.'),
      );
      return;
    }

    console.log('');
    console.log(chalk.dim(`# ${CONFIG_PATH}`));
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }

  const value = await getConfigValue(key);
  if (value === undefined) {
    console.log(chalk.yellow(`Key "${key}" is not set.`));
    return;
  }

  if (typeof value === 'object' && value !== null) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

async function runConfigSet(key: string, value: string): Promise<void> {
  // Attempt to parse as JSON for booleans / numbers / objects.
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value; // Keep as plain string.
  }

  await setConfigValue(key, parsed);

  console.log(chalk.green(`Set ${chalk.bold(key)} = ${JSON.stringify(parsed)}`));
}
