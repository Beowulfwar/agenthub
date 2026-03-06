import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchWorkspace,
  saveWorkspace,
  fetchWorkspaceRegistry,
  registerWorkspaceApi,
  unregisterWorkspaceApi,
  setActiveWorkspaceApi,
} from '../api/client';
import type { WorkspaceManifest } from '../api/types';

// ---------------------------------------------------------------------------
// Active workspace
// ---------------------------------------------------------------------------

export function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => fetchWorkspace(),
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

export function useRegisterWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filePath, create }: { filePath: string; create?: boolean }) =>
      registerWorkspaceApi(filePath, create),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
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
