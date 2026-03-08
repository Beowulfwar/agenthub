/**
 * Typed API client — thin Axios wrappers for every backend endpoint.
 */

import axios from 'axios';
import type {
  ContentRef,
  ContentType,
  GitHubConnectionStatus,
  GitHubOAuthStartResult,
  GitHubRepoVisibility,
  GitHubSyncPreview,
  GitHubSyncResult,
  HealthData,
  SkillSummary,
  SkillsCatalog,
  SkillsHubActionResult,
  SkillsHubDiffResult,
  SkillsHubShell,
  SkillsHubWorkspaceDetail,
  CloudSkillInstallState,
  DeployTarget,
  SkillPackage,
  SkillInfo,
  PatchSkillRequest,
  CloneResult,
  RenameResult,
  AgentAppCatalogItem,
  AppMigrationPlan,
  DeployRequest,
  DeployResult,
  SyncRequest,
  SyncResult,
  WorkspaceData,
  WorkspaceManifest,
  WorkspaceRegistryEntry,
  WorkspaceSuggestion,
  RegisterWorkspaceResult,
  BrowseResult,
  LocalWorkspaceRuleContent,
  ScanResult,
  SuggestionDir,
  PickDirectoryResult,
  ProvidersOverview,
  AhubConfig,
  ApiSuccess,
} from './types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Unwrap the { data: T } envelope.
function unwrap<T>(res: { data: ApiSuccess<T> }): T {
  return res.data.data;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<HealthData> {
  return unwrap(await api.get<ApiSuccess<HealthData>>('/health'));
}

export async function fetchProviders(): Promise<ProvidersOverview> {
  return unwrap(await api.get<ApiSuccess<ProvidersOverview>>('/providers'));
}

export async function fetchGitHubStatus(): Promise<GitHubConnectionStatus> {
  return unwrap(await api.get<ApiSuccess<GitHubConnectionStatus>>('/providers/github/status'));
}

export async function startGitHubOAuth(body: {
  repoName?: string;
  visibility?: GitHubRepoVisibility;
  uiOrigin: string;
}): Promise<GitHubOAuthStartResult> {
  return unwrap(await api.post<ApiSuccess<GitHubOAuthStartResult>>('/providers/github/oauth/start', body));
}

export async function disconnectGitHub(): Promise<{ disconnected: boolean }> {
  return unwrap(await api.post<ApiSuccess<{ disconnected: boolean }>>('/providers/github/disconnect'));
}

export async function bootstrapGitHubRepository(): Promise<{ bootstrapped: boolean }> {
  return unwrap(await api.post<ApiSuccess<{ bootstrapped: boolean }>>('/providers/github/bootstrap'));
}

export async function fetchGitHubSyncPreview(): Promise<GitHubSyncPreview> {
  return unwrap(await api.get<ApiSuccess<GitHubSyncPreview>>('/providers/github/sync/preview'));
}

export async function runGitHubSync(): Promise<GitHubSyncResult> {
  return unwrap(await api.post<ApiSuccess<GitHubSyncResult>>('/providers/github/sync'));
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export async function fetchSkills(query?: string): Promise<string[]> {
  const params = query ? { q: query } : {};
  return unwrap(await api.get<ApiSuccess<string[]>>('/skills', { params }));
}

export async function fetchSkillsDetailed(query?: string): Promise<SkillSummary[]> {
  const params: Record<string, string> = { detailed: 'true' };
  if (query) params.q = query;
  return unwrap(await api.get<ApiSuccess<SkillSummary[]>>('/skills', { params }));
}

export async function fetchSkillsCatalog(filters?: {
  q?: string;
  workspaceFilePath?: string;
  target?: DeployTarget;
  type?: ContentType;
  category?: string;
  tag?: string;
  installState?: CloudSkillInstallState;
}): Promise<SkillsCatalog> {
  const params: Record<string, string> = {};
  if (filters?.q) params.q = filters.q;
  if (filters?.workspaceFilePath) params.workspaceFilePath = filters.workspaceFilePath;
  if (filters?.target) params.target = filters.target;
  if (filters?.type) params.type = filters.type;
  if (filters?.category) params.category = filters.category;
  if (filters?.tag) params.tag = filters.tag;
  if (filters?.installState) params.installState = filters.installState;
  return unwrap(await api.get<ApiSuccess<SkillsCatalog>>('/skills/catalog', { params }));
}

export async function fetchSkillsHub(filters?: {
  q?: string;
  type?: ContentType;
  category?: string;
  tag?: string;
}): Promise<SkillsHubShell> {
  const params: Record<string, string> = {};
  if (filters?.q) params.q = filters.q;
  if (filters?.type) params.type = filters.type;
  if (filters?.category) params.category = filters.category;
  if (filters?.tag) params.tag = filters.tag;
  return unwrap(await api.get<ApiSuccess<SkillsHubShell>>('/skills/hub', { params }));
}

export async function fetchSkillsHubWorkspace(filePath: string): Promise<SkillsHubWorkspaceDetail> {
  return unwrap(
    await api.get<ApiSuccess<SkillsHubWorkspaceDetail>>('/skills/hub/workspace', {
      params: { filePath },
    }),
  );
}

export async function fetchSkillsHubDiff(params: {
  filePath: string;
  target: DeployTarget;
  name: string;
  type?: ContentType;
}): Promise<SkillsHubDiffResult> {
  return unwrap(
    await api.get<ApiSuccess<SkillsHubDiffResult>>('/skills/hub/diff', {
      params,
    }),
  );
}

export async function downloadSkillsToWorkspace(body: {
  filePath: string;
  target: DeployTarget;
  skills: string[];
  contents?: ContentRef[];
}): Promise<SkillsHubActionResult> {
  return unwrap(
    await api.post<ApiSuccess<SkillsHubActionResult>>('/skills/hub/actions/download', body),
  );
}

export async function uploadSkillsToCloud(body: {
  filePath: string;
  target: DeployTarget;
  skills: string[];
  contents?: ContentRef[];
  force?: boolean;
}): Promise<SkillsHubActionResult> {
  return unwrap(
    await api.post<ApiSuccess<SkillsHubActionResult>>('/skills/hub/actions/upload', body),
  );
}

export async function transferSkillsBetweenWorkspaces(body: {
  sourceWorkspaceFilePath: string;
  sourceTarget: DeployTarget;
  destinationWorkspaceFilePath: string;
  destinationTarget: DeployTarget;
  skills: string[];
  contents?: ContentRef[];
  mode: 'copy' | 'move';
}): Promise<SkillsHubActionResult> {
  return unwrap(
    await api.post<ApiSuccess<SkillsHubActionResult>>('/skills/hub/actions/transfer', body),
  );
}

export async function fetchSkill(name: string): Promise<SkillPackage> {
  return unwrap(await api.get<ApiSuccess<SkillPackage>>(`/skills/${encodeURIComponent(name)}`));
}

export async function fetchContent(ref: ContentRef): Promise<SkillPackage> {
  return unwrap(await api.get<ApiSuccess<SkillPackage>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}`));
}

export async function updateSkill(name: string, pkg: SkillPackage): Promise<{ name: string; type: string }> {
  return unwrap(await api.put<ApiSuccess<{ name: string; type: string }>>(`/skills/${encodeURIComponent(name)}`, pkg));
}

export async function updateContent(ref: ContentRef, pkg: SkillPackage): Promise<{ name: string; type: string }> {
  return unwrap(await api.put<ApiSuccess<{ name: string; type: string }>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}`, pkg));
}

export async function deleteSkill(name: string): Promise<{ deleted: string }> {
  return unwrap(await api.delete<ApiSuccess<{ deleted: string }>>(`/skills/${encodeURIComponent(name)}`));
}

export async function deleteContent(ref: ContentRef): Promise<{ deleted: string }> {
  return unwrap(await api.delete<ApiSuccess<{ deleted: string }>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}`));
}

export async function patchSkill(name: string, patch: PatchSkillRequest): Promise<{ name: string; type: string }> {
  return unwrap(
    await api.patch<ApiSuccess<{ name: string; type: string }>>(`/skills/${encodeURIComponent(name)}`, patch),
  );
}

export async function patchContent(ref: ContentRef, patch: PatchSkillRequest): Promise<{ name: string; type: string }> {
  return unwrap(
    await api.patch<ApiSuccess<{ name: string; type: string }>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}`, patch),
  );
}

export async function cloneSkill(name: string, body: { newName: string }): Promise<CloneResult> {
  return unwrap(await api.post<ApiSuccess<CloneResult>>(`/skills/${encodeURIComponent(name)}/clone`, body));
}

export async function cloneContent(ref: ContentRef, body: { newName: string }): Promise<CloneResult> {
  return unwrap(await api.post<ApiSuccess<CloneResult>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}/clone`, body));
}

export async function renameSkill(name: string, body: { newName: string }): Promise<RenameResult> {
  return unwrap(await api.post<ApiSuccess<RenameResult>>(`/skills/${encodeURIComponent(name)}/rename`, body));
}

export async function renameContent(ref: ContentRef, body: { newName: string }): Promise<RenameResult> {
  return unwrap(await api.post<ApiSuccess<RenameResult>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}/rename`, body));
}

export async function fetchSkillInfo(name: string): Promise<SkillInfo> {
  return unwrap(await api.get<ApiSuccess<SkillInfo>>(`/skills/${encodeURIComponent(name)}/info`));
}

export async function fetchContentInfo(ref: ContentRef): Promise<SkillInfo> {
  return unwrap(await api.get<ApiSuccess<SkillInfo>>(`/content/${encodeURIComponent(ref.type)}/${encodeURIComponent(ref.name)}/info`));
}

export async function fetchWorkspaceRuleContent(params: {
  filePath: string;
  appId: string;
  name: string;
  detectedPath?: string;
}): Promise<LocalWorkspaceRuleContent> {
  return unwrap(
    await api.get<ApiSuccess<LocalWorkspaceRuleContent>>('/skills/hub/rules/content', {
      params,
    }),
  );
}

export async function saveWorkspaceRuleContent(body: {
  filePath: string;
  appId: string;
  name: string;
  content: string;
  detectedPath?: string;
}): Promise<{ path: string; created: boolean }> {
  return unwrap(
    await api.put<ApiSuccess<{ path: string; created: boolean }>>('/skills/hub/rules/local', body),
  );
}

export async function deleteWorkspaceRuleContent(body: {
  filePath: string;
  appId: string;
  name: string;
  detectedPath?: string;
}): Promise<{ path: string }> {
  return unwrap(
    await api.delete<ApiSuccess<{ path: string }>>('/skills/hub/rules/local', { data: body }),
  );
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export async function deploy(req: DeployRequest): Promise<DeployResult> {
  return unwrap(await api.post<ApiSuccess<DeployResult>>('/deploy', req));
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export async function fetchWorkspace(path?: string): Promise<WorkspaceData> {
  const params = path ? { path } : {};
  const data = unwrap(await api.get<ApiSuccess<WorkspaceData>>('/workspace', { params }));
  return {
    ...data,
    workspaceDir: data.workspaceDir ?? (data.filePath ? dirname(data.filePath) : null),
    agents: data.agents ?? [],
    apps: data.apps ?? [],
  };
}

export async function saveWorkspace(filePath: string, manifest: WorkspaceManifest): Promise<{ saved: string }> {
  return unwrap(await api.put<ApiSuccess<{ saved: string }>>('/workspace', { filePath, manifest }));
}

// ---------------------------------------------------------------------------
// Workspace Registry
// ---------------------------------------------------------------------------

export async function fetchWorkspaceRegistry(): Promise<WorkspaceRegistryEntry[]> {
  const entries = unwrap(await api.get<ApiSuccess<WorkspaceRegistryEntry[]>>('/workspace/registry'));
  return entries.map((entry) => ({
    ...entry,
    workspaceDir: entry.workspaceDir ?? dirname(entry.filePath),
  }));
}

export async function fetchWorkspaceSuggestions(): Promise<WorkspaceSuggestion[]> {
  const legacySuggestions = unwrap(
    await api.get<ApiSuccess<SuggestionDir[]>>('/explorer/suggestions'),
  );

  return legacySuggestions.map((suggestion) => ({
    workspaceDir: suggestion.path,
    label: suggestion.label,
    manifestPath: `${suggestion.path.replace(/\/+$/, '')}/ahub.workspace.json`,
    manifestExists: false,
    skillCount: suggestion.skillCount,
    detected: [],
  }));
}

export async function registerWorkspaceApi(
  body: {
    filePath?: string;
    directory?: string;
    create?: boolean;
    name?: string;
    localSkillStrategy?: 'adopt' | 'ignore';
  },
): Promise<RegisterWorkspaceResult> {
  const payload = body.directory && body.create === undefined
    ? { ...body, create: true }
    : body;

  const result = unwrap(
    await api.post<ApiSuccess<RegisterWorkspaceResult>>('/workspace/registry', payload),
  );

  if (payload.directory) {
    const requestedDirectory = normalizePath(payload.directory);
    const registeredDirectory = normalizePath(dirname(result.registered));

    if (requestedDirectory !== registeredDirectory) {
      throw new Error(
        `O backend registrou "${registeredDirectory}" em vez da pasta escolhida "${requestedDirectory}". Reinicie o backend atualizado antes de adicionar este workspace.`,
      );
    }
  }

  return result;
}

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  parts.pop();
  if (parts.length === 0) return normalized;
  if (parts.length === 1 && parts[0] === '') return '/';
  return parts.join('/') || '/';
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

export async function unregisterWorkspaceApi(filePath: string): Promise<{ unregistered: string }> {
  return unwrap(
    await api.delete<ApiSuccess<{ unregistered: string }>>('/workspace/registry', {
      data: { filePath },
    }),
  );
}

export async function setActiveWorkspaceApi(filePath: string): Promise<{ active: string }> {
  return unwrap(
    await api.put<ApiSuccess<{ active: string }>>('/workspace/active', { filePath }),
  );
}

// ---------------------------------------------------------------------------
// Explorer (directory browsing)
// ---------------------------------------------------------------------------

export async function browseDirectory(dir?: string): Promise<BrowseResult> {
  const params: Record<string, string> = {};
  if (dir) params.dir = dir;
  return unwrap(await api.get<ApiSuccess<BrowseResult>>('/explorer/browse', { params }));
}

export async function scanSkillDirs(dir: string): Promise<ScanResult> {
  return unwrap(await api.get<ApiSuccess<ScanResult>>('/explorer/scan', { params: { dir } }));
}

export async function fetchAppsCatalog(): Promise<AgentAppCatalogItem[]> {
  return unwrap(await api.get<ApiSuccess<AgentAppCatalogItem[]>>('/apps/catalog'));
}

export async function planAppMigrationApi(body: {
  workspaceDir?: string;
  fromApp: AgentAppCatalogItem['appId'];
  toApp: AgentAppCatalogItem['appId'];
  skill?: string;
  all?: boolean;
}): Promise<AppMigrationPlan> {
  return unwrap(await api.post<ApiSuccess<AppMigrationPlan>>('/migrations/plan', body));
}

export async function fetchSuggestions(): Promise<SuggestionDir[]> {
  return unwrap(await api.get<ApiSuccess<SuggestionDir[]>>('/explorer/suggestions'));
}

export async function pickNativeDirectory(initialDir?: string): Promise<PickDirectoryResult> {
  return unwrap(await api.post<ApiSuccess<PickDirectoryResult>>('/explorer/pick-directory', { initialDir }));
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function sync(req?: SyncRequest): Promise<SyncResult> {
  return unwrap(await api.post<ApiSuccess<SyncResult>>('/sync', req ?? {}));
}

/**
 * Subscribe to SSE sync stream. Returns an EventSource that emits
 * 'progress', 'complete', and 'error' events.
 */
export function syncStream(params?: {
  force?: boolean;
  dryRun?: boolean;
  filter?: string[];
  filePath?: string;
}): EventSource {
  const qs = new URLSearchParams();
  if (params?.force) qs.set('force', 'true');
  if (params?.dryRun) qs.set('dryRun', 'true');
  if (params?.filter?.length) qs.set('filter', params.filter.join(','));
  if (params?.filePath) qs.set('path', params.filePath);

  const url = `/api/sync/stream${qs.toString() ? `?${qs.toString()}` : ''}`;
  return new EventSource(url);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<AhubConfig> {
  return unwrap(await api.get<ApiSuccess<AhubConfig>>('/config'));
}

export async function fetchConfigValue(key: string): Promise<{ key: string; value: unknown }> {
  return unwrap(await api.get<ApiSuccess<{ key: string; value: unknown }>>(`/config/${key}`));
}

export async function setConfigValue(key: string, value: unknown): Promise<{ key: string; value: unknown }> {
  return unwrap(await api.put<ApiSuccess<{ key: string; value: unknown }>>(`/config/${key}`, { value }));
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export async function fetchCachedSkills(): Promise<string[]> {
  return unwrap(await api.get<ApiSuccess<string[]>>('/cache'));
}

export async function clearCache(): Promise<{ cleared: boolean }> {
  return unwrap(await api.delete<ApiSuccess<{ cleared: boolean }>>('/cache'));
}
