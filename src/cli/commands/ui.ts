/**
 * CLI command — `ahub ui`
 *
 * Starts the web UI server. In production mode, serves the built frontend
 * from dist/ui/. In dev mode (--dev), only starts the API server and expects
 * the Vite dev server to run separately.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';

export function createUiCommand(): Command {
  return new Command('ui')
    .description('Start the web UI dashboard')
    .option('-p, --port <port>', 'Port to listen on', '3737')
    .option('--no-open', 'Do not open browser automatically')
    .option('--dev', 'Dev mode: API only, CORS enabled for Vite')
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red('Invalid port number.'));
        process.exitCode = 1;
        return;
      }

      const { startApiServer } = await import('../../api/server.js');

      // Resolve the path to the built frontend.
      // In production (npm package): dist/ui/ relative to the package root.
      // The CLI entrypoint is at dist/bin/ahub.js → package root is ../../
      let staticDir: string | undefined;
      if (!opts.dev) {
        // __dirname equivalent for ESM.
        const thisFile = fileURLToPath(import.meta.url);
        const packageRoot = resolve(dirname(thisFile), '..', '..', '..');
        const uiDist = resolve(packageRoot, 'dist', 'ui');

        if (existsSync(uiDist)) {
          staticDir = uiDist;
        } else {
          console.warn(
            chalk.yellow(
              'Frontend build not found at dist/ui/. Run "npm run build:ui" first, or use --dev mode.',
            ),
          );
          console.warn(chalk.yellow('Starting API-only mode.\n'));
        }
      }

      try {
        await startApiServer({
          port,
          staticDir,
          devMode: !!opts.dev,
        });

        const url = `http://localhost:${port}`;
        console.log('');
        console.log(chalk.green('  ✔ Agent Hub UI is running'));
        console.log('');
        console.log(`    ${chalk.bold('URL:')}      ${chalk.cyan(url)}`);
        console.log(`    ${chalk.bold('API:')}      ${chalk.cyan(`${url}/api/health`)}`);
        console.log(`    ${chalk.bold('Mode:')}     ${opts.dev ? chalk.yellow('Development (API only)') : chalk.green('Production')}`);
        if (staticDir) {
          console.log(`    ${chalk.bold('Static:')}   ${staticDir}`);
        }
        console.log('');
        console.log(chalk.dim('  Press Ctrl+C to stop'));
        console.log('');

        // Open browser (unless --no-open).
        if (opts.open && !opts.dev && staticDir) {
          try {
            const { exec } = await import('node:child_process');
            const platform = process.platform;
            const cmd =
              platform === 'darwin'
                ? `open "${url}"`
                : platform === 'win32'
                  ? `start "${url}"`
                  : `xdg-open "${url}"`;
            exec(cmd);
          } catch {
            // Silently ignore if browser can't be opened.
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to start UI server: ${msg}`));
        process.exitCode = 1;
      }
    });
}
