/**
 * Tests for src/core/clipboard.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock child_process.execFile and os.platform at the module level.
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

const mockPlatform = vi.fn<() => string>();
vi.mock('node:os', () => ({
  platform: () => mockPlatform(),
}));

// Import AFTER mocks are set up (module resolution captures mocks).
import { resolveClipboardCommand, copyToClipboard } from '../../src/core/clipboard.js';

describe('clipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // resolveClipboardCommand
  // ---------------------------------------------------------------------------

  describe('resolveClipboardCommand', () => {
    it('returns pbcopy for darwin', () => {
      mockPlatform.mockReturnValue('darwin');
      const result = resolveClipboardCommand();
      expect(result).toEqual({ cmd: 'pbcopy', args: [] });
    });

    it('returns xclip for linux (non-WSL)', () => {
      mockPlatform.mockReturnValue('linux');
      // Mock fs.readFileSync to return non-WSL content
      vi.spyOn(require('node:fs'), 'readFileSync').mockReturnValue(
        'Linux version 5.15.0-generic',
      );
      const result = resolveClipboardCommand();
      expect(result).toEqual({ cmd: 'xclip', args: ['-selection', 'clipboard'] });
    });

    it('returns clip for win32', () => {
      mockPlatform.mockReturnValue('win32');
      const result = resolveClipboardCommand();
      expect(result).toEqual({ cmd: 'clip', args: [] });
    });

    it('returns null for unknown platforms', () => {
      mockPlatform.mockReturnValue('freebsd');
      const result = resolveClipboardCommand();
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // copyToClipboard
  // ---------------------------------------------------------------------------

  describe('copyToClipboard', () => {
    it('throws when no clipboard command available', async () => {
      mockPlatform.mockReturnValue('freebsd');
      await expect(copyToClipboard('hello')).rejects.toThrow(
        /No clipboard command available/,
      );
    });

    it('calls execFile with correct command for darwin', async () => {
      mockPlatform.mockReturnValue('darwin');

      // Simulate successful execFile: invoke the callback with no error.
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: (err: Error | null) => void) => {
          // Call callback asynchronously
          setTimeout(() => callback(null), 0);
          // Return a mock child with stdin
          return {
            stdin: { write: vi.fn(), end: vi.fn() },
          };
        },
      );

      await copyToClipboard('test content');

      expect(mockExecFile).toHaveBeenCalledWith(
        'pbcopy',
        [],
        expect.any(Function),
      );
    });

    it('writes text to stdin of child process', async () => {
      mockPlatform.mockReturnValue('darwin');

      const mockWrite = vi.fn();
      const mockEnd = vi.fn();

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: (err: Error | null) => void) => {
          setTimeout(() => callback(null), 0);
          return {
            stdin: { write: mockWrite, end: mockEnd },
          };
        },
      );

      await copyToClipboard('hello clipboard');

      expect(mockWrite).toHaveBeenCalledWith('hello clipboard');
      expect(mockEnd).toHaveBeenCalled();
    });

    it('throws AhubError when command fails', async () => {
      mockPlatform.mockReturnValue('darwin');

      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], callback: (err: Error | null) => void) => {
          setTimeout(() => callback(new Error('command not found')), 0);
          return {
            stdin: { write: vi.fn(), end: vi.fn() },
          };
        },
      );

      await expect(copyToClipboard('test')).rejects.toThrow(
        /Clipboard command "pbcopy" failed/,
      );
    });
  });
});
