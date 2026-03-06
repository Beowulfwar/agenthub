/**
 * Provider factory — creates a {@link StorageProvider} from config objects.
 *
 * This keeps the rest of the app ignorant of the concrete backend classes.
 */

import type { AhubConfig, SourceConfig } from '../core/types.js';
import { ProviderNotConfiguredError } from '../core/errors.js';
import type { StorageProvider } from './provider.js';
import { GitProvider } from './git-provider.js';
import { DriveProvider } from './drive-provider.js';
import { LocalProvider } from './local-provider.js';
import { AggregateProvider } from './aggregate-provider.js';

/**
 * Instantiate the correct {@link StorageProvider} based on the active config.
 *
 * Works with both v1 (legacy) and v2 configs. For v2 configs with multiple
 * sources, this creates a provider for the default source only. Use
 * {@link createProviderFromSource} for specific sources.
 *
 * @throws {ProviderNotConfiguredError} when the provider type is unknown or
 *   the corresponding section is missing from the config.
 */
export function createProvider(config: AhubConfig): StorageProvider {
  // v2 config: use default source
  if (config.version === 2 && config.sources) {
    const defaultId = config.defaultSource;
    const source = defaultId
      ? config.sources.find((s) => s.id === defaultId)
      : config.sources[0];

    if (!source) {
      throw new ProviderNotConfiguredError('No sources configured. Run "ahub source add" first.');
    }

    return createProviderFromSource(source);
  }

  // v1 config: legacy single-provider
  const provider = config.provider;
  if (!provider) {
    throw new ProviderNotConfiguredError('No provider configured.');
  }

  switch (provider) {
    case 'git': {
      if (!config.git) {
        throw new ProviderNotConfiguredError('git');
      }
      return new GitProvider(config.git);
    }

    case 'drive': {
      if (!config.drive) {
        throw new ProviderNotConfiguredError('drive');
      }
      return new DriveProvider(config.drive);
    }

    default: {
      const _exhaustive: never = provider;
      throw new ProviderNotConfiguredError(String(_exhaustive));
    }
  }
}

/**
 * Create a {@link StorageProvider} from a named source config.
 *
 * @throws {ProviderNotConfiguredError} when the source's provider-specific
 *   settings are missing.
 */
export function createProviderFromSource(source: SourceConfig): StorageProvider {
  switch (source.provider) {
    case 'git': {
      if (!source.git) {
        throw new ProviderNotConfiguredError(`git (source "${source.id}")`);
      }
      return new GitProvider(source.git);
    }

    case 'drive': {
      if (!source.drive) {
        throw new ProviderNotConfiguredError(`drive (source "${source.id}")`);
      }
      return new DriveProvider(source.drive);
    }

    case 'local': {
      if (!source.local) {
        throw new ProviderNotConfiguredError(`local (source "${source.id}")`);
      }
      return new LocalProvider(source.local);
    }

    default: {
      const _exhaustive: never = source.provider;
      throw new ProviderNotConfiguredError(String(_exhaustive));
    }
  }
}

/**
 * Create an {@link AggregateProvider} from a v2 config with all enabled sources.
 *
 * For v1 configs, wraps the single provider in an AggregateProvider for
 * a uniform API.
 *
 * @throws {ProviderNotConfiguredError} when no sources are configured.
 */
export function createAggregateProvider(config: AhubConfig): AggregateProvider {
  // v2 config: build map from enabled sources
  if (config.version === 2 && config.sources) {
    const enabledSources = config.sources.filter((s) => s.enabled !== false);

    if (enabledSources.length === 0) {
      throw new ProviderNotConfiguredError(
        'No enabled sources configured. Run "ahub source add" first.',
      );
    }

    const map = new Map<string, StorageProvider>();
    for (const source of enabledSources) {
      map.set(source.id, createProviderFromSource(source));
    }

    return new AggregateProvider(map, config.defaultSource);
  }

  // v1 config: wrap single provider
  const provider = createProvider(config);
  const sourceId = config.provider ?? 'default';
  const map = new Map<string, StorageProvider>([[sourceId, provider]]);
  return new AggregateProvider(map, sourceId);
}
