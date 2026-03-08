import { createHash } from 'node:crypto';
import path from 'node:path';

import type {
  ContentPackage,
  ContentRef,
  ContentType,
  GitHubConfig,
  GitHubRepoVisibility,
  HealthCheckResult,
} from '../../core/types.js';
import { getMarkerFile, parseSkill } from '../../core/skill.js';
import { AuthenticationError, ConflictError, SkillNotFoundError } from '../../core/errors.js';
import { parseContentRef, formatContentRef } from '../../core/content-ref.js';
import { assertSafeRelativePath, assertSafeSkillName } from '../../core/sanitize.js';
import { getSecret, githubTokenAccountKey, KEYCHAIN_SERVICE } from '../../core/secrets/keychain.js';
import type {
  ArtifactStorageProvider,
  BootstrapRepositoryInput,
  DeleteFileInput,
  PutFileInput,
  PutFileResult,
  RemoteFile,
  RemoteFileEntry,
  RepositoryRef,
} from '../contracts/artifact-storage.js';
import { GitHubApiClient, type GitHubContentDirectoryEntry, type GitHubContentEntry, type GitHubContentFile } from './github-api-client.js';
import type { ListOptions, StorageProvider } from '../../storage/provider.js';

const ROOT_DIRS: Record<ContentType, string> = {
  skill: 'skills',
  prompt: 'prompts',
  subagent: 'agents',
};

export interface AgentHubRemoteArtifact {
  path: string;
  sha: string;
  contentHash: string;
  updatedAt: string;
}

export interface AgentHubRemoteManifest {
  schemaVersion: 1;
  branch: string;
  lastSyncCursor: string | null;
  artifacts: AgentHubRemoteArtifact[];
}

export const AGENT_HUB_MANIFEST_PATH = '.agent-hub.json';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function joinRemotePath(...parts: string[]): string {
  return parts.map(trimSlashes).filter(Boolean).join('/');
}

function decodeGitHubContent(file: GitHubContentFile): string {
  if (!file.content) return '';
  const encoding = file.encoding ?? 'base64';
  if (encoding !== 'base64') {
    return file.content;
  }
  return Buffer.from(file.content, 'base64').toString('utf-8');
}

function isDirectoryResponse(
  value: GitHubContentFile | GitHubContentEntry[] | GitHubContentDirectoryEntry,
): value is GitHubContentEntry[] {
  return Array.isArray(value);
}

function markerForType(type: ContentType): string {
  return getMarkerFile(type);
}

function contentRoot(type: ContentType): string {
  return ROOT_DIRS[type];
}

function remotePackagePrefix(ref: ContentRef): string {
  return joinRemotePath(contentRoot(ref.type), ref.name);
}

function remotePackagePath(ref: ContentRef, relativePath: string): string {
  return joinRemotePath(remotePackagePrefix(ref), relativePath);
}

function remotePathToContentFile(remotePath: string): { ref: ContentRef; relativePath: string } | null {
  const normalized = trimSlashes(remotePath);
  const parts = normalized.split('/');
  if (parts.length < 3) return null;

  const [topLevel, name, ...rest] = parts;
  const type = (Object.entries(ROOT_DIRS).find(([, dir]) => dir === topLevel)?.[0] ?? null) as ContentType | null;
  if (!type || rest.length === 0) return null;

  return {
    ref: { type, name },
    relativePath: rest.join('/'),
  };
}

function buildManifest(artifacts: AgentHubRemoteArtifact[], branch: string): AgentHubRemoteManifest {
  return {
    schemaVersion: 1,
    branch,
    lastSyncCursor: new Date().toISOString(),
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

export class GitHubStorageProvider implements ArtifactStorageProvider {
  readonly kind = 'github' as const;

  private owner: string;
  private repo: string;
  private branch: string;
  private readonly basePath: string;
  private readonly visibility: GitHubRepoVisibility;
  private readonly client: GitHubApiClient;
  private operationChain: Promise<void> = Promise.resolve();

  constructor(config: GitHubConfig, accessToken: string) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch ?? 'main';
    this.basePath = trimSlashes(config.basePath ?? '.');
    this.visibility = config.visibility;
    this.client = new GitHubApiClient(accessToken);
  }

  get repository(): RepositoryRef {
    return {
      owner: this.owner,
      repo: this.repo,
      branch: this.branch,
    };
  }

  get configuredVisibility(): GitHubRepoVisibility {
    return this.visibility;
  }

  private resolveRemotePath(relativePath: string): string {
    if (!relativePath || relativePath === '.' || relativePath === './') {
      return this.basePath === '.' ? '' : this.basePath;
    }
    assertSafeRelativePath(relativePath);
    return joinRemotePath(this.basePath === '.' ? '' : this.basePath, relativePath);
  }

  private relativeFromRemotePath(remotePath: string): string {
    const normalizedBase = this.basePath === '.' ? '' : trimSlashes(this.basePath);
    const normalizedPath = trimSlashes(remotePath);
    if (!normalizedBase) return normalizedPath;
    return normalizedPath.startsWith(`${normalizedBase}/`)
      ? normalizedPath.slice(normalizedBase.length + 1)
      : normalizedPath;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationChain.then(operation, operation);
    this.operationChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async walkDirectory(remotePath: string): Promise<RemoteFileEntry[]> {
    const response = await this.client.getContent(this.owner, this.repo, remotePath);
    if (!response) return [];

    if (isDirectoryResponse(response)) {
      const files: RemoteFileEntry[] = [];
      for (const entry of response) {
        if (entry.type === 'dir') {
          files.push(...await this.walkDirectory(entry.path));
        }
      }
      const directFiles = response
        .filter((entry): entry is GitHubContentFile => entry.type === 'file')
        .map((entry) => ({
          path: this.relativeFromRemotePath(entry.path),
          sha: entry.sha,
          size: entry.size,
          type: 'file' as const,
        }));
      return [...files, ...directFiles];
    }

    if (response.type !== 'file') {
      return [];
    }

    return [{
      path: this.relativeFromRemotePath(response.path),
      sha: response.sha,
      size: response.size,
      type: 'file',
    }];
  }

  async listFiles(prefix = ''): Promise<RemoteFileEntry[]> {
    const remotePath = prefix ? this.resolveRemotePath(prefix) : this.resolveRemotePath('.');
    return this.walkDirectory(remotePath);
  }

  async getFile(relativePath: string): Promise<RemoteFile | null> {
    const remotePath = this.resolveRemotePath(relativePath);
    const response = await this.client.getContent(this.owner, this.repo, remotePath);
    if (!response || Array.isArray(response) || response.type !== 'file') {
      return null;
    }

    return {
      path: this.relativeFromRemotePath(response.path),
      sha: response.sha,
      size: response.size,
      type: 'file',
      content: decodeGitHubContent(response),
      encoding: 'utf-8',
    };
  }

  async putFile(input: PutFileInput): Promise<PutFileResult> {
    return this.enqueue(async () => {
      const existing = input.sha ? null : await this.getFile(input.path);
      const response = await this.client.putFile({
        owner: this.owner,
        repo: this.repo,
        path: this.resolveRemotePath(input.path),
        message: input.message,
        content: input.content,
        sha: input.sha ?? existing?.sha,
        branch: this.branch,
      });

      return {
        path: input.path,
        sha: response.content.sha,
      };
    });
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    await this.enqueue(async () => {
      const existing = input.sha ? null : await this.getFile(input.path);
      const sha = input.sha ?? existing?.sha;
      if (!sha) return;

      await this.client.deleteFile({
        owner: this.owner,
        repo: this.repo,
        path: this.resolveRemotePath(input.path),
        message: input.message,
        sha,
        branch: this.branch,
      });
    });
  }

  async bootstrapRepository(input: BootstrapRepositoryInput): Promise<RepositoryRef> {
    let repositoryName = input.name;
    let repository = null as Awaited<ReturnType<GitHubApiClient['createRepositoryForAuthenticatedUser']>> | null;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        repository = await this.client.createRepositoryForAuthenticatedUser({
          name: repositoryName,
          private: input.visibility !== 'public',
          autoInit: true,
          description: input.description ?? 'Remote storage for agent-hub content.',
        });
        break;
      } catch (err) {
        if (err instanceof ConflictError) {
          repositoryName = `${input.name}-${attempt + 2}`;
          continue;
        }
        throw err;
      }
    }

    if (!repository) {
      throw new ConflictError('Unable to create a unique GitHub repository name after multiple attempts.');
    }

    this.owner = repository.owner.login;
    this.repo = repository.name;
    this.branch = repository.default_branch;

    const bootstrapFiles = [
      {
        path: AGENT_HUB_MANIFEST_PATH,
        content: JSON.stringify(buildManifest([], repository.default_branch), null, 2) + '\n',
        message: 'Bootstrap remote storage manifest',
      },
      {
        path: 'skills/README.md',
        content: '# Skills\n\nStorage for skill packages synchronized by agent-hub.\n',
        message: 'Bootstrap skills directory',
      },
      {
        path: 'prompts/README.md',
        content: '# Prompts\n\nStorage for prompts synchronized by agent-hub.\n',
        message: 'Bootstrap prompts directory',
      },
      {
        path: 'agents/README.md',
        content: '# Agents\n\nStorage for subagents synchronized by agent-hub.\n',
        message: 'Bootstrap agents directory',
      },
      {
        path: 'workflows/README.md',
        content: '# Workflows\n\nReserved for workflow artifacts managed by agent-hub.\n',
        message: 'Bootstrap workflows directory',
      },
    ];

    for (const file of bootstrapFiles) {
      await this.putFile(file);
    }

    return {
      owner: repository.owner.login,
      repo: repository.name,
      branch: repository.default_branch,
      htmlUrl: repository.html_url,
    };
  }

  async loadManifest(): Promise<AgentHubRemoteManifest | null> {
    const file = await this.getFile(AGENT_HUB_MANIFEST_PATH);
    if (!file) return null;
    const parsed = JSON.parse(file.content) as AgentHubRemoteManifest;
    return parsed;
  }

  async saveManifest(manifest: AgentHubRemoteManifest): Promise<void> {
    const existing = await this.getFile(AGENT_HUB_MANIFEST_PATH);
    await this.putFile({
      path: AGENT_HUB_MANIFEST_PATH,
      content: JSON.stringify(manifest, null, 2) + '\n',
      message: 'Update remote storage manifest',
      ...(existing?.sha ? { sha: existing.sha } : {}),
    });
  }
}

export class GitHubSourceProvider implements StorageProvider {
  readonly name = 'github' as const;

  private storage: GitHubStorageProvider | null;
  private readonly config: GitHubConfig | null;

  constructor(storageOrConfig: GitHubStorageProvider | GitHubConfig) {
    if (storageOrConfig instanceof GitHubStorageProvider) {
      this.storage = storageOrConfig;
      this.config = null;
    } else {
      this.storage = null;
      this.config = storageOrConfig;
    }
  }

  private async ensureStorage(): Promise<GitHubStorageProvider> {
    if (this.storage) {
      return this.storage;
    }
    if (!this.config) {
      throw new AuthenticationError('GitHub storage configuration is missing.');
    }

    const token = await getSecret(KEYCHAIN_SERVICE, githubTokenAccountKey(this.config.accountId));
    if (!token) {
      throw new AuthenticationError('GitHub token not found in the secure credential store.');
    }

    this.storage = new GitHubStorageProvider(this.config, token);
    return this.storage;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const storage = await this.ensureStorage();
      await storage.loadManifest().catch(async (err) => {
        if (err instanceof SkillNotFoundError) return null;
        throw err;
      });
      await storage.listFiles('skills').catch(() => []);
      return {
        ok: true,
        message: `GitHub repository reachable at ${storage.repository.owner}/${storage.repository.repo}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `GitHub storage health check failed: ${message}`,
      };
    }
  }

  async list(options?: string | ListOptions): Promise<string[]> {
    const refs = await this.listContentRefs(options);
    return refs.map((ref) => formatContentRef(ref));
  }

  async listContentRefs(options?: string | ListOptions): Promise<ContentRef[]> {
    const storage = await this.ensureStorage();
    const opts = typeof options === 'string' ? { query: options } : (options ?? {});
    const roots = Object.keys(ROOT_DIRS) as ContentType[];
    const refs = new Map<string, ContentRef>();

    for (const type of roots) {
      const marker = markerForType(type);
      const files = await storage.listFiles(contentRoot(type)).catch(() => []);
      for (const file of files) {
        const parsed = remotePathToContentFile(file.path);
        if (!parsed || parsed.ref.type !== type) continue;
        if (parsed.relativePath !== marker) continue;
        refs.set(formatContentRef(parsed.ref), parsed.ref);
      }
    }

    let results = [...refs.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name);
    });

    if (opts.type) {
      results = results.filter((ref) => ref.type === opts.type);
    }
    if (opts.query) {
      const lower = opts.query.toLowerCase();
      results = results.filter((ref) =>
        formatContentRef(ref).toLowerCase().includes(lower) || ref.name.toLowerCase().includes(lower),
      );
    }

    return results;
  }

  async exists(refOrName: string | ContentRef): Promise<boolean> {
    const ref = typeof refOrName === 'string' ? parseContentRef(refOrName, 'skill') : refOrName;
    const storage = await this.ensureStorage();
    return (await storage.getFile(remotePackagePath(ref, markerForType(ref.type)))) !== null;
  }

  async get(refOrName: string | ContentRef): Promise<ContentPackage> {
    const storage = await this.ensureStorage();
    const ref = typeof refOrName === 'string' ? parseContentRef(refOrName, 'skill') : refOrName;
    assertSafeSkillName(ref.name);

    const files = await storage.listFiles(remotePackagePrefix(ref));
    if (files.length === 0) {
      throw new SkillNotFoundError(formatContentRef(ref));
    }

    const remoteFiles = await Promise.all(files.map((file) => storage.getFile(file.path)));
    const presentFiles = remoteFiles.filter((file): file is RemoteFile => file !== null);
    const marker = markerForType(ref.type);
    const markerFile = presentFiles.find((file) => file.path === remotePackagePath(ref, marker));
    if (!markerFile) {
      throw new SkillNotFoundError(formatContentRef(ref));
    }

    const content = parseSkill(markerFile.content);
    if (!content.type) {
      content.type = ref.type;
    }
    content.name = ref.name;

    return {
      skill: content,
      files: presentFiles.map((file) => ({
        relativePath: file.path.slice(remotePackagePrefix(ref).length + 1),
        content: file.content,
      })),
    };
  }

  async put(pkg: ContentPackage): Promise<void> {
    const storage = await this.ensureStorage();
    const ref = {
      type: pkg.skill.type ?? 'skill',
      name: pkg.skill.name,
    } satisfies ContentRef;
    assertSafeSkillName(ref.name);

    const prefix = remotePackagePrefix(ref);
    const existing = await storage.listFiles(prefix);
    const desiredPaths = new Set<string>();

    for (const file of pkg.files) {
      assertSafeRelativePath(file.relativePath);
      const remotePath = remotePackagePath(ref, file.relativePath);
      desiredPaths.add(remotePath);
      const current = existing.find((entry) => entry.path === remotePath);
      await storage.putFile({
        path: remotePath,
        content: file.content,
        message: `Update content package ${formatContentRef(ref)}`,
        ...(current?.sha ? { sha: current.sha } : {}),
      });
    }

    const staleFiles = existing.filter((entry) => !desiredPaths.has(entry.path));
    staleFiles.sort((a, b) => b.path.localeCompare(a.path));
    for (const file of staleFiles) {
      await storage.deleteFile({
        path: file.path,
        sha: file.sha,
        message: `Remove stale file from ${formatContentRef(ref)}`,
      });
    }
  }

  async delete(refOrName: string | ContentRef): Promise<void> {
    const storage = await this.ensureStorage();
    const ref = typeof refOrName === 'string' ? parseContentRef(refOrName, 'skill') : refOrName;
    const files = await storage.listFiles(remotePackagePrefix(ref));
    if (files.length === 0) {
      throw new SkillNotFoundError(formatContentRef(ref));
    }

    files.sort((a, b) => b.path.localeCompare(a.path));
    for (const file of files) {
      await storage.deleteFile({
        path: file.path,
        sha: file.sha,
        message: `Delete content package ${formatContentRef(ref)}`,
      });
    }
  }

  async *exportAll(): AsyncIterable<ContentPackage> {
    const refs = await this.listContentRefs();
    for (const ref of refs) {
      yield await this.get(ref);
    }
  }
}

export function buildRemoteManifestFromPackages(
  packages: ContentPackage[],
): AgentHubRemoteArtifact[] {
  const artifacts: AgentHubRemoteArtifact[] = [];
  const now = new Date().toISOString();

  for (const pkg of packages) {
    const ref = {
      type: pkg.skill.type ?? 'skill',
      name: pkg.skill.name,
    } satisfies ContentRef;

    for (const file of pkg.files) {
      const remotePath = remotePackagePath(ref, file.relativePath);
      artifacts.push({
        path: remotePath,
        sha: '',
        contentHash: sha256(file.content),
        updatedAt: now,
      });
    }
  }

  return artifacts;
}

export function buildManifestFile(
  branch: string,
  artifacts: AgentHubRemoteArtifact[],
): AgentHubRemoteManifest {
  return buildManifest(artifacts, branch);
}
