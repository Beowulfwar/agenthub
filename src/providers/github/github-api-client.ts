import { AhubError, AuthenticationError, ConflictError } from '../../core/errors.js';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_VERSION = '2022-11-28';

export interface GitHubOAuthAuthorizationInput {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  allowSignup?: boolean;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256';
}

export interface GitHubOAuthTokenResponse {
  accessToken: string;
  tokenType: string;
  scope: string;
}

export interface GitHubAuthenticatedUser {
  id: number;
  login: string;
  html_url: string;
  name?: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  owner: {
    login: string;
    id: number;
  };
}

export interface GitHubContentFile {
  type: 'file';
  path: string;
  sha: string;
  size: number;
  encoding?: string;
  content?: string;
  download_url?: string | null;
}

export interface GitHubContentDirectoryEntry {
  type: 'dir';
  path: string;
  sha: string;
  size: number;
}

export type GitHubContentEntry = GitHubContentFile | GitHubContentDirectoryEntry;

export type GitHubContentResponse = GitHubContentFile | GitHubContentEntry[] | GitHubContentDirectoryEntry;

class GitHubApiError extends AhubError {
  constructor(
    message: string,
    public readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GitHubApiError';
  }
}

function buildUrl(path: string): string {
  return `${GITHUB_API_URL}${path}`;
}

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export class GitHubApiClient {
  constructor(private readonly accessToken: string) {}

  static buildAuthorizationUrl(input: GitHubOAuthAuthorizationInput): string {
    const url = new URL(GITHUB_AUTHORIZE_URL);
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', input.scope);
    url.searchParams.set('state', input.state);
    url.searchParams.set('allow_signup', String(input.allowSignup ?? true));
    if (input.codeChallenge) {
      url.searchParams.set('code_challenge', input.codeChallenge);
      url.searchParams.set('code_challenge_method', input.codeChallengeMethod ?? 'S256');
    }
    return url.toString();
  }

  static async exchangeCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<GitHubOAuthTokenResponse> {
    const res = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code: params.code,
        redirect_uri: params.redirectUri,
        ...(params.codeVerifier ? { code_verifier: params.codeVerifier } : {}),
      }),
    });

    const payload = await readJsonOrText(res);
    if (!res.ok) {
      throw new AuthenticationError(messageFromPayload(payload, 'GitHub OAuth token exchange failed.'));
    }

    const data = payload as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!data.access_token) {
      const reason = data.error_description ?? data.error ?? 'GitHub OAuth token exchange failed.';
      throw new AuthenticationError(reason);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'bearer',
      scope: data.scope ?? '',
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(buildUrl(path), {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.accessToken}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...(init?.headers ?? {}),
      },
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const payload = await readJsonOrText(res);
    if (!res.ok) {
      const message = messageFromPayload(payload, `GitHub API request failed (${res.status}).`);
      if (res.status === 401 || res.status === 403) {
        throw new AuthenticationError(message);
      }
      if (res.status === 409 || res.status === 422) {
        throw new ConflictError(message);
      }
      throw new GitHubApiError(message, res.status);
    }

    return payload as T;
  }

  async getAuthenticatedUser(): Promise<GitHubAuthenticatedUser> {
    return this.request<GitHubAuthenticatedUser>('/user');
  }

  async createRepositoryForAuthenticatedUser(input: {
    name: string;
    private: boolean;
    autoInit?: boolean;
    description?: string;
  }): Promise<GitHubRepository> {
    return this.request<GitHubRepository>('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        private: input.private,
        auto_init: input.autoInit ?? true,
        ...(input.description ? { description: input.description } : {}),
      }),
    });
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.request<GitHubRepository>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  async getContent(owner: string, repo: string, path: string): Promise<GitHubContentResponse | null> {
    try {
      return await this.request<GitHubContentResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
      );
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async putFile(params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
    branch?: string;
  }): Promise<{ content: GitHubContentFile }> {
    return this.request<{ content: GitHubContentFile }>(
      `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${encodeURIComponent(params.path).replace(/%2F/g, '/')}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: params.message,
          content: encodeBase64(params.content),
          ...(params.sha ? { sha: params.sha } : {}),
          ...(params.branch ? { branch: params.branch } : {}),
        }),
      },
    );
  }

  async deleteFile(params: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    sha: string;
    branch?: string;
  }): Promise<void> {
    await this.request<void>(
      `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/contents/${encodeURIComponent(params.path).replace(/%2F/g, '/')}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: params.message,
          sha: params.sha,
          ...(params.branch ? { branch: params.branch } : {}),
        }),
      },
    );
  }

  static async checkToken(params: {
    clientId: string;
    clientSecret: string;
    accessToken: string;
  }): Promise<{ scopes: string[] }> {
    const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`, 'utf-8').toString('base64');
    const res = await fetch(buildUrl(`/applications/${params.clientId}/token`), {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: JSON.stringify({ access_token: params.accessToken }),
    });

    if (!res.ok) {
      const payload = await readJsonOrText(res);
      throw new AuthenticationError(messageFromPayload(payload, 'GitHub token is not valid.'));
    }

    const payload = await res.json() as { scopes?: string[] | string };
    const scopes = Array.isArray(payload.scopes)
      ? payload.scopes
      : typeof payload.scopes === 'string'
        ? payload.scopes.split(',').map((scope) => scope.trim()).filter(Boolean)
        : [];
    return { scopes };
  }

  static async revokeToken(params: {
    clientId: string;
    clientSecret: string;
    accessToken: string;
  }): Promise<void> {
    const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`, 'utf-8').toString('base64');
    const res = await fetch(buildUrl(`/applications/${params.clientId}/token`), {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: JSON.stringify({ access_token: params.accessToken }),
    });

    if (!res.ok && res.status !== 404) {
      const payload = await readJsonOrText(res);
      throw new AuthenticationError(messageFromPayload(payload, 'Failed to revoke GitHub token.'));
    }
  }
}
