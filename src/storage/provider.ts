/**
 * StorageProvider — the contract that every storage backend must fulfil.
 *
 * Both `GitProvider` and `DriveProvider` implement this interface so the
 * rest of the application can work against a single abstraction.
 */

import type { HealthCheckResult, SkillPackage } from '../core/types.js';

export interface StorageProvider {
  /** Provider identifier. */
  readonly name: 'git' | 'drive';

  /** Verify that the provider is reachable and credentials are valid. */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * List skill names available in the backend.
   *
   * @param query - Optional substring filter applied to skill names.
   */
  list(query?: string): Promise<string[]>;

  /** Return `true` when a skill with the given name exists. */
  exists(name: string): Promise<boolean>;

  /**
   * Retrieve a full skill package by name.
   *
   * @throws {SkillNotFoundError} when the skill does not exist.
   */
  get(name: string): Promise<SkillPackage>;

  /**
   * Create or update a skill package.
   *
   * The skill name is taken from `pkg.skill.name`.
   */
  put(pkg: SkillPackage): Promise<void>;

  /**
   * Delete a skill by name.
   *
   * @throws {SkillNotFoundError} when the skill does not exist.
   */
  delete(name: string): Promise<void>;

  /**
   * Stream every skill in the backend.
   *
   * Useful for full exports and migrations.
   */
  exportAll(): AsyncIterable<SkillPackage>;
}
