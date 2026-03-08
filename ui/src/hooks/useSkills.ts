import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cloneContent,
  fetchSkills,
  fetchSkillsCatalog,
  fetchSkillsHub,
  fetchSkillsHubDiff,
  fetchSkillsHubWorkspace,
  fetchSkillsDetailed,
  fetchContent,
  fetchContentInfo,
  fetchSkill,
  fetchWorkspaceRuleContent,
  downloadSkillsToWorkspace,
  deleteContent,
  transferSkillsBetweenWorkspaces,
  patchContent,
  renameContent,
  saveWorkspaceRuleContent,
  updateSkill,
  uploadSkillsToCloud,
  deleteSkill,
  patchSkill,
  cloneSkill,
  renameSkill,
  fetchSkillInfo,
  updateContent,
  deleteWorkspaceRuleContent,
} from '../api/client';
import type { AgentAppId, CloudSkillInstallState, ContentRef, ContentType, DeployTarget, PatchSkillRequest, SkillPackage } from '../api/types';

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
  type?: ContentType;
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
  type?: ContentType;
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
  type?: ContentType;
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

export function useContent(ref?: ContentRef | null) {
  return useQuery({
    queryKey: ['skills', 'detail', ref?.type ?? '', ref?.name ?? ''],
    queryFn: () => fetchContent(ref!),
    enabled: Boolean(ref?.name && ref?.type),
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

export function useUpdateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, pkg }: { ref: ContentRef; pkg: SkillPackage }) =>
      updateContent(ref, pkg),
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

export function useDeleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: ContentRef) => deleteContent(ref),
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

export function usePatchContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, patch }: { ref: ContentRef; patch: PatchSkillRequest }) =>
      patchContent(ref, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['skillInfo', variables.ref.type, variables.ref.name] });
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

export function useCloneContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, newName }: { ref: ContentRef; newName: string }) =>
      cloneContent(ref, { newName }),
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

export function useRenameContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, newName }: { ref: ContentRef; newName: string }) =>
      renameContent(ref, { newName }),
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

export function useContentInfo(ref?: ContentRef | null) {
  return useQuery({
    queryKey: ['skillInfo', ref?.type ?? '', ref?.name ?? ''],
    queryFn: () => fetchContentInfo(ref!),
    enabled: Boolean(ref?.name && ref?.type),
  });
}

export function useSkillsHubDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      filePath: string;
      target: DeployTarget;
      skills: string[];
      contents?: ContentRef[];
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
      contents?: ContentRef[];
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
      contents?: ContentRef[];
      mode: 'copy' | 'move';
    }) => transferSkillsBetweenWorkspaces(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}

export function useWorkspaceRuleContent(params?: {
  filePath: string;
  appId: AgentAppId;
  name: string;
  detectedPath?: string;
} | null) {
  return useQuery({
    queryKey: ['skills', 'hub', 'rule-content', params ?? null],
    queryFn: () => fetchWorkspaceRuleContent(params!),
    enabled: Boolean(params?.filePath && params?.appId && params?.name),
  });
}

export function useSaveWorkspaceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      filePath: string;
      appId: AgentAppId;
      name: string;
      content: string;
      detectedPath?: string;
    }) => saveWorkspaceRuleContent(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}

export function useDeleteWorkspaceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      filePath: string;
      appId: AgentAppId;
      name: string;
      detectedPath?: string;
    }) => deleteWorkspaceRuleContent(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}
