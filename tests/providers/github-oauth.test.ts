import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/secrets/keychain.js', () => ({
  KEYCHAIN_SERVICE: 'agent-hub',
  githubTokenAccountKey: (accountId: string) => `github:${accountId}`,
  setSecret: vi.fn(),
}));

import { AuthenticationError } from '../../src/core/errors.js';
import { KEYCHAIN_SERVICE, setSecret } from '../../src/core/secrets/keychain.js';
import { GitHubApiClient } from '../../src/providers/github/github-api-client.js';
import { GitHubOAuthService } from '../../src/providers/github/github-oauth-service.js';

describe('GitHubOAuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('builds an authorization URL with state, redirect URI, scope and PKCE challenge', () => {
    const service = new GitHubOAuthService('client-id', 'client-secret');

    const { authorizationUrl, callbackOrigin } = service.start({
      serverOrigin: 'http://127.0.0.1:3837',
      uiOrigin: 'http://localhost:5173',
      repoName: 'agent-hub',
      visibility: 'private',
    });

    const url = new URL(authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(callbackOrigin).toBe('http://127.0.0.1:3837');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3837/api/providers/github/oauth/callback');
    expect(url.searchParams.get('scope')).toBe('repo');
    expect(url.searchParams.get('allow_signup')).toBe('true');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('rejects callback completion when state is unknown or expired', async () => {
    const service = new GitHubOAuthService('client-id', 'client-secret');

    await expect(service.complete({ state: 'missing-state', code: 'abc123' }))
      .rejects.toThrow(AuthenticationError);
  });

  it('exchanges the code, loads the user and stores the token in the secure store', async () => {
    const service = new GitHubOAuthService('client-id', 'client-secret');
    const exchangeSpy = vi.spyOn(GitHubApiClient, 'exchangeCode').mockResolvedValue({
      accessToken: 'access-token',
      tokenType: 'bearer',
      scope: 'repo',
    });
    const userSpy = vi.spyOn(GitHubApiClient.prototype, 'getAuthenticatedUser').mockResolvedValue({
      id: 42,
      login: 'jesse',
      html_url: 'https://github.com/jesse',
    });

    const { authorizationUrl } = service.start({
      serverOrigin: 'http://127.0.0.1:3837',
      uiOrigin: 'http://localhost:5173',
      repoName: 'agent-hub',
      visibility: 'private',
    });
    const state = new URL(authorizationUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const result = await service.complete({ state: state!, code: 'oauth-code' });

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(userSpy).toHaveBeenCalledTimes(1);
    expect(setSecret).toHaveBeenCalledWith(KEYCHAIN_SERVICE, 'github:42', 'access-token');
    expect(result.user.login).toBe('jesse');
    expect(result.scopes).toEqual(['repo']);
    expect(result.transaction.repoName).toBe('agent-hub');
  });
});
