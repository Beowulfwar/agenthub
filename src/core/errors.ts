/**
 * Custom error hierarchy for agent-hub.
 *
 * Every domain error extends `AhubError` so callers can catch the
 * base class when they need a generic handler.
 */

/**
 * Base error for all agent-hub operations.
 * Carries an optional `cause` for error-chain inspection.
 */
export class AhubError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AhubError';
    // Maintain proper prototype chain for instanceof checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an operation requires a storage provider (git / drive)
 * that has not been configured in ~/.ahub/config.json.
 */
export class ProviderNotConfiguredError extends AhubError {
  public readonly provider: string;

  constructor(provider: string, options?: ErrorOptions) {
    super(
      `Provider "${provider}" is not configured. Run "ahub init" to set up a storage backend.`,
      options,
    );
    this.name = 'ProviderNotConfiguredError';
    this.provider = provider;
  }
}

/**
 * Thrown when a skill lookup by name fails (cache, remote, or local).
 */
export class SkillNotFoundError extends AhubError {
  public readonly skillName: string;

  constructor(skillName: string, options?: ErrorOptions) {
    super(`Skill "${skillName}" was not found.`, options);
    this.name = 'SkillNotFoundError';
    this.skillName = skillName;
  }
}

/**
 * Thrown when a parsed `Skill` object fails validation
 * (e.g. missing required frontmatter fields).
 */
export class SkillValidationError extends AhubError {
  public readonly violations: string[];

  constructor(violations: string[], options?: ErrorOptions) {
    const list = violations.map((v) => `  - ${v}`).join('\n');
    super(`Skill validation failed:\n${list}`, options);
    this.name = 'SkillValidationError';
    this.violations = violations;
  }
}

/**
 * Thrown when authentication / authorization with the storage
 * provider fails (bad token, expired credentials, etc.).
 */
export class AuthenticationError extends AhubError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when a data-migration step fails (config format upgrade,
 * cache schema change, etc.).
 */
export class MigrationError extends AhubError {
  public readonly migrationName: string;

  constructor(migrationName: string, message: string, options?: ErrorOptions) {
    super(`Migration "${migrationName}" failed: ${message}`, options);
    this.name = 'MigrationError';
    this.migrationName = migrationName;
  }
}

/**
 * Thrown when a workspace manifest (`ahub.workspace.json`) cannot be
 * found by walking up from the current directory.
 */
export class WorkspaceNotFoundError extends AhubError {
  public readonly searchDir: string;

  constructor(searchDir: string, options?: ErrorOptions) {
    super(
      `No workspace manifest found. Searched from "${searchDir}" upward.\n` +
        'Create one with "ahub workspace init" or place an ahub.workspace.json in your project root.',
      options,
    );
    this.name = 'WorkspaceNotFoundError';
    this.searchDir = searchDir;
  }
}

/**
 * Thrown when a workspace manifest references skills that do not exist
 * in the configured provider.
 */
export class WorkspaceSkillReferenceError extends AhubError {
  public readonly skillNames: string[];

  constructor(skillNames: string[], options?: ErrorOptions) {
    const uniqueNames = [...new Set(skillNames)].sort();
    super(
      `Workspace manifest references skills that are not available in the provider: ${uniqueNames.join(', ')}.`,
      options,
    );
    this.name = 'WorkspaceSkillReferenceError';
    this.skillNames = uniqueNames;
  }
}

/**
 * Thrown when a workspace sync completes with one or more failures.
 */
export class SyncError extends AhubError {
  public readonly failCount: number;

  constructor(failCount: number, options?: ErrorOptions) {
    super(`Sync completed with ${failCount} failure(s).`, options);
    this.name = 'SyncError';
    this.failCount = failCount;
  }
}
