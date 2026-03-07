import { Command } from 'commander';
import chalk from 'chalk';

import { buildWorkspaceAppInventories } from '../../core/app-artifacts.js';

export function createDoctorCommand(): Command {
  return new Command('doctor')
    .description('Audit local app repositories and explain visibility/drift issues')
    .option('-w, --workspace <dir>', 'Workspace directory to inspect', process.cwd())
    .option('--json', 'Print JSON output')
    .action(async (opts: { workspace?: string; json?: boolean }) => {
      try {
        const workspaceDir = opts.workspace ?? process.cwd();
        const inventories = await buildWorkspaceAppInventories(workspaceDir);

        if (opts.json) {
          console.log(JSON.stringify({ workspaceDir, apps: inventories }, null, 2));
          return;
        }

        console.log(chalk.bold(`Workspace doctor: ${workspaceDir}`));
        console.log('');

        const relevant = inventories.filter((app) => app.counts.total > 0 || app.supportLevel === 'official_app_unverified_layout');
        if (relevant.length === 0) {
          console.log(chalk.yellow('Nenhum artefato conhecido foi encontrado neste workspace.'));
          return;
        }

        for (const app of relevant) {
          console.log(chalk.bold(`${app.label} [${app.supportLevel}]`));
          if (app.canonicalPaths.length > 0) {
            console.log(chalk.dim(`  canonical: ${app.canonicalPaths.join(' | ')}`));
          }
          if (app.legacyPaths.length > 0) {
            console.log(chalk.dim(`  legacy:    ${app.legacyPaths.join(' | ')}`));
          }

          console.log(
            `  total=${app.counts.total} visible=${app.counts.visible_in_app} legacy=${app.counts.found_in_legacy_repository} wrong=${app.counts.found_in_wrong_repository} unverifiable=${app.counts.found_but_unverifiable_for_app}`,
          );

          for (const artifact of app.artifacts) {
            console.log(
              `  - ${artifact.name} [${artifact.artifactKind}] ${artifact.visibilityStatus}`,
            );
            console.log(chalk.dim(`    found:    ${artifact.detectedPath}`));
            console.log(chalk.dim(`    expected: ${artifact.expectedPath}`));
          }

          console.log('');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Error: ${msg}`));
        process.exitCode = 1;
      }
    });
}
