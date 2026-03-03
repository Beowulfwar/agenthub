import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs/promises before importing the module under test
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock node:os to control homedir
vi.mock('node:os', () => ({
  default: {
    homedir: () => '/mock/home',
  },
  homedir: () => '/mock/home',
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  loadConfig,
  saveConfig,
  requireConfig,
  getConfigValue,
  setConfigValue,
  AHUB_DIR,
  CONFIG_PATH,
} from '../../src/core/config.js';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: mkdir always resolves
  mockMkdir.mockResolvedValue(undefined);
  // Default: writeFile always resolves
  mockWriteFile.mockResolvedValue(undefined);
});

describe('AHUB_DIR and CONFIG_PATH', () => {
  it('AHUB_DIR is based on mocked homedir', () => {
    expect(AHUB_DIR).toContain('.ahub');
    expect(AHUB_DIR).toContain('/mock/home');
  });

  it('CONFIG_PATH ends with config.json', () => {
    expect(CONFIG_PATH).toContain('config.json');
  });
});

describe('loadConfig', () => {
  it('returns null when file does not exist (ENOENT)', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it('returns parsed config when file exists with valid shape', async () => {
    const config = {
      provider: 'git',
      git: { repoUrl: 'https://example.com/repo.git', branch: 'main', skillsDir: '.' },
    };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    const result = await loadConfig();
    expect(result).toEqual(config);
    expect(result!.provider).toBe('git');
  });

  it('returns null when JSON has no provider field', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ foo: 'bar' }));

    const result = await loadConfig();
    expect(result).toBeNull();
  });

  it('rethrows non-ENOENT errors', async () => {
    const permErr = new Error('EACCES') as NodeJS.ErrnoException;
    permErr.code = 'EACCES';
    mockReadFile.mockRejectedValue(permErr);

    await expect(loadConfig()).rejects.toThrow('EACCES');
  });
});

describe('saveConfig', () => {
  it('writes JSON with correct format', async () => {
    const config = {
      provider: 'git' as const,
      git: { repoUrl: 'https://github.com/test/repo.git', branch: 'main', skillsDir: '.' },
    };

    await saveConfig(config);

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledTimes(1);

    const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.provider).toBe('git');
    expect(parsed.git.repoUrl).toBe('https://github.com/test/repo.git');
    // Should be pretty-printed with 2-space indent and trailing newline
    expect(writtenContent).toContain('\n');
    expect(writtenContent.endsWith('\n')).toBe(true);
  });
});

describe('requireConfig', () => {
  it('throws when no config file exists', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    await expect(requireConfig()).rejects.toThrow('No configuration found');
  });

  it('returns config when file exists', async () => {
    const config = { provider: 'drive', drive: { folderId: 'abc123' } };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    const result = await requireConfig();
    expect(result.provider).toBe('drive');
  });
});

describe('getConfigValue', () => {
  it('reads nested values with dot notation', async () => {
    const config = {
      provider: 'git',
      git: { repoUrl: 'https://example.com/repo.git', branch: 'develop', skillsDir: '.' },
    };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    const result = await getConfigValue('git.branch');
    expect(result).toBe('develop');
  });

  it('returns top-level values', async () => {
    const config = { provider: 'git', git: { repoUrl: 'url', branch: 'main', skillsDir: '.' } };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    const result = await getConfigValue('provider');
    expect(result).toBe('git');
  });

  it('returns undefined for non-existent key paths', async () => {
    const config = { provider: 'git' };
    mockReadFile.mockResolvedValue(JSON.stringify(config));

    const result = await getConfigValue('git.branch');
    expect(result).toBeUndefined();
  });

  it('returns undefined when no config exists', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    const result = await getConfigValue('provider');
    expect(result).toBeUndefined();
  });
});

describe('setConfigValue', () => {
  it('creates nested objects and persists', async () => {
    // First call from setConfigValue -> loadConfig reads existing config
    const existing = { provider: 'git', git: { repoUrl: 'url', branch: 'main', skillsDir: '.' } };
    mockReadFile.mockResolvedValue(JSON.stringify(existing));

    await setConfigValue('git.branch', 'develop');

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.git.branch).toBe('develop');
  });

  it('creates intermediate objects for new paths', async () => {
    // No config exists - loadConfig returns null so setConfigValue starts with empty object
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    mockReadFile.mockRejectedValue(enoent);

    await setConfigValue('deploy.claude.path', '/custom/path');

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writtenContent = mockWriteFile.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.deploy.claude.path).toBe('/custom/path');
  });
});
