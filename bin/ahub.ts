#!/usr/bin/env node

/**
 * Agent Hub CLI entrypoint.
 *
 * This file is the `bin` target declared in package.json and is
 * invoked when the user runs `ahub` (or `npx ahub`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCli } from '../src/cli/index.js';

// Read version from package.json synchronously at startup.
function getVersion(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    // From dist/bin/ahub.js → go up 3 levels to project root
    const pkgPath = path.resolve(thisFile, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = createCli();
program.version(getVersion(), '-v, --version', 'Show the CLI version');
program.parse();
