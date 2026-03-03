import { describe, it, expect, vi } from 'vitest';

// Mock the provider constructors so we don't hit real filesystem/network.
// We keep the factory logic intact and only stub out the heavy constructors.
vi.mock('../../src/storage/git-provider.js', () => ({
  GitProvider: vi.fn().mockImplementation((config: unknown) => ({
    name: 'git' as const,
    config,
  })),
}));

vi.mock('../../src/storage/drive-provider.js', () => ({
  DriveProvider: vi.fn().mockImplementation((config: unknown) => ({
    name: 'drive' as const,
    config,
  })),
}));

import { createProvider } from '../../src/storage/factory.js';
import { ProviderNotConfiguredError } from '../../src/core/errors.js';
import type { AhubConfig } from '../../src/core/types.js';

describe('createProvider', () => {
  it('returns a GitProvider when config.provider is "git"', () => {
    const config: AhubConfig = {
      provider: 'git',
      git: {
        repoUrl: 'https://github.com/user/skills.git',
        branch: 'main',
        skillsDir: '.',
      },
    };

    const provider = createProvider(config);
    expect(provider.name).toBe('git');
  });

  it('returns a DriveProvider when config.provider is "drive"', () => {
    const config: AhubConfig = {
      provider: 'drive',
      drive: {
        folderId: 'abc123',
      },
    };

    const provider = createProvider(config);
    expect(provider.name).toBe('drive');
  });

  it('throws ProviderNotConfiguredError when git section is missing', () => {
    const config = {
      provider: 'git',
      // No git section
    } as AhubConfig;

    expect(() => createProvider(config)).toThrow(ProviderNotConfiguredError);
  });

  it('throws ProviderNotConfiguredError with provider name "git"', () => {
    const config = {
      provider: 'git',
    } as AhubConfig;

    try {
      createProvider(config);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderNotConfiguredError);
      expect((err as ProviderNotConfiguredError).provider).toBe('git');
    }
  });

  it('throws ProviderNotConfiguredError when drive section is missing', () => {
    const config = {
      provider: 'drive',
      // No drive section
    } as AhubConfig;

    expect(() => createProvider(config)).toThrow(ProviderNotConfiguredError);
  });

  it('throws ProviderNotConfiguredError with provider name "drive"', () => {
    const config = {
      provider: 'drive',
    } as AhubConfig;

    try {
      createProvider(config);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderNotConfiguredError);
      expect((err as ProviderNotConfiguredError).provider).toBe('drive');
    }
  });
});
