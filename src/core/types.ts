/**
 * Core type definitions for agent-hub.
 *
 * All interfaces used across the project are defined here to keep
 * the type surface in a single, importable location.
 */

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

/** Supported content types for agent-hub packages. */
export type ContentType = 'skill' | 'prompt' | 'subagent';

/** Configuration for each content type: marker file and companion directories. */
export const CONTENT_TYPE_CONFIG: Record<ContentType, {
  markerFile: string;
  companionDirs: readonly string[];
}> = {
  skill:    { markerFile: 'SKILL.md',  companionDirs: ['agents', 'scripts', 'references'] },
  prompt:   { markerFile: 'PROMPT.md', companionDirs: ['examples', 'references'] },
  subagent: { markerFile: 'AGENT.md',  companionDirs: ['tools', 'config', 'references'] },
};

/** All known marker filenames for content type detection. */
export const ALL_MARKER_FILES = ['SKILL.md', 'PROMPT.md', 'AGENT.md'] as const;

/** Reverse lookup: marker filename -> content type. */
export const MARKER_TO_TYPE: Record<string, ContentType> = {
  'SKILL.md': 'skill',
  'PROMPT.md': 'prompt',
  'AGENT.md': 'subagent',
};

// ---------------------------------------------------------------------------
// Skill types
// ---------------------------------------------------------------------------

/** Arbitrary metadata extracted from YAML frontmatter. */
export interface SkillMetadata {
  [key: string]: unknown;
}

/** A parsed skill (SKILL.md/PROMPT.md/AGENT.md frontmatter + body). */
export interface Skill {
  /** Unique kebab-case identifier. */
  name: string;
  /** Content type. Undefined or absent defaults to 'skill' (backward compat). */
  type?: ContentType;
  /** Human-readable one-line description. */
  description: string;
  /** Markdown body (everything after the frontmatter). */
  body: string;
  /** Extra YAML frontmatter fields beyond name/description/type. */
  metadata?: SkillMetadata;
}

/** A single file that belongs to a skill package. */
export interface SkillFile {
  /** Path relative to the skill directory root (e.g. "agents/openai.yaml"). */
  relativePath: string;
  /** UTF-8 file content. */
  content: string;
}

/** A skill together with its companion files (agents/, scripts/, references/). */
export interface SkillPackage {
  /** The parsed SKILL.md. */
  skill: Skill;
  /** Every file inside the skill directory (including SKILL.md itself). */
  files: SkillFile[];
}

// ---------------------------------------------------------------------------
// Deploy targets
// ---------------------------------------------------------------------------

/** Supported deployment targets. */
export type DeployTarget = 'claude-code' | 'codex' | 'cursor';

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

/** Git backend settings. */
export interface GitConfig {
  /** Remote repository URL (HTTPS or SSH). */
  repoUrl: string;
  /** Branch to sync from. Defaults to "main". */
  branch: string;
  /** Sub-directory inside the repo that holds skills. Defaults to ".". */
  skillsDir: string;
}

/** Google Drive backend settings. */
export interface DriveConfig {
  /** The Drive folder ID that holds skill directories. */
  folderId: string;
  /** Path to a GCP service-account key JSON, if any. */
  credentialsPath?: string;
}

/** Local filesystem backend settings. */
export interface LocalConfig {
  /** Absolute path to the directory that holds skill directories. */
  directory: string;
}

/** A named storage source (v2 multi-source config). */
export interface SourceConfig {
  /** Unique kebab-case alias (e.g. "work", "personal", "shared"). */
  id: string;
  /** Human-readable label for display. */
  label?: string;
  /** Storage backend type. */
  provider: 'git' | 'drive' | 'local';
  /** Git backend settings (required when provider === 'git'). */
  git?: GitConfig;
  /** Google Drive settings (required when provider === 'drive'). */
  drive?: DriveConfig;
  /** Local directory settings (required when provider === 'local'). */
  local?: LocalConfig;
  /** Whether this source is active. Defaults to true. */
  enabled?: boolean;
}

/**
 * Top-level configuration persisted at ~/.ahub/config.json.
 *
 * Supports two formats:
 * - **v1 (legacy)**: single provider via `provider` + `git`/`drive` fields.
 * - **v2 (multi-source)**: named sources array via `sources` + `defaultSource`.
 *
 * When `version` is absent or `1`, the config is treated as v1 (backward compat).
 */
export interface AhubConfig {
  /** Config schema version. Absent or 1 = legacy single-provider. 2 = multi-source. */
  version?: 1 | 2;

  // --- Legacy fields (v1) ---
  /** Which storage provider is active (v1 only). */
  provider?: 'git' | 'drive';
  /** Git provider settings (v1 only). */
  git?: GitConfig;
  /** Google Drive provider settings (v1 only). */
  drive?: DriveConfig;

  // --- Multi-source fields (v2) ---
  /** Named storage sources. */
  sources?: SourceConfig[];
  /** Default source ID for operations that don't specify one. */
  defaultSource?: string;

  /** Where skills are deployed to. Key = target name, value = absolute path override. */
  deployTargets?: Partial<Record<DeployTarget, string>>;

  // --- Workspace registry (multi-workspace UI) ---
  /** Known workspace manifests and active selection. */
  workspaces?: {
    /** Absolute path of the currently active workspace manifest. */
    active?: string;
    /** All registered workspace manifest paths. */
    paths: string[];
  };
}

// ---------------------------------------------------------------------------
// Workspace registry
// ---------------------------------------------------------------------------

/** Summary of a registered workspace for listing endpoints. */
export interface WorkspaceRegistryEntry {
  /** Absolute path to the manifest file. */
  filePath: string;
  /** Absolute path to the workspace directory (manifest parent). */
  workspaceDir: string;
  /** The loaded manifest (null if file is missing/invalid). */
  manifest: WorkspaceManifest | null;
  /** Whether this is the currently active workspace. */
  isActive: boolean;
  /** Number of resolved skills configured in the manifest. */
  skillCount: number;
  /** Alias explicito para a contagem configurada no manifesto. */
  configuredSkillCount: number;
  /** Unique skills detected in local well-known directories for this workspace. */
  detectedSkillCount: number;
  /** Configured skills that are not currently detected in local directories. */
  configuredOnlyCount: number;
  /** Local detected skills that are not declared in the manifest. */
  detectedOnlyCount: number;
  /** Configured skills that cannot be found in the provider. */
  missingInProviderCount: number;
  /** Total skills in drift or invalid state. */
  driftCount: number;
  /** Load error message, if the manifest could not be read. */
  error?: string;
}

/** A local skill-like file or package detected inside a workspace. */
export interface DetectedLocalSkill {
  /** Skill identifier inferred from folder name or markdown file name. */
  name: string;
  /** Human label of the recognized directory pattern. */
  label: string;
  /** Tool family that owns the directory pattern (codex, claude-code, etc.). */
  tool: string;
  /** Path of the recognized parent directory (for example `.codex/skills`). */
  directoryPath: string;
  /** Absolute path to the detected file or package directory. */
  absolutePath: string;
  /** Optional deploy target when the tool maps to a supported target. */
  target?: DeployTarget;
}

export type WorkspaceCatalogSkillStatus =
  | 'configured_and_detected'
  | 'configured_only'
  | 'detected_only'
  | 'missing_in_provider';

/** A workspace-scoped view of one skill in the unified catalog. */
export interface WorkspaceCatalogSkill {
  name: string;
  type: ContentType | null;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
  configuredTargets: DeployTarget[];
  configured: boolean;
  detectedLocally: boolean;
  existsInProvider: boolean;
  status: WorkspaceCatalogSkillStatus;
  detectedTools: string[];
}

/** Full catalog entry for one registered workspace. */
export interface WorkspaceCatalogEntry {
  filePath: string;
  workspaceDir: string;
  workspaceName: string;
  isActive: boolean;
  configuredSkillCount: number;
  detectedSkillCount: number;
  configuredOnlyCount: number;
  detectedOnlyCount: number;
  missingInProviderCount: number;
  driftCount: number;
  detectedLocalSkills: DetectedLocalSkill[];
  skills: WorkspaceCatalogSkill[];
  error?: string;
}

export type CloudSkillInstallState = 'installed' | 'not_installed' | 'unknown';

export interface CloudSkillCatalogItem {
  name: string;
  type: ContentType;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
  installState: CloudSkillInstallState;
}

export interface CloudSkillCatalogFilters {
  types: ContentType[];
  categories: string[];
  tags: string[];
  installStates: CloudSkillInstallState[];
}

export interface CloudSkillCatalogDestinationScope {
  workspaceFilePath: string | null;
  workspaceName: string | null;
  workspaceDir: string | null;
  target: DeployTarget | null;
  ready: boolean;
}

/** Unified /api/skills/catalog response payload. */
export interface SkillsCatalog {
  total: number;
  items: CloudSkillCatalogItem[];
  availableFilters: CloudSkillCatalogFilters;
  destinationScope: CloudSkillCatalogDestinationScope;
  counts: Record<CloudSkillInstallState, number>;
}

export type WorkspaceAgentSkillStatus =
  | 'manifest_and_installed'
  | 'manifest_missing_local'
  | 'local_outside_manifest'
  | 'missing_in_provider';

export interface WorkspaceAgentSkill {
  name: string;
  type: ContentType | null;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
  status: WorkspaceAgentSkillStatus;
  inManifest: boolean;
  installedLocally: boolean;
  existsInProvider: boolean;
  localPaths: string[];
}

export interface WorkspaceAgentInventory {
  target: DeployTarget;
  label: string;
  source: 'workspace-local' | 'config-override' | 'tool-default';
  rootPath: string;
  skillPath: string;
  exists: boolean;
  counts: Record<WorkspaceAgentSkillStatus, number> & { total: number };
  skills: WorkspaceAgentSkill[];
}

// ---------------------------------------------------------------------------
// Operation results
// ---------------------------------------------------------------------------

/** Result of a provider health check. */
export interface HealthCheckResult {
  /** Whether the provider is reachable and configured correctly. */
  ok: boolean;
  /** Human-readable status message. */
  message: string;
}

// ---------------------------------------------------------------------------
// Workspace manifest
// ---------------------------------------------------------------------------

/** A single skill entry in a workspace manifest. */
export interface WorkspaceSkillEntry {
  /** Skill name (must exist in the storage backend). */
  name: string;
  /** Override targets for this specific skill (optional). */
  targets?: DeployTarget[];
  /** Source ID to fetch this skill from (v2 multi-source, optional). */
  source?: string;
}

/** A group of skills organized by deploy target. */
export interface WorkspaceTargetGroup {
  /** Which deploy target(s) this group covers. */
  targets: DeployTarget[];
  /** Skills belonging to this group. */
  skills: string[];
}

/** The workspace manifest file shape (`ahub.workspace.json`). */
export interface WorkspaceManifest {
  /** Schema version for forward compatibility. */
  version: 1;
  /** Optional human-readable workspace name. */
  name?: string;
  /** Optional description. */
  description?: string;
  /** Default deploy targets when a skill does not specify its own. */
  defaultTargets?: DeployTarget[];
  /** Skill entries (flat mode). */
  skills?: WorkspaceSkillEntry[];
  /** Skills organized by target group (grouped mode). */
  groups?: WorkspaceTargetGroup[];
  /** Optional profile name to use (overrides global config). */
  profile?: string;
}

/** Resolved target directories for a workspace or tool environment. */
export interface DeployTargetDirectory {
  /** Deployment target. */
  target: DeployTarget;
  /** Human-readable agent/app label. */
  label: string;
  /** How this root path was chosen. */
  source: 'workspace-local' | 'config-override' | 'tool-default';
  /** Root directory for the agent/app (for example `project/.codex`). */
  rootPath: string;
  /** Whether the root already exists on disk. */
  exists: boolean;
  /** Type-aware directories derived from the root path. */
  directories: Record<ContentType, string>;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** A single deployed skill+target result. */
export interface SyncDeployedEntry {
  skill: string;
  target: DeployTarget;
  path: string;
}

/** A single failed skill+target result. */
export interface SyncFailedEntry {
  skill: string;
  target: DeployTarget;
  error: string;
}

/** Aggregated result of a workspace sync operation. */
export interface SyncResult {
  /** Skills that were fetched and deployed successfully. */
  deployed: SyncDeployedEntry[];
  /** Skills that failed to fetch or deploy. */
  failed: SyncFailedEntry[];
  /** Skills that were skipped because cache was fresh. */
  skipped: string[];
}

/** Options for the sync engine. */
export interface SyncOptions {
  /** Force re-fetch even if cache is fresh. */
  force?: boolean;
  /** Only sync specific skills (subset of manifest). */
  filter?: string[];
  /** Dry run — report what would happen without deploying. */
  dryRun?: boolean;
  /** Workspace directory used to resolve per-project target paths. */
  workspaceDir?: string;
  /** Progress callback for CLI spinners / MCP progress. */
  onProgress?: (event: SyncProgressEvent) => void;
}

/** Progress event emitted during sync. */
export interface SyncProgressEvent {
  phase: 'fetch' | 'deploy';
  skill: string;
  target?: DeployTarget;
  current: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Skill frontmatter extensions
// ---------------------------------------------------------------------------

/**
 * Typed overlay for well-known optional fields in `Skill.metadata`.
 * Extracted via `extractSkillExtensions()`.
 */
export interface SkillFrontmatterExtensions {
  /** Tags for filtering and organization. */
  tags?: string[];
  /** Which deploy targets this skill is compatible with. */
  targets?: DeployTarget[];
  /** Skill category for grouping (e.g. "fiscal", "testing", "ops"). */
  category?: string;
  /** Content type (defaults to 'skill' when absent). */
  type?: ContentType;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** A named profile storing provider + deploy preferences. */
export interface AhubProfile {
  /** Profile name (kebab-case). */
  name: string;
  /** Which provider config to use. */
  provider: 'git' | 'drive';
  /** Git provider settings. */
  git?: GitConfig;
  /** Google Drive provider settings. */
  drive?: DriveConfig;
  /** Default deploy targets for this profile. */
  defaultTargets?: DeployTarget[];
  /** Deploy path overrides for this profile. */
  deployTargets?: Partial<Record<DeployTarget, string>>;
}
