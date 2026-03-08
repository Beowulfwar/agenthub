/**
 * StorageProvider — the contract that every storage backend must fulfil.
 *
 * Both `GitProvider` and `DriveProvider` implement this interface so the
 * rest of the application can work against a single abstraction.
 */

import type { ContentPackage, ContentRef, ContentType, HealthCheckResult } from '../core/types.js';

/** Options for listing skills with optional filters. */
export interface ListOptions {
  /** Substring filter applied to skill names. */
  query?: string;
  /** Filter by content type (skill, prompt, subagent). */
  type?: ContentType;
}

export interface StorageProvider {
  /** Provider identifier. */
  readonly name: 'git' | 'drive' | 'local' | 'github';

  /** Verify that the provider is reachable and credentials are valid. */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * List skill names available in the backend.
   *
   * @param options - A query string or {@link ListOptions} with optional type filter.
   */
  list(options?: string | ListOptions): Promise<string[]>;

  /** Canonical listing that preserves `type + name` identity. */
  listContentRefs(options?: string | ListOptions): Promise<ContentRef[]>;

  /** Return `true` when a skill with the given name exists. */
  exists(name: string | ContentRef): Promise<boolean>;

  /**
   * Retrieve a full skill package by name.
   *
   * @throws {SkillNotFoundError} when the skill does not exist.
   */
  get(name: string | ContentRef): Promise<ContentPackage>;

  /**
   * Create or update a skill package.
   *
   * The skill name is taken from `pkg.skill.name`.
   */
  put(pkg: ContentPackage): Promise<void>;

  /**
   * Delete a skill by name.
   *
   * @throws {SkillNotFoundError} when the skill does not exist.
   */
  delete(name: string | ContentRef): Promise<void>;

  /**
   * Stream every skill in the backend.
   *
   * Useful for full exports and migrations.
   */
  exportAll(): AsyncIterable<ContentPackage>;
}
