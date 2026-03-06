/**
 * WSL (Windows Subsystem for Linux) path resolution utilities.
 *
 * Handles conversion between WSL UNC paths (\\wsl.localhost\Ubuntu\...)
 * and native Linux paths (/home/...) and detects the WSL environment.
 */

import { readFileSync } from 'node:fs';
import os from 'node:os';

// ---------------------------------------------------------------------------
// WSL detection
// ---------------------------------------------------------------------------

let _isWSLCached: boolean | undefined;

/**
 * Detect whether the current environment is WSL.
 * Result is cached after the first call.
 */
export function isWSL(): boolean {
  if (_isWSLCached !== undefined) return _isWSLCached;

  try {
    const release = readFileSync('/proc/version', 'utf-8');
    _isWSLCached = /microsoft|wsl/i.test(release);
  } catch {
    _isWSLCached = false;
  }

  return _isWSLCached;
}

// ---------------------------------------------------------------------------
// Path conversion
// ---------------------------------------------------------------------------

/**
 * Regex to match WSL UNC paths like:
 *   \\wsl.localhost\Ubuntu\home\user\...
 *   \\wsl$\Ubuntu\home\user\...
 *   //wsl.localhost/Ubuntu/home/user/...
 */
const WSL_UNC_REGEX = /^(?:\\\\|\/\/)wsl(?:\.localhost|\$)[/\\]([^/\\]+)[/\\]?(.*)?$/i;

/**
 * Convert a WSL UNC path to its native Linux equivalent.
 *
 * Examples:
 *   \\wsl.localhost\Ubuntu\home\user → /home/user
 *   //wsl.localhost/Ubuntu/home/user → /home/user
 *   /home/user → /home/user (passthrough)
 */
export function resolveWSLPath(inputPath: string): string {
  const match = inputPath.match(WSL_UNC_REGEX);
  if (!match) return inputPath;

  // match[2] is everything after the distro name
  const rest = match[2] ?? '';
  const nativePath = '/' + rest.replace(/\\/g, '/');
  return nativePath;
}

/**
 * Convert a native Linux path to a WSL UNC path.
 * Only useful when running in a context that needs Windows UNC paths.
 *
 * @param linuxPath - Absolute Linux path (e.g. /home/user/project)
 * @param distro - WSL distribution name (default: auto-detect or 'Ubuntu')
 */
export function toWSLUncPath(linuxPath: string, distro?: string): string {
  const dist = distro ?? detectWSLDistro() ?? 'Ubuntu';
  const cleaned = linuxPath.replace(/^\//, '');
  return `\\\\wsl.localhost\\${dist}\\${cleaned.replace(/\//g, '\\')}`;
}

/**
 * Normalize a path that may be a WSL UNC path or a native path.
 * Always returns a native POSIX path usable from within WSL/Linux.
 */
export function normalizePath(inputPath: string): string {
  // Convert WSL UNC paths to native
  const resolved = resolveWSLPath(inputPath);
  // Ensure forward slashes
  return resolved.replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Distro detection
// ---------------------------------------------------------------------------

/**
 * Attempt to detect the WSL distribution name from environment variables.
 */
export function detectWSLDistro(): string | null {
  return process.env.WSL_DISTRO_NAME ?? null;
}

// ---------------------------------------------------------------------------
// Home directory (WSL-aware)
// ---------------------------------------------------------------------------

/**
 * Get the home directory, resolving WSL UNC paths if needed.
 */
export function getHomeDir(): string {
  const home = os.homedir();
  return normalizePath(home);
}
