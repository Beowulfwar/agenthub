import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSkills,
  fetchSkillsCatalog,
  fetchSkillsHub,
  fetchSkillsHubDiff,
  fetchSkillsHubWorkspace,
  fetchSkillsDetailed,
  fetchSkill,
  downloadSkillsToWorkspace,
  transferSkillsBetweenWorkspaces,
  updateSkill,
  uploadSkillsToCloud,
  deleteSkill,
  patchSkill,
  cloneSkill,
  renameSkill,
  fetchSkillInfo,
} from '../api/client';
import type { CloudSkillInstallState, DeployTarget, PatchSkillRequest, SkillPackage } from '../api/types';

export function useSkillsList(query?: string) {
  return useQuery({
    queryKey: ['skills', 'list', query ?? ''],
    queryFn: () => fetchSkills(query),
  });
}

export function useSkillsDetailed(query?: string) {
  return useQuery({
    queryKey: ['skills', 'detailed', query ?? ''],
    queryFn: () => fetchSkillsDetailed(query),
  });
}

export function useSkillsCatalog(filters?: {
  q?: string;
  workspaceFilePath?: string;
  target?: DeployTarget;
  type?: 'skill' | 'prompt' | 'subagent';
  category?: string;
  tag?: string;
  installState?: CloudSkillInstallState;
}) {
  return useQuery({
    queryKey: ['skills', 'catalog', filters ?? {}],
    queryFn: () => fetchSkillsCatalog(filters),
  });
}

export function useSkillsHub(filters?: {
  q?: string;
  type?: 'skill' | 'prompt' | 'subagent';
  category?: string;
  tag?: string;
}) {
  return useQuery({
    queryKey: ['skills', 'hub', filters ?? {}],
    queryFn: () => fetchSkillsHub(filters),
  });
}

export function useSkillsHubWorkspace(filePath?: string | null) {
  return useQuery({
    queryKey: ['skills', 'hub', 'workspace', filePath ?? ''],
    queryFn: () => fetchSkillsHubWorkspace(filePath ?? ''),
    enabled: Boolean(filePath),
  });
}

export function useSkillsHubDiff(params?: {
  filePath: string;
  target: DeployTarget;
  name: string;
}) {
  return useQuery({
    queryKey: ['skills', 'hub', 'diff', params ?? null],
    queryFn: () => fetchSkillsHubDiff(params!),
    enabled: Boolean(params?.filePath && params?.target && params?.name),
  });
}

export function useSkill(name: string) {
  return useQuery({
    queryKey: ['skills', 'detail', name],
    queryFn: () => fetchSkill(name),
    enabled: !!name,
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, pkg }: { name: string; pkg: SkillPackage }) =>
      updateSkill(name, pkg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteSkill(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function usePatchSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: PatchSkillRequest }) =>
      patchSkill(name, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['skillInfo', variables.name] });
    },
  });
}

export function useCloneSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      cloneSkill(name, { newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useRenameSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) =>
      renameSkill(name, { newName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
    },
  });
}

export function useSkillInfo(name: string) {
  return useQuery({
    queryKey: ['skillInfo', name],
    queryFn: () => fetchSkillInfo(name),
    enabled: !!name,
  });
}

export function useSkillsHubDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      filePath: string;
      target: DeployTarget;
      skills: string[];
    }) => downloadSkillsToWorkspace(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}

export function useSkillsHubUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      filePath: string;
      target: DeployTarget;
      skills: string[];
      force?: boolean;
    }) => uploadSkillsToCloud(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}

export function useSkillsHubTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sourceWorkspaceFilePath: string;
      sourceTarget: DeployTarget;
      destinationWorkspaceFilePath: string;
      destinationTarget: DeployTarget;
      skills: string[];
      mode: 'copy' | 'move';
    }) => transferSkillsBetweenWorkspaces(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}
