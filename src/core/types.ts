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

/** Known AI agent / coding app IDs used for repository diagnostics. */
export type AgentAppId =
  | 'codex'
  | 'claude-code'
  | 'cursor'
  | 'windsurf'
  | 'cline'
  | 'continue'
  | 'gemini-cli'
  | 'amp'
  | 'github-copilot'
  | 'antigravity';

/** Normalized artifact kinds used across app repositories. */
export type ArtifactKind =
  | 'skill_package'
  | 'command_file'
  | 'rule_file'
  | 'instruction_file'
  | 'subagent_file'
  | 'prompt_file'
  | 'unknown';

/** Scope where an app repository or artifact lives. */
export type ArtifactScope = 'workspace' | 'user' | 'global';

/** Confidence level for app repository support. */
export type SupportLevel =
  | 'official'
  | 'official_but_detect_only'
  | 'official_app_unverified_layout';

/** Visible state of a detected artifact for a given app. */
export type ArtifactVisibilityStatus =
  | 'visible_in_app'
  | 'found_in_wrong_repository'
  | 'found_in_legacy_repository'
  | 'found_in_workspace_but_not_loaded_by_app'
  | 'found_but_unverifiable_for_app'
  | 'missing_from_expected_repository';

/** Why an artifact is being surfaced relative to the canonical repository. */
export type ArtifactLegacyStatus =
  | 'canonical'
  | 'legacy'
  | 'wrong_repository'
  | 'unverifiable'
  | 'not_applicable';

/** Lossiness classification used in migration diagnostics. */
export type ArtifactLossiness =
  | 'lossless'
  | 'lossy_with_explicit_warning'
  | 'not_migratable';

/** Public description of a single repository location for an app. */
export interface AgentRepositoryLocation {
  id: string;
  label: string;
  artifactKind: ArtifactKind;
  scope: ArtifactScope;
  relativePath: string;
  canonical: boolean;
}

/** Public app-catalog entry exposed to CLI/UI/API. */
export interface AgentAppCatalogItem {
  appId: AgentAppId;
  label: string;
  artifactKinds: ArtifactKind[];
  canonicalLocations: AgentRepositoryLocation[];
  legacyLocations: AgentRepositoryLocation[];
  precedence: ArtifactScope[];
  workspaceRelative: string[];
  userRelative: string[];
  readStrategy: string;
  writeStrategy: string;
  supportLevel: SupportLevel;
  docUrls: string[];
  deployTarget?: DeployTarget;
}

/** Unified artifact detected in a local workspace or user repository. */
export interface DetectedAppArtifact {
  id: string;
  name: string;
  label: string;
  appId: AgentAppId;
  appLabel: string;
  artifactKind: ArtifactKind;
  scope: ArtifactScope;
  supportLevel: SupportLevel;
  detectedPath: string;
  expectedPath: string;
  repositoryPath: string;
  visibilityStatus: ArtifactVisibilityStatus;
  legacyStatus: ArtifactLegacyStatus;
  migratable: boolean;
  lossiness: ArtifactLossiness;
  sourceDocs: string[];
  target?: DeployTarget;
}

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
export interface DetectedLocalSkill extends DetectedAppArtifact {
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

export interface WorkspaceAppArtifact {
  id: string;
  name: string;
  label: string;
  artifactKind: ArtifactKind;
  detectedPath: string;
  expectedPath: string;
  repositoryPath: string;
  visibilityStatus: ArtifactVisibilityStatus;
  legacyStatus: ArtifactLegacyStatus;
  migratable: boolean;
  lossiness: ArtifactLossiness;
  sourceDocs: string[];
  target?: DeployTarget;
}

export interface WorkspaceAppInventory {
  appId: AgentAppId;
  label: string;
  supportLevel: SupportLevel;
  deployTarget?: DeployTarget;
  canonicalPaths: string[];
  legacyPaths: string[];
  docUrls: string[];
  counts: Record<ArtifactVisibilityStatus, number> & { total: number };
  artifacts: WorkspaceAppArtifact[];
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
  appId?: AgentAppId;
  canonicalPaths?: string[];
  legacyPaths?: string[];
}

export type SkillsHubStatus =
  | 'synced'
  | 'cloud_only'
  | 'local_only'
  | 'diverged'
  | 'missing_in_provider';

export interface SkillsHubCloudItem {
  name: string;
  type: ContentType;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
  workspaceUsageCount: number;
  divergedWorkspaceCount: number;
}

export interface SkillsHubCloudSection {
  total: number;
  items: SkillsHubCloudItem[];
  availableFilters: CloudSkillCatalogFilters;
}

export interface SkillsHubWorkspaceAgentSummary {
  target: DeployTarget;
  label: string;
  counts: Record<SkillsHubStatus, number> & { total: number };
}

export interface SkillsHubWorkspaceSummary {
  filePath: string;
  workspaceDir: string;
  workspaceName: string;
  isActive: boolean;
  counts: Record<SkillsHubStatus, number> & { total: number };
  agents: SkillsHubWorkspaceAgentSummary[];
  driftCount: number;
}

export interface SkillsHubShell {
  cloud: SkillsHubCloudSection;
  workspaces: SkillsHubWorkspaceSummary[];
}

export interface SkillsHubWorkspaceSkill {
  name: string;
  type: ContentType | null;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
  status: SkillsHubStatus;
  inManifest: boolean;
  installedLocally: boolean;
  existsInProvider: boolean;
  lossiness: ArtifactLossiness;
  warning?: string;
  localPaths: string[];
  availableActions: Array<'download' | 'upload' | 'copy' | 'move' | 'compare'>;
}

export interface SkillsHubWorkspaceAgentDetail {
  target: DeployTarget;
  label: string;
  source: 'workspace-local' | 'config-override' | 'tool-default';
  rootPath: string;
  skillPath: string;
  exists: boolean;
  counts: Record<SkillsHubStatus, number> & { total: number };
  skills: SkillsHubWorkspaceSkill[];
}

export interface SkillsHubWorkspaceDetail {
  filePath: string;
  workspaceDir: string;
  workspaceName: string;
  isActive: boolean;
  counts: Record<SkillsHubStatus, number> & { total: number };
  agents: SkillsHubWorkspaceAgentDetail[];
}

export interface SkillsHubDiffSide {
  exists: boolean;
  hash: string | null;
  preview: string | null;
  detectedPath?: string;
  fileCount?: number;
  type?: ContentType | null;
}

export interface SkillsHubDiffResult {
  name: string;
  workspaceFilePath: string;
  workspaceName: string;
  target: DeployTarget;
  status: SkillsHubStatus;
  lossiness: ArtifactLossiness;
  warning?: string;
  local: SkillsHubDiffSide;
  cloud: SkillsHubDiffSide;
  canUpload: boolean;
  canDownload: boolean;
}

export interface SkillsHubActionSuccess {
  skill: string;
  target?: DeployTarget;
  path?: string;
  message: string;
  warning?: string;
  lossiness?: ArtifactLossiness;
}

export interface SkillsHubActionFailure {
  skill: string;
  target?: DeployTarget;
  error: string;
  code?: string;
}

export interface SkillsHubActionResult {
  successful: SkillsHubActionSuccess[];
  failed: SkillsHubActionFailure[];
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

export interface MigrationPlanItem {
  name: string;
  sourcePath: string;
  sourceKind: ArtifactKind;
  targetPath: string;
  targetKind: ArtifactKind;
  action: 'copy' | 'generate' | 'manual';
  migratable: boolean;
  lossiness: ArtifactLossiness;
  warnings: string[];
  blockedReasons: string[];
  generatedFiles: string[];
  manualSteps: string[];
}

export interface AppMigrationPlan {
  fromApp: AgentAppId;
  toApp: AgentAppId;
  workspaceDir: string;
  executable: boolean;
  plannedCount: number;
  blockedCount: number;
  items: MigrationPlanItem[];
  blockedReasons: string[];
  manualSteps: string[];
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
