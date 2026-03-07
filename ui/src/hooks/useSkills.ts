import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSkills,
  fetchSkillsCatalog,
  fetchSkillsDetailed,
  fetchSkill,
  updateSkill,
  deleteSkill,
  patchSkill,
  cloneSkill,
  renameSkill,
  fetchSkillInfo,
} from '../api/client';
import type { SkillPackage, PatchSkillRequest } from '../api/types';

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

export function useSkillsCatalog(query?: string) {
  return useQuery({
    queryKey: ['skills', 'catalog', query ?? ''],
    queryFn: () => fetchSkillsCatalog(query),
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
