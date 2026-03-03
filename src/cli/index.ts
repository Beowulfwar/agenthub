/**
 * CLI entrypoint — creates and configures the commander program with
 * all `ahub` sub-commands.
 *
 * Usage:
 *   import { createCli } from './cli/index.js';
 *   const program = createCli();
 *   program.parse();
 */

import { Command } from 'commander';

// Sub-commands
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createGetCommand } from './commands/get.js';
import { createPushCommand } from './commands/push.js';
import { createSearchCommand } from './commands/search.js';
import { createDeployCommand } from './commands/deploy.js';
import { createMigrateCommand } from './commands/migrate.js';
import { createImportCommand } from './commands/import-cmd.js';
import { createExportCommand } from './commands/export-cmd.js';
import { createConfigCommand } from './commands/config-cmd.js';

/**
 * Create the top-level Commander program with every sub-command
 * registered.
 */
export function createCli(): Command {
  const program = new Command();

  program
    .name('ahub')
    .description(
      'CLI for managing AI agent skills across Git and Google Drive backends',
    );

  // Register all sub-commands.
  program.addCommand(createInitCommand());
  program.addCommand(createListCommand());
  program.addCommand(createGetCommand());
  program.addCommand(createPushCommand());
  program.addCommand(createSearchCommand());
  program.addCommand(createDeployCommand());
  program.addCommand(createMigrateCommand());
  program.addCommand(createImportCommand());
  program.addCommand(createExportCommand());
  program.addCommand(createConfigCommand());

  // MCP sub-command — starts the Model Context Protocol server.
  program
    .command('mcp')
    .description('Start the MCP (Model Context Protocol) server')
    .action(async () => {
      try {
        const { startMcpServer } = await import('../mcp/server.js');
        await startMcpServer();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to start MCP server: ${msg}`);
        process.exitCode = 1;
      }
    });

  return program;
}
