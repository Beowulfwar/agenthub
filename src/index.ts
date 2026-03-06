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
  ContentType,
  Skill,
  SkillFile,
  SkillMetadata,
  SkillPackage,
  DeployTarget,
  GitConfig,
  DriveConfig,
  LocalConfig,
  SourceConfig,
  AhubConfig,
  HealthCheckResult,
  WorkspaceSkillEntry,
  WorkspaceTargetGroup,
  WorkspaceManifest,
  SyncDeployedEntry,
  SyncFailedEntry,
  SyncResult,
  SyncOptions,
  SyncProgressEvent,
  SkillFrontmatterExtensions,
  AhubProfile,
} from './core/types.js';

export {
  CONTENT_TYPE_CONFIG,
  ALL_MARKER_FILES,
  MARKER_TO_TYPE,
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
  WorkspaceNotFoundError,
  SyncError,
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
  extractSkillExtensions,
  detectContentType,
  getMarkerFile,
  getCompanionDirs,
} from './core/skill.js';

// ---------------------------------------------------------------------------
// Core — Configuration
// ---------------------------------------------------------------------------

export {
  AHUB_DIR,
  CONFIG_PATH,
  ensureAhubDir,
  loadConfig,
  loadConfigV2,
  saveConfig,
  requireConfig,
  getConfigValue,
  setConfigValue,
  getDefaultDeployPaths,
  isLegacyConfig,
  migrateConfigToV2,
  addSource,
  removeSource,
  listSources,
  setDefaultSource,
  getSource,
  setSourceEnabled,
  detectLocalSkillDirs,
} from './core/config.js';

// ---------------------------------------------------------------------------
// Core — Cache
// ---------------------------------------------------------------------------

export { CacheManager } from './core/cache.js';

// ---------------------------------------------------------------------------
// Core — Clipboard
// ---------------------------------------------------------------------------

export { copyToClipboard, resolveClipboardCommand } from './core/clipboard.js';

// ---------------------------------------------------------------------------
// Core — Stats
// ---------------------------------------------------------------------------

export type { SkillStats } from './core/stats.js';
export { getSkillStats, formatBytes } from './core/stats.js';

// ---------------------------------------------------------------------------
// Core — Workspace
// ---------------------------------------------------------------------------

export {
  WORKSPACE_FILENAMES,
  findWorkspaceManifest,
  loadWorkspaceManifest,
  requireWorkspaceManifest,
  saveWorkspaceManifest,
  resolveManifestSkills,
} from './core/workspace.js';

// ---------------------------------------------------------------------------
// Core — WSL utilities
// ---------------------------------------------------------------------------

export {
  isWSL,
  resolveWSLPath,
  toWSLUncPath,
  normalizePath,
  detectWSLDistro,
  getHomeDir,
} from './core/wsl.js';

// ---------------------------------------------------------------------------
// Core — Filesystem explorer
// ---------------------------------------------------------------------------

export type { DetectedSkillDir, DirEntry } from './core/explorer.js';

export {
  WELL_KNOWN_SKILL_DIRS,
  scanForSkillDirs,
  listDirectory,
  suggestStartDirs,
  isValidDirectory,
} from './core/explorer.js';

// ---------------------------------------------------------------------------
// Core — Sync engine
// ---------------------------------------------------------------------------

export { syncWorkspace } from './core/sync.js';

// ---------------------------------------------------------------------------
// Storage — Provider interface & implementations
// ---------------------------------------------------------------------------

export type { StorageProvider, ListOptions } from './storage/provider.js';
export { createProvider, createProviderFromSource, createAggregateProvider } from './storage/factory.js';
export { GitProvider } from './storage/git-provider.js';
export { DriveProvider } from './storage/drive-provider.js';
export { LocalProvider } from './storage/local-provider.js';
export { AggregateProvider, parseQualifiedName, formatQualifiedName } from './storage/aggregate-provider.js';

// ---------------------------------------------------------------------------
// Deploy — Deployer interface & implementations
// ---------------------------------------------------------------------------

export type { Deployer } from './deploy/deployer.js';
export { createDeployer } from './deploy/deployer.js';
export { ClaudeCodeDeployer } from './deploy/claude-code.js';
export { CodexDeployer } from './deploy/codex.js';
export { CursorDeployer } from './deploy/cursor.js';

// ---------------------------------------------------------------------------
// API — HTTP server
// ---------------------------------------------------------------------------

export { createApiApp } from './api/router.js';
export { startApiServer } from './api/server.js';
export type { ServerOptions } from './api/server.js';
