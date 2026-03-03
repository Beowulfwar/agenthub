/**
 * Provider factory — creates a {@link StorageProvider} from an {@link AhubConfig}.
 *
 * This keeps the rest of the app ignorant of the concrete backend classes.
 */

import type { AhubConfig } from '../core/types.js';
import { ProviderNotConfiguredError } from '../core/errors.js';
import type { StorageProvider } from './provider.js';
import { GitProvider } from './git-provider.js';
import { DriveProvider } from './drive-provider.js';

/**
 * Instantiate the correct {@link StorageProvider} based on the active config.
 *
 * @throws {ProviderNotConfiguredError} when the provider type is unknown or
 *   the corresponding section is missing from the config.
 */
export function createProvider(config: AhubConfig): StorageProvider {
  switch (config.provider) {
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
      // Exhaustive check — if a new provider is added to the union
      // type without being handled here, TypeScript will flag it.
      const _exhaustive: never = config.provider;
      throw new ProviderNotConfiguredError(String(_exhaustive));
    }
  }
}
