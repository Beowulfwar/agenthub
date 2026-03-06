/**
 * StorageProvider — the contract that every storage backend must fulfil.
 *
 * Both `GitProvider` and `DriveProvider` implement this interface so the
 * rest of the application can work against a single abstraction.
 */

import type { ContentType, HealthCheckResult, SkillPackage } from '../core/types.js';

/** Options for listing skills with optional filters. */
export interface ListOptions {
  /** Substring filter applied to skill names. */
  query?: string;
  /** Filter by content type (skill, prompt, subagent). */
  type?: ContentType;
}

export interface StorageProvider {
  /** Provider identifier. */
  readonly name: 'git' | 'drive' | 'local';

  /** Verify that the provider is reachable and credentials are valid. */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * List skill names available in the backend.
   *
   * @param options - A query string or {@link ListOptions} with optional type filter.
   */
  list(options?: string | ListOptions): Promise<string[]>;

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
