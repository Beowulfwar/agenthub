import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  bootstrapGitHubRepository,
  disconnectGitHub,
  fetchGitHubSyncPreview,
  fetchProviders,
  runGitHubSync,
  startGitHubOAuth,
} from '../api/client';
import type { GitHubRepoVisibility } from '../api/types';

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: fetchProviders,
  });
}

function invalidateProviderQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['providers'] });
  queryClient.invalidateQueries({ queryKey: ['health'] });
  queryClient.invalidateQueries({ queryKey: ['config'] });
  queryClient.invalidateQueries({ queryKey: ['skills'] });
}

export function useStartGitHubOAuth() {
  return useMutation({
    mutationFn: ({ repoName, visibility }: { repoName?: string; visibility?: GitHubRepoVisibility }) =>
      startGitHubOAuth({
        repoName,
        visibility,
        uiOrigin: window.location.origin,
      }),
  });
}

export function useDisconnectGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectGitHub,
    onSuccess: () => {
      invalidateProviderQueries(queryClient);
    },
  });
}

export function useBootstrapGitHubRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bootstrapGitHubRepository,
    onSuccess: () => {
      invalidateProviderQueries(queryClient);
    },
  });
}

export function useGitHubSyncPreview(enabled: boolean) {
  return useQuery({
    queryKey: ['providers', 'github', 'sync-preview'],
    queryFn: fetchGitHubSyncPreview,
    enabled,
  });
}

export function useRunGitHubSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runGitHubSync,
    onSuccess: () => {
      invalidateProviderQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['providers', 'github', 'sync-preview'] });
    },
  });
}

export function useRefreshProviders() {
  const queryClient = useQueryClient();
  return () => invalidateProviderQueries(queryClient);
}
