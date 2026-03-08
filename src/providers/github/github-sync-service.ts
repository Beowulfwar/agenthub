import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  AhubConfig,
  ContentPackage,
  ContentRef,
  GitHubConfig,
  SourceConfig,
} from '../../core/types.js';
import { AHUB_DIR, loadConfigV2, setDefaultSource, upsertSource } from '../../core/config.js';
import { AuthenticationError, ConflictError } from '../../core/errors.js';
import { KEYCHAIN_SERVICE, getSecret, githubTokenAccountKey } from '../../core/secrets/keychain.js';
import { LocalProvider } from '../../storage/local-provider.js';
import { GitHubSourceProvider, GitHubStorageProvider, type AgentHubRemoteArtifact, type AgentHubRemoteManifest, buildManifestFile } from './github-storage-provider.js';

export const DEFAULT_GITHUB_SOURCE_ID = 'github-default';
export const DEFAULT_LOCAL_SOURCE_ID = 'local-default';
export const DEFAULT_LOCAL_LIBRARY_DIR = path.join(AHUB_DIR, 'library');

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

interface DesiredRemoteFile {
  path: string;
  content: string;
  contentHash: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function flattenPackages(packages: ContentPackage[]): DesiredRemoteFile[] {
  const files: DesiredRemoteFile[] = [];
  for (const pkg of packages) {
    const ref = {
      type: pkg.skill.type ?? 'skill',
      name: pkg.skill.name,
    } satisfies ContentRef;

    const root = ref.type === 'skill' ? 'skills' : ref.type === 'prompt' ? 'prompts' : 'agents';
    for (const file of pkg.files) {
      const remotePath = `${root}/${ref.name}/${file.relativePath}`.replace(/\/+/g, '/');
      files.push({
        path: remotePath,
        content: file.content,
        contentHash: createHash('sha256').update(file.content).digest('hex'),
      });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function isManagedArtifact(pathname: string): boolean {
  const parts = pathname.split('/');
  if (parts.length < 3) return false;
  return parts[0] === 'skills' || parts[0] === 'prompts' || parts[0] === 'agents';
}

async function listManagedRemoteFiles(storage: GitHubStorageProvider) {
  const files = await Promise.all([
    storage.listFiles('skills').catch(() => []),
    storage.listFiles('prompts').catch(() => []),
    storage.listFiles('agents').catch(() => []),
  ]);

  return files.flat().filter((file) => isManagedArtifact(file.path));
}

function findFirstLocalSource(config: AhubConfig): SourceConfig | undefined {
  return config.sources?.find((source) => source.provider === 'local');
}

export function findGitHubSource(config: AhubConfig | null): SourceConfig | undefined {
  return config?.sources?.find((source) => source.provider === 'github');
}

export async function ensureCanonicalLocalSource(): Promise<SourceConfig> {
  const config = (await loadConfigV2()) ?? { version: 2, sources: [] };
  const defaultSource = config.defaultSource
    ? config.sources?.find((source) => source.id === config.defaultSource)
    : undefined;
  if (defaultSource?.provider === 'local' && defaultSource.local) {
    return defaultSource;
  }

  const existingLocal = findFirstLocalSource(config);
  if (existingLocal?.local) {
    return existingLocal;
  }

  const localSource: SourceConfig = {
    id: DEFAULT_LOCAL_SOURCE_ID,
    label: 'Local Library',
    provider: 'local',
    local: {
      directory: DEFAULT_LOCAL_LIBRARY_DIR,
    },
    enabled: true,
  };
  await upsertSource(localSource);
  if (!config.defaultSource) {
    await setDefaultSource(localSource.id);
  }
  return localSource;
}

export async function loadGitHubToken(githubConfig: GitHubConfig): Promise<string> {
  const token = await getSecret(KEYCHAIN_SERVICE, githubTokenAccountKey(githubConfig.accountId));
  if (!token) {
    throw new AuthenticationError('GitHub token not found in the secure credential store.');
  }
  return token;
}

export async function createGitHubStorageFromConfig(githubConfig: GitHubConfig): Promise<GitHubStorageProvider> {
  const token = await loadGitHubToken(githubConfig);
  return new GitHubStorageProvider(githubConfig, token);
}

export function createGitHubSourceFromConfig(githubConfig: GitHubConfig): GitHubSourceProvider {
  return new GitHubSourceProvider(githubConfig);
}

async function buildSyncPlan(storage: GitHubStorageProvider, localPackages: ContentPackage[]): Promise<{
  preview: GitHubSyncPreview;
  desiredFiles: DesiredRemoteFile[];
  currentRemoteFiles: Awaited<ReturnType<typeof listManagedRemoteFiles>>;
  remoteManifest: AgentHubRemoteManifest | null;
}> {
  const desiredFiles = flattenPackages(localPackages);
  const desiredByPath = new Map(desiredFiles.map((file) => [file.path, file]));
  const currentRemoteFiles = await listManagedRemoteFiles(storage);
  const currentByPath = new Map(currentRemoteFiles.map((file) => [file.path, file]));
  const remoteManifest = await storage.loadManifest();
  const manifestByPath = new Map((remoteManifest?.artifacts ?? []).map((artifact) => [artifact.path, artifact]));

  const creates: string[] = [];
  const updates: string[] = [];
  const deletes: string[] = [];
  const skipped: string[] = [];
  const conflicts: GitHubSyncConflict[] = [];

  for (const desired of desiredFiles) {
    const current = currentByPath.get(desired.path);
    const manifestArtifact = manifestByPath.get(desired.path);
    if (!current) {
      creates.push(desired.path);
      continue;
    }

    if (manifestArtifact && current.sha === manifestArtifact.sha) {
      if (manifestArtifact.contentHash === desired.contentHash) {
        skipped.push(desired.path);
      } else {
        updates.push(desired.path);
      }
      continue;
    }

    const remoteFile = await storage.getFile(desired.path);
    if (!remoteFile) {
      creates.push(desired.path);
      continue;
    }

    const remoteHash = sha256(remoteFile.content);
    if (remoteHash === desired.contentHash) {
      skipped.push(desired.path);
    } else {
      conflicts.push({
        path: desired.path,
        reason: 'Remote content changed since the last manifest snapshot.',
      });
    }
  }

  for (const current of currentRemoteFiles) {
    if (!desiredByPath.has(current.path)) {
      const manifestArtifact = manifestByPath.get(current.path);
      if (manifestArtifact && manifestArtifact.sha !== current.sha) {
        conflicts.push({
          path: current.path,
          reason: 'Remote file changed since the last manifest snapshot and will not be deleted automatically.',
        });
      } else {
        deletes.push(current.path);
      }
    }
  }

  return {
    preview: {
      localSourceId: '',
      creates,
      updates,
      deletes,
      skipped,
      conflicts,
      manifestPresent: remoteManifest !== null,
    },
    desiredFiles,
    currentRemoteFiles,
    remoteManifest,
  };
}

export async function previewGitHubSync(config?: AhubConfig | null): Promise<GitHubSyncPreview> {
  const effectiveConfig = config ?? await loadConfigV2();
  const githubSource = findGitHubSource(effectiveConfig);
  if (!githubSource?.github) {
    throw new AuthenticationError('GitHub is not connected.');
  }

  const localSource = await ensureCanonicalLocalSource();
  const localProvider = new LocalProvider(localSource.local!);
  const localPackages = [];
  for await (const pkg of localProvider.exportAll()) {
    localPackages.push(pkg);
  }

  const storage = await createGitHubStorageFromConfig(githubSource.github);
  const plan = await buildSyncPlan(storage, localPackages);
  return {
    ...plan.preview,
    localSourceId: localSource.id,
  };
}

export async function syncGitHubFromLocal(config?: AhubConfig | null): Promise<GitHubSyncResult> {
  const effectiveConfig = config ?? await loadConfigV2();
  const githubSource = findGitHubSource(effectiveConfig);
  if (!githubSource?.github) {
    throw new AuthenticationError('GitHub is not connected.');
  }

  const localSource = await ensureCanonicalLocalSource();
  const localProvider = new LocalProvider(localSource.local!);
  const localPackages = [];
  for await (const pkg of localProvider.exportAll()) {
    localPackages.push(pkg);
  }

  const storage = await createGitHubStorageFromConfig(githubSource.github);
  const plan = await buildSyncPlan(storage, localPackages);
  const currentByPath = new Map(plan.currentRemoteFiles.map((file) => [file.path, file]));
  const desiredByPath = new Map(plan.desiredFiles.map((file) => [file.path, file]));

  for (const filePath of plan.preview.creates) {
    const desired = desiredByPath.get(filePath)!;
    await storage.putFile({
      path: desired.path,
      content: desired.content,
      message: `Create remote artifact ${desired.path}`,
    });
  }

  for (const filePath of plan.preview.updates) {
    const desired = desiredByPath.get(filePath)!;
    const current = currentByPath.get(filePath);
    await storage.putFile({
      path: desired.path,
      content: desired.content,
      message: `Update remote artifact ${desired.path}`,
      ...(current?.sha ? { sha: current.sha } : {}),
    });
  }

  for (const filePath of plan.preview.deletes) {
    const current = currentByPath.get(filePath);
    if (!current) continue;
    await storage.deleteFile({
      path: current.path,
      sha: current.sha,
      message: `Delete remote artifact ${current.path}`,
    });
  }

  const manifestArtifacts: AgentHubRemoteArtifact[] = [];
  for (const desired of plan.desiredFiles) {
    const remote = await storage.getFile(desired.path);
    if (!remote) {
      throw new ConflictError(`Remote file missing after sync: ${desired.path}`);
    }
    manifestArtifacts.push({
      path: desired.path,
      sha: remote.sha,
      contentHash: desired.contentHash,
      updatedAt: new Date().toISOString(),
    });
  }

  await storage.saveManifest(buildManifestFile(githubSource.github.branch, manifestArtifacts));

  return {
    ...plan.preview,
    localSourceId: localSource.id,
    syncedAt: new Date().toISOString(),
  };
}
