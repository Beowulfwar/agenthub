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
import { createSyncCommand } from './commands/sync.js';
import { createMigrateCommand } from './commands/migrate.js';
import { createImportCommand } from './commands/import-cmd.js';
import { createExportCommand } from './commands/export-cmd.js';
import { createConfigCommand } from './commands/config-cmd.js';
import { createUiCommand } from './commands/ui.js';
import { createSourceCommand } from './commands/source.js';
import { createCopyCommand } from './commands/copy.js';
import { createEditCommand } from './commands/edit.js';
import { createCloneCommand } from './commands/clone.js';
import { createRenameCommand } from './commands/rename.js';
import { createInfoCommand } from './commands/info.js';
import { createWorkspaceCommand } from './commands/workspace.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createMigrateAppCommand } from './commands/migrate-app.js';

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
  program.addCommand(createSyncCommand());
  program.addCommand(createMigrateCommand());
  program.addCommand(createImportCommand());
  program.addCommand(createExportCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createUiCommand());
  program.addCommand(createSourceCommand());
  program.addCommand(createCopyCommand());
  program.addCommand(createEditCommand());
  program.addCommand(createCloneCommand());
  program.addCommand(createRenameCommand());
  program.addCommand(createInfoCommand());
  program.addCommand(createWorkspaceCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createMigrateAppCommand());

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
