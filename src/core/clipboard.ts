/**
 * Platform-aware clipboard copy utility.
 *
 * Detects the current platform and uses the appropriate native command
 * (pbcopy on macOS, xclip/xsel on Linux, clip.exe on Windows/WSL)
 * to write text to the system clipboard.
 */

import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { AhubError } from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClipboardCommand {
  cmd: string;
  args: string[];
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/**
 * Resolve the clipboard command for the current platform.
 *
 * @returns The command + args to pipe text into, or `null` when no
 *   clipboard utility is available.
 */
export function resolveClipboardCommand(): ClipboardCommand | null {
  const os = platform();

  switch (os) {
    case 'darwin':
      return { cmd: 'pbcopy', args: [] };

    case 'linux':
      // WSL exposes clip.exe; prefer it over xclip since X11 may not be running.
      if (isWSL()) {
        return { cmd: 'clip.exe', args: [] };
      }
      // Native Linux — prefer xclip, fall back to xsel.
      return { cmd: 'xclip', args: ['-selection', 'clipboard'] };

    case 'win32':
      return { cmd: 'clip', args: [] };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Clipboard API
// ---------------------------------------------------------------------------

/**
 * Copy text to the system clipboard.
 *
 * @param text - The UTF-8 string to copy.
 * @throws {AhubError} when no clipboard command is available or the
 *   command exits with a non-zero code.
 */
export async function copyToClipboard(text: string): Promise<void> {
  const resolved = resolveClipboardCommand();

  if (!resolved) {
    throw new AhubError(
      'No clipboard command available on this platform. ' +
        'Install xclip (Linux) or run on macOS/Windows.',
    );
  }

  return new Promise<void>((resolve, reject) => {
    const child = execFile(resolved.cmd, resolved.args, (err) => {
      if (err) {
        reject(
          new AhubError(
            `Clipboard command "${resolved.cmd}" failed: ${err.message}`,
            { cause: err },
          ),
        );
      } else {
        resolve();
      }
    });

    // Write text via stdin and close the stream.
    child.stdin?.write(text);
    child.stdin?.end();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check for WSL by looking at the release string. */
function isWSL(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs');
    const release = readFileSync('/proc/version', 'utf-8');
    return /microsoft|wsl/i.test(release);
  } catch {
    return false;
  }
}
