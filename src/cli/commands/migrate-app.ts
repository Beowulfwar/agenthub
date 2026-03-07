import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';

import { executeAppMigration, planAppMigration } from '../../core/app-migration.js';
import type { AgentAppId, AppMigrationPlan } from '../../core/types.js';

const VALID_APPS: AgentAppId[] = [
  'codex',
  'claude-code',
  'cursor',
  'windsurf',
  'cline',
  'continue',
  'gemini-cli',
  'amp',
  'github-copilot',
  'antigravity',
];

export function createMigrateAppCommand(): Command {
  return new Command('migrate-app')
    .description('Plan or execute migration between official app repositories')
    .requiredOption('--from <app>', `Source app: ${VALID_APPS.join(', ')}`)
    .requiredOption('--to <app>', `Target app: ${VALID_APPS.join(', ')}`)
    .option('-w, --workspace <dir>', 'Workspace directory to inspect', process.cwd())
    .option('--skill <name>', 'Only migrate a specific artifact/skill name')
    .option('--all', 'Plan or migrate every detected artifact for the source app')
    .option('--dry-run', 'Only print the migration plan')
    .option('-y, --yes', 'Skip confirmation before writing files')
    .option('--json', 'Print JSON output')
    .action(async (opts: {
      from: AgentAppId;
      to: AgentAppId;
      workspace?: string;
      skill?: string;
      all?: boolean;
      dryRun?: boolean;
      yes?: boolean;
      json?: boolean;
    }) => {
      try {
        if (!VALID_APPS.includes(opts.from) || !VALID_APPS.includes(opts.to)) {
          throw new Error(`Apps validos: ${VALID_APPS.join(', ')}`);
        }

        const params = {
          workspaceDir: opts.workspace ?? process.cwd(),
          fromApp: opts.from,
          toApp: opts.to,
          ...(opts.skill ? { skill: opts.skill } : {}),
          ...(opts.all ? { all: true } : {}),
        } as const;

        const plan = await planAppMigration(params);

        if (opts.json) {
          console.log(JSON.stringify(plan, null, 2));
          return;
        }

        printPlan(plan);

        if (opts.dryRun) {
          return;
        }

        if (!plan.executable) {
          process.exitCode = 1;
          return;
        }

        const shouldProceed = opts.yes
          ? true
          : await inquirer
              .prompt<{ proceed: boolean }>([
                {
                  type: 'confirm',
                  name: 'proceed',
                  message: `Aplicar ${plan.plannedCount} migracao(oes) de ${plan.fromApp} para ${plan.toApp}?`,
                  default: true,
                },
              ])
              .then((answer) => answer.proceed);

        if (!shouldProceed) {
          console.log(chalk.yellow('Aborted.'));
          return;
        }

        await executeAppMigration(params);
        console.log(chalk.green('Migration applied.'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });
}

function printPlan(plan: AppMigrationPlan): void {
  console.log(chalk.bold(`Migration plan: ${plan.fromApp} -> ${plan.toApp}`));
  console.log(chalk.dim(`Workspace: ${plan.workspaceDir}`));
  console.log(
    `${plan.executable ? chalk.green('executable') : chalk.yellow('plan-only')} | planned=${plan.plannedCount} blocked=${plan.blockedCount}`,
  );
  console.log('');

  if (plan.blockedReasons.length > 0) {
    console.log(chalk.yellow('Blocked reasons:'));
    for (const reason of plan.blockedReasons) {
      console.log(`- ${reason}`);
    }
    console.log('');
  }

  for (const item of plan.items) {
    const status = item.migratable ? chalk.green(item.lossiness) : chalk.red('blocked');
    console.log(`${item.name}: ${status}`);
    console.log(chalk.dim(`  from: ${item.sourcePath}`));
    console.log(chalk.dim(`  to:   ${item.targetPath}`));

    for (const warning of item.warnings) {
      console.log(chalk.yellow(`  warning: ${warning}`));
    }

    for (const reason of item.blockedReasons) {
      console.log(chalk.red(`  blocked: ${reason}`));
    }

    for (const step of item.manualSteps) {
      console.log(chalk.yellow(`  manual: ${step}`));
    }
  }

  if (plan.items.length === 0) {
    console.log(chalk.yellow('No migration items generated.'));
  }
}
