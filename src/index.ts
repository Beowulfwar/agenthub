/**
 * Public API surface for agent-hub.
 *
 * Re-exports everything that external consumers (CLI, MCP server, tests)
 * should be able to import from the package root:
 *
 *   import { parseSkill, CacheManager, AhubConfig } from 'agent-hub';
 */

// ---------------------------------------------------------------------------
// Core — Types
// ---------------------------------------------------------------------------

export type {
  Skill,
  SkillFile,
  SkillMetadata,
  SkillPackage,
  DeployTarget,
  GitConfig,
  DriveConfig,
  AhubConfig,
  HealthCheckResult,
} from './core/types.js';

// ---------------------------------------------------------------------------
// Core — Errors
// ---------------------------------------------------------------------------

export {
  AhubError,
  ProviderNotConfiguredError,
  SkillNotFoundError,
  SkillValidationError,
  AuthenticationError,
  MigrationError,
} from './core/errors.js';

// ---------------------------------------------------------------------------
// Core — Skill parsing & I/O
// ---------------------------------------------------------------------------

export {
  parseSkill,
  serializeSkill,
  validateSkill,
  loadSkillPackage,
  saveSkillPackage,
} from './core/skill.js';

// ---------------------------------------------------------------------------
// Core — Configuration
// ---------------------------------------------------------------------------

export {
  AHUB_DIR,
  CONFIG_PATH,
  ensureAhubDir,
  loadConfig,
  saveConfig,
  requireConfig,
  getConfigValue,
  setConfigValue,
  getDefaultDeployPaths,
} from './core/config.js';

// ---------------------------------------------------------------------------
// Core — Cache
// ---------------------------------------------------------------------------

export { CacheManager } from './core/cache.js';

// ---------------------------------------------------------------------------
// Storage — Provider interface & implementations
// ---------------------------------------------------------------------------

export type { StorageProvider } from './storage/provider.js';
export { createProvider } from './storage/factory.js';
export { GitProvider } from './storage/git-provider.js';
export { DriveProvider } from './storage/drive-provider.js';

// ---------------------------------------------------------------------------
// Deploy — Deployer interface & implementations
// ---------------------------------------------------------------------------

export type { Deployer } from './deploy/deployer.js';
export { createDeployer } from './deploy/deployer.js';
export { ClaudeCodeDeployer } from './deploy/claude-code.js';
export { CodexDeployer } from './deploy/codex.js';
export { CursorDeployer } from './deploy/cursor.js';
