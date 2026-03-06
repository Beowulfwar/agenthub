/**
 * Typed API client — thin Axios wrappers for every backend endpoint.
 */

import axios from 'axios';
import type {
  HealthData,
  SkillSummary,
  SkillPackage,
  SkillInfo,
  PatchSkillRequest,
  CloneResult,
  RenameResult,
  DeployRequest,
  DeployResult,
  SyncRequest,
  SyncResult,
  WorkspaceData,
  WorkspaceManifest,
  WorkspaceRegistryEntry,
  WorkspaceSuggestion,
  BrowseResult,
  ScanResult,
  SuggestionDir,
  PickDirectoryResult,
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

export async function fetchSkill(name: string): Promise<SkillPackage> {
  return unwrap(await api.get<ApiSuccess<SkillPackage>>(`/skills/${encodeURIComponent(name)}`));
}

export async function updateSkill(name: string, pkg: SkillPackage): Promise<{ saved: string }> {
  return unwrap(await api.put<ApiSuccess<{ saved: string }>>(`/skills/${encodeURIComponent(name)}`, pkg));
}

export async function deleteSkill(name: string): Promise<{ deleted: string }> {
  return unwrap(await api.delete<ApiSuccess<{ deleted: string }>>(`/skills/${encodeURIComponent(name)}`));
}

export async function patchSkill(name: string, patch: PatchSkillRequest): Promise<{ name: string; type: string }> {
  return unwrap(
    await api.patch<ApiSuccess<{ name: string; type: string }>>(`/skills/${encodeURIComponent(name)}`, patch),
  );
}

export async function cloneSkill(name: string, body: { newName: string }): Promise<CloneResult> {
  return unwrap(await api.post<ApiSuccess<CloneResult>>(`/skills/${encodeURIComponent(name)}/clone`, body));
}

export async function renameSkill(name: string, body: { newName: string }): Promise<RenameResult> {
  return unwrap(await api.post<ApiSuccess<RenameResult>>(`/skills/${encodeURIComponent(name)}/rename`, body));
}

export async function fetchSkillInfo(name: string): Promise<SkillInfo> {
  return unwrap(await api.get<ApiSuccess<SkillInfo>>(`/skills/${encodeURIComponent(name)}/info`));
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
  return unwrap(await api.get<ApiSuccess<WorkspaceData>>('/workspace', { params }));
}

export async function saveWorkspace(filePath: string, manifest: WorkspaceManifest): Promise<{ saved: string }> {
  return unwrap(await api.put<ApiSuccess<{ saved: string }>>('/workspace', { filePath, manifest }));
}

// ---------------------------------------------------------------------------
// Workspace Registry
// ---------------------------------------------------------------------------

export async function fetchWorkspaceRegistry(): Promise<WorkspaceRegistryEntry[]> {
  return unwrap(await api.get<ApiSuccess<WorkspaceRegistryEntry[]>>('/workspace/registry'));
}

export async function fetchWorkspaceSuggestions(): Promise<WorkspaceSuggestion[]> {
  return unwrap(await api.get<ApiSuccess<WorkspaceSuggestion[]>>('/workspace/suggestions'));
}

export async function registerWorkspaceApi(
  body: {
    filePath?: string;
    directory?: string;
    create?: boolean;
    name?: string;
  },
): Promise<{ registered: string; created: boolean }> {
  return unwrap(await api.post<ApiSuccess<{ registered: string; created: boolean }>>('/workspace/registry', body));
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
}): EventSource {
  const qs = new URLSearchParams();
  if (params?.force) qs.set('force', 'true');
  if (params?.dryRun) qs.set('dryRun', 'true');
  if (params?.filter?.length) qs.set('filter', params.filter.join(','));

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
