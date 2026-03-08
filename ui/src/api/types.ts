/**
 * Frontend types — mirrored from the backend API.
 */

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

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

export type ContentType = 'skill' | 'prompt' | 'subagent';

export interface ContentRef {
  type: ContentType;
  name: string;
}

export type ArtifactKind =
  | 'skill_package'
  | 'command_file'
  | 'rule_file'
  | 'instruction_file'
  | 'subagent_file'
  | 'prompt_file'
  | 'unknown';

export type ArtifactScope = 'workspace' | 'user' | 'global';
export type SupportLevel = 'official' | 'official_but_detect_only' | 'official_app_unverified_layout';
export type ArtifactVisibilityStatus =
  | 'visible_in_app'
  | 'found_in_wrong_repository'
  | 'found_in_legacy_repository'
  | 'found_in_workspace_but_not_loaded_by_app'
  | 'found_but_unverifiable_for_app'
  | 'missing_from_expected_repository';
export type ArtifactLegacyStatus = 'canonical' | 'legacy' | 'wrong_repository' | 'unverifiable' | 'not_applicable';
export type ArtifactLossiness = 'lossless' | 'lossy_with_explicit_warning' | 'not_migratable';

export interface AgentRepositoryLocation {
  id: string;
  label: string;
  artifactKind: ArtifactKind;
  scope: ArtifactScope;
  relativePath: string;
  canonical: boolean;
}

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

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthData {
  configured: boolean;
  provider: 'git' | 'drive' | 'local' | 'github' | null;
  providerHealth: { ok: boolean; message?: string } | null;
  cacheCount: number;
  sourceCount?: number;
}

export type GitHubRepoVisibility = 'private' | 'public';

export interface GitHubConnectionStatus {
  connected: boolean;
  accountLogin?: string;
  repo?: {
    owner: string;
    name: string;
    branch: string;
    basePath: string;
    visibility: GitHubRepoVisibility;
  };
  scopes?: string[];
  reauthorizationRequired?: boolean;
}

export interface ProvidersOverview {
  github: GitHubConnectionStatus;
  local: {
    sourceId: string | null;
    directory: string | null;
  };
}

export interface GitHubOAuthStartResult {
  authorizationUrl: string;
  callbackOrigin: string;
}

export interface GitHubSyncConflict {
  path: string;
  reason: string;
}

export interface GitHubSyncPreview {
  localSourceId: string;
  creates: string[];
  updates: string[];
  deletes: string[];
  skipped: string[];
  conflicts: GitHubSyncConflict[];
  manifestPresent: boolean;
}

export interface GitHubSyncResult extends GitHubSyncPreview {
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillSummary {
  name: string;
  type?: ContentType;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  targets?: DeployTarget[];
  fileCount?: number;
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

export type WorkspaceCatalogSkillStatus =
  | 'configured_and_detected'
  | 'configured_only'
  | 'detected_only'
  | 'missing_in_provider';

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

export interface DetectedLocalSkill {
  name: string;
  label: string;
  tool: string;
  directoryPath: string;
  absolutePath: string;
  target?: DeployTarget;
  appId?: AgentAppId;
  appLabel?: string;
  artifactKind?: ArtifactKind;
  scope?: ArtifactScope;
  supportLevel?: SupportLevel;
  detectedPath?: string;
  expectedPath?: string;
  repositoryPath?: string;
  visibilityStatus?: ArtifactVisibilityStatus;
  legacyStatus?: ArtifactLegacyStatus;
  migratable?: boolean;
  lossiness?: ArtifactLossiness;
  sourceDocs?: string[];
}

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

export interface SkillMetadata {
  title?: string;
  description?: string;
  version?: string;
  author?: string;
  [key: string]: unknown;
}

export interface Skill {
  name: string;
  type?: ContentType;
  body: string;
  metadata: SkillMetadata;
}

export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillPackage {
  skill: Skill;
  files: SkillFile[];
}

/** Response from GET /api/skills/:name/info */
export interface SkillInfo {
  name: string;
  type: string;
  description: string;
  wordCount: number;
  lineCount: number;
  charCount: number;
  fileCount: number;
  totalBytes: number;
  hasCompanionFiles: boolean;
  companionFiles: string[];
  tags: string[];
  category: string | null;
  targets: DeployTarget[];
}

/** Body for PATCH /api/skills/:name */
export interface PatchSkillRequest {
  description?: string;
  body?: string;
  tags?: string[];
  category?: string;
  metadata?: Record<string, unknown>;
}

/** Response from POST /api/skills/:name/clone */
export interface CloneResult {
  name: string;
  clonedFrom: string;
}

/** Response from POST /api/skills/:name/rename */
export interface RenameResult {
  oldName: string;
  newName: string;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export type DeployTarget = 'claude-code' | 'codex' | 'cursor';

export interface DeployRequest {
  skills: string[];
  contents?: ContentRef[];
  targets?: DeployTarget[];
  target?: DeployTarget;
  workspaceFilePath?: string;
}

export interface DeployedEntry {
  skill: string;
  target: DeployTarget;
  path: string;
}

export interface FailedEntry {
  skill: string;
  target: DeployTarget;
  error: string;
}

export interface DeployResult {
  deployed: DeployedEntry[];
  failed: FailedEntry[];
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface WorkspaceContentEntry extends ContentRef {
  targets?: DeployTarget[];
  source?: string;
}

export interface WorkspaceTargetGroup {
  targets: DeployTarget[];
  skills: string[];
}

export interface WorkspaceContentGroup {
  targets: DeployTarget[];
  contents: ContentRef[];
  skills?: string[];
}

export type WorkspaceSkillEntry = WorkspaceContentEntry;

export interface WorkspaceManifest {
  version: 1 | 2;
  name?: string;
  description?: string;
  defaultTargets?: DeployTarget[];
  contents?: WorkspaceContentEntry[];
  groups?: WorkspaceContentGroup[];
  skills?: WorkspaceContentEntry[];
  profile?: string;
}

export interface ResolvedContent extends ContentRef {
  name: string;
  targets: DeployTarget[];
}

export type ResolvedSkill = ResolvedContent;

export interface DeployTargetDirectory {
  target: DeployTarget;
  label: string;
  source: 'workspace-local' | 'config-override' | 'tool-default';
  rootPath: string;
  exists: boolean;
  directories: {
    skill: string;
    prompt: string;
    subagent: string;
  };
}

export interface WorkspaceData {
  manifest: WorkspaceManifest | null;
  filePath: string | null;
  workspaceDir: string | null;
  resolved: ResolvedContent[];
  targetDirectories: DeployTargetDirectory[];
  agents: WorkspaceAgentInventory[];
  apps: WorkspaceAppInventory[];
  catalog?: WorkspaceCatalogEntry | null;
  error?: string;
}

/** Summary of a registered workspace for listing. */
export interface WorkspaceRegistryEntry {
  filePath: string;
  workspaceDir: string;
  manifest: WorkspaceManifest | null;
  isActive: boolean;
  skillCount: number;
  configuredSkillCount: number;
  detectedSkillCount: number;
  configuredOnlyCount: number;
  detectedOnlyCount: number;
  missingInProviderCount: number;
  driftCount: number;
  error?: string;
}

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

export interface WorkspaceSuggestion {
  workspaceDir: string;
  label: string;
  manifestPath: string;
  manifestExists: boolean;
  skillCount: number;
  detected: DetectedSkillDir[];
}

export interface SkillsCatalog {
  total: number;
  items: CloudSkillCatalogItem[];
  availableFilters: CloudSkillCatalogFilters;
  destinationScope: CloudSkillCatalogDestinationScope;
  counts: Record<CloudSkillInstallState, number>;
}

export type SkillsHubStatus =
  | 'synced'
  | 'cloud_only'
  | 'local_only'
  | 'diverged'
  | 'missing_in_provider';

export interface SkillsHubCloudItem {
  contentId: string;
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
  contentId: string;
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

export type SkillsHubWorkspaceRuleSource = 'projected' | 'local';

export interface SkillsHubWorkspaceRule {
  id: string;
  name: string;
  appId: AgentAppId;
  appLabel: string;
  source: SkillsHubWorkspaceRuleSource;
  writable: boolean;
  detectedPath: string;
  expectedPath: string;
  repositoryPath: string;
  visibilityStatus: ArtifactVisibilityStatus;
  legacyStatus: ArtifactLegacyStatus;
  lossiness: ArtifactLossiness;
  sourceDocs: string[];
  projectedFrom?: ContentRef | null;
}

export interface SkillsHubWorkspaceRulesSection {
  appId: AgentAppId;
  label: string;
  supportLevel: SupportLevel;
  writable: boolean;
  canonicalPaths: string[];
  legacyPaths: string[];
  docUrls: string[];
  rules: SkillsHubWorkspaceRule[];
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
  rules: SkillsHubWorkspaceRulesSection[];
}

export interface SkillsHubDiffSide {
  exists: boolean;
  hash: string | null;
  preview: string | null;
  detectedPath?: string;
  fileCount?: number;
  type?: 'skill' | 'prompt' | 'subagent' | null;
}

export interface SkillsHubDiffResult {
  contentId: string;
  name: string;
  type: ContentType;
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
  contentId: string;
  name: string;
  type: ContentType;
  skill: string;
  target?: DeployTarget;
  path?: string;
  message: string;
  warning?: string;
  lossiness?: ArtifactLossiness;
}

export interface SkillsHubActionFailure {
  contentId: string;
  name: string;
  type: ContentType;
  skill: string;
  target?: DeployTarget;
  error: string;
  code?: string;
}

export interface SkillsHubActionResult {
  successful: SkillsHubActionSuccess[];
  failed: SkillsHubActionFailure[];
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

export interface LocalWorkspaceRuleContent {
  path: string;
  content: string;
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

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncRequest {
  force?: boolean;
  filter?: string[];
  dryRun?: boolean;
  filePath?: string;
}

export interface SyncResult {
  deployed: DeployedEntry[];
  failed: FailedEntry[];
  skipped: string[];
}

export interface SyncProgressEvent {
  phase: 'fetch' | 'deploy';
  skill: string;
  target?: DeployTarget;
  current: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Explorer (directory browsing)
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  skillMatch?: {
    label: string;
    tool: string;
    count: number;
  };
}

export interface BrowseResult {
  currentDir: string;
  entries: DirEntry[];
}

export interface DetectedSkillDir {
  absolutePath: string;
  label: string;
  tool: string;
  skillCount: number;
}

export interface ScanResult {
  baseDir: string;
  detected: DetectedSkillDir[];
  artifacts: DetectedAppArtifact[];
  apps: WorkspaceAppInventory[];
}

export interface SuggestionDir {
  path: string;
  label: string;
  exists: boolean;
  skillCount: number;
}

export interface PickDirectoryResult {
  selectedDir: string | null;
}

export interface RegisterWorkspaceResult {
  registered: string;
  created: boolean;
  detectedSkillCount: number;
  adoptedSkillCount: number;
  ignoredSkillNames: string[];
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
// Config
// ---------------------------------------------------------------------------

export interface AhubConfig {
  version?: 1 | 2;
  provider?: 'git' | 'drive';
  git?: {
    repoUrl: string;
    branch?: string;
    repoName?: string;
  };
  drive?: {
    folderId: string;
    folderName?: string;
  };
  sources?: Array<{
    id: string;
    label?: string;
    provider: 'git' | 'drive' | 'local' | 'github';
    enabled?: boolean;
    git?: {
      repoUrl: string;
      branch: string;
      skillsDir: string;
    };
    drive?: {
      folderId: string;
      credentialsPath?: string;
    };
    local?: {
      directory: string;
    };
    github?: {
      owner: string;
      repo: string;
      branch: string;
      basePath: string;
      accountLogin: string;
      accountId: string;
      visibility: GitHubRepoVisibility;
    };
  }>;
  defaultSource?: string;
  deployTargets?: Partial<Record<DeployTarget, string>>;
}
