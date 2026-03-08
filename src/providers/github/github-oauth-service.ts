import { createHash, randomBytes } from 'node:crypto';

import type { GitHubRepoVisibility } from '../../core/types.js';
import { AuthenticationError } from '../../core/errors.js';
import { KEYCHAIN_SERVICE, githubTokenAccountKey, setSecret } from '../../core/secrets/keychain.js';
import { GitHubApiClient, type GitHubAuthenticatedUser } from './github-api-client.js';

const OAUTH_SCOPE = 'repo';
const TEN_MINUTES_MS = 10 * 60 * 1000;

export interface GitHubOAuthTransaction {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  repoName: string;
  visibility: GitHubRepoVisibility;
  createdAt: number;
  uiOrigin: string;
}

export interface GitHubOAuthCompletion {
  user: GitHubAuthenticatedUser;
  accessToken: string;
  scopes: string[];
  transaction: GitHubOAuthTransaction;
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createCodeVerifier(): string {
  return base64url(randomBytes(32));
}

function createCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export class GitHubOAuthService {
  private readonly transactions = new Map<string, GitHubOAuthTransaction>();

  constructor(
    private readonly clientId = process.env.GITHUB_OAUTH_CLIENT_ID,
    private readonly clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET,
  ) {}

  ensureConfigured(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new AuthenticationError(
        'GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET.',
      );
    }
  }

  buildRedirectUri(serverOrigin: string): string {
    return `${serverOrigin.replace(/\/$/, '')}/api/providers/github/oauth/callback`;
  }

  start(params: {
    serverOrigin: string;
    uiOrigin: string;
    repoName: string;
    visibility: GitHubRepoVisibility;
  }): { authorizationUrl: string; callbackOrigin: string } {
    this.ensureConfigured();

    const state = base64url(randomBytes(24));
    const codeVerifier = createCodeVerifier();
    const redirectUri = this.buildRedirectUri(params.serverOrigin);
    const transaction: GitHubOAuthTransaction = {
      state,
      codeVerifier,
      redirectUri,
      repoName: params.repoName,
      visibility: params.visibility,
      createdAt: Date.now(),
      uiOrigin: params.uiOrigin,
    };

    this.transactions.set(state, transaction);
    this.evictExpiredTransactions();

    const authorizationUrl = GitHubApiClient.buildAuthorizationUrl({
      clientId: this.clientId!,
      redirectUri,
      scope: OAUTH_SCOPE,
      state,
      allowSignup: true,
      codeChallenge: createCodeChallenge(codeVerifier),
      codeChallengeMethod: 'S256',
    });

    return {
      authorizationUrl,
      callbackOrigin: new URL(redirectUri).origin,
    };
  }

  private evictExpiredTransactions(): void {
    const now = Date.now();
    for (const [state, tx] of this.transactions.entries()) {
      if (now - tx.createdAt > TEN_MINUTES_MS) {
        this.transactions.delete(state);
      }
    }
  }

  peek(state: string): GitHubOAuthTransaction | null {
    this.evictExpiredTransactions();
    return this.transactions.get(state) ?? null;
  }

  async complete(params: { state: string; code: string }): Promise<GitHubOAuthCompletion> {
    this.ensureConfigured();
    this.evictExpiredTransactions();

    const transaction = this.transactions.get(params.state);
    if (!transaction) {
      throw new AuthenticationError('GitHub OAuth state is invalid or has expired.');
    }

    this.transactions.delete(params.state);

    const token = await GitHubApiClient.exchangeCode({
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      code: params.code,
      redirectUri: transaction.redirectUri,
      codeVerifier: transaction.codeVerifier,
    });

    const client = new GitHubApiClient(token.accessToken);
    const user = await client.getAuthenticatedUser();
    await setSecret(KEYCHAIN_SERVICE, githubTokenAccountKey(String(user.id)), token.accessToken);

    return {
      user,
      accessToken: token.accessToken,
      scopes: token.scope.split(',').map((scope) => scope.trim()).filter(Boolean),
      transaction,
    };
  }

  async validateToken(accessToken: string): Promise<{ scopes: string[] }> {
    this.ensureConfigured();
    return GitHubApiClient.checkToken({
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      accessToken,
    });
  }

  async revokeToken(accessToken: string): Promise<void> {
    this.ensureConfigured();
    await GitHubApiClient.revokeToken({
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      accessToken,
    });
  }
}
