import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWorkspace,
  saveWorkspace,
  fetchWorkspaceRegistry,
  fetchWorkspaceSuggestions,
  registerWorkspaceApi,
  unregisterWorkspaceApi,
  setActiveWorkspaceApi,
} from '../api/client';
import type { WorkspaceManifest } from '../api/types';

// ---------------------------------------------------------------------------
// Active workspace
// ---------------------------------------------------------------------------

export function useWorkspace(path?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['workspace', path ?? 'active'],
    queryFn: () => fetchWorkspace(path ?? undefined),
    enabled: options?.enabled ?? true,
  });
}

export function useSaveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filePath, manifest }: { filePath: string; manifest: WorkspaceManifest }) =>
      saveWorkspace(filePath, manifest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Workspace registry (multi-workspace)
// ---------------------------------------------------------------------------

export function useWorkspaceRegistry() {
  return useQuery({
    queryKey: ['workspace-registry'],
    queryFn: () => fetchWorkspaceRegistry(),
  });
}

export function useWorkspaceSuggestions() {
  return useQuery({
    queryKey: ['workspace-suggestions'],
    queryFn: () => fetchWorkspaceSuggestions(),
  });
}

export function useRegisterWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      filePath?: string;
      directory?: string;
      create?: boolean;
      name?: string;
    }) => registerWorkspaceApi(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-suggestions'] });
    },
  });
}

export function useUnregisterWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) => unregisterWorkspaceApi(filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-suggestions'] });
    },
  });
}

export function useSetActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) => setActiveWorkspaceApi(filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
    },
  });
}
