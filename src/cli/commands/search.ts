/**
 * `ahub search <query>` — Search for skills whose name matches a query.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { requireConfig } from '../../core/config.js';
import { createProvider } from '../../storage/factory.js';

export function createSearchCommand(): Command {
  return new Command('search')
    .description('Search skills by name')
    .argument('<query>', 'Search query (substring match)')
    .action(async (query: string) => {
      try {
        await runSearch(query);
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

async function runSearch(query: string): Promise<void> {
  const config = await requireConfig();
  const provider = createProvider(config);

  const spinner = ora(`Searching for "${query}"...`).start();
  const allNames = await provider.list();
  const matches = allNames.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
  spinner.stop();

  if (matches.length === 0) {
    console.log(chalk.yellow(`No skills matching "${query}".`));

    // Suggest similar names from the already-fetched full list.
    const suggestions = allNames
      .filter((n) => levenshteinClose(n, query))
      .slice(0, 5);

    if (suggestions.length > 0) {
      console.log('');
      console.log(chalk.dim('Did you mean:'));
      for (const s of suggestions) {
        console.log(`  ${chalk.cyan(s)}`);
      }
    }

    return;
  }

  console.log('');
  console.log(chalk.bold(`Results for "${query}":`));
  console.log('');

  for (const name of matches) {
    console.log(`  ${chalk.cyan(name)}`);
  }

  console.log('');
  console.log(chalk.dim(`  ${matches.length} match(es)`));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple heuristic: return true when at least half of the characters in
 * `query` appear in `name`, or the edit distance is below a threshold.
 * Good enough for "did you mean" suggestions without pulling in a library.
 */
function levenshteinClose(name: string, query: string): boolean {
  const a = name.toLowerCase();
  const b = query.toLowerCase();

  // Check substring overlap first.
  let overlap = 0;
  for (const ch of b) {
    if (a.includes(ch)) overlap++;
  }
  if (overlap >= b.length * 0.6) return true;

  // Simple edit-distance check.
  const dist = editDistance(a, b);
  return dist <= Math.max(2, Math.floor(b.length * 0.4));
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }

  return dp[m]![n]!;
}
