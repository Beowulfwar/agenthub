import type { GitHubRepoVisibility } from '../../core/types.js';

export type ArtifactProviderKind = 'local' | 'github' | 'drive';

export interface RemoteFileEntry {
  path: string;
  sha: string;
  size: number;
  type: 'file';
}

export interface RemoteFile extends RemoteFileEntry {
  content: string;
  encoding: 'utf-8';
}

export interface PutFileInput {
  path: string;
  content: string;
  message: string;
  sha?: string;
}

export interface PutFileResult {
  path: string;
  sha: string;
}

export interface DeleteFileInput {
  path: string;
  message: string;
  sha?: string;
}

export interface RepositoryRef {
  owner: string;
  repo: string;
  branch: string;
  htmlUrl?: string;
}

export interface BootstrapRepositoryInput {
  name: string;
  visibility: GitHubRepoVisibility;
  branch?: string;
  basePath?: string;
  description?: string;
}

export interface ArtifactStorageProvider {
  readonly kind: ArtifactProviderKind;

  listFiles(prefix?: string): Promise<RemoteFileEntry[]>;
  getFile(path: string): Promise<RemoteFile | null>;
  putFile(input: PutFileInput): Promise<PutFileResult>;
  deleteFile(input: DeleteFileInput): Promise<void>;
  bootstrapRepository?(input: BootstrapRepositoryInput): Promise<RepositoryRef>;
}
