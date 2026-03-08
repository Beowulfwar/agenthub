import { Command } from 'commander';
import chalk from 'chalk';

import { applyStorageLayoutMigration, planStorageLayoutMigration } from '../../core/storage-layout-migration.js';

export function createMigrateLayoutCommand(): Command {
  return new Command('migrate-layout')
    .description('Migrate legacy flat storage directories to skills/prompts/subagents')
    .requiredOption('--dir <path>', 'Root directory that stores the content catalog')
    .option('--apply', 'Rename legacy directories into the canonical typed layout')
    .action(async (opts: { dir: string; apply?: boolean }) => {
      try {
        const report = opts.apply
          ? await applyStorageLayoutMigration(opts.dir)
          : await planStorageLayoutMigration(opts.dir);

        if (report.items.length === 0) {
          console.log(chalk.yellow('Nenhum diretorio legado encontrado para migrar.'));
          return;
        }

        console.log(chalk.bold(`Layout raiz: ${report.rootDir}`));
        console.log('');

        for (const item of report.items) {
          const status = item.status === 'ready'
            ? chalk.green(opts.apply ? 'movido' : 'pronto')
            : chalk.red('conflito');
          console.log(`${status} ${chalk.cyan(`${item.type}/${item.name}`)}`);
          console.log(`  origem: ${item.sourcePath}`);
          console.log(`  destino: ${item.destinationPath}`);
          if (item.reason) {
            console.log(`  motivo: ${item.reason}`);
          }
        }

        console.log('');
        console.log(`Itens prontos: ${chalk.green(String(report.movableCount))}`);
        console.log(`Conflitos: ${report.conflictCount > 0 ? chalk.red(String(report.conflictCount)) : chalk.green('0')}`);

        if (!opts.apply) {
          console.log(chalk.gray('Execute novamente com --apply para mover os itens prontos.'));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${message}`));
        process.exitCode = 1;
      }
    });
}
