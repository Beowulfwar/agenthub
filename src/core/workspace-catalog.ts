import path from 'node:path';

import type {
  ContentType,
  DeployTarget,
  DetectedLocalSkill,
  SkillsCatalog,
  WorkspaceCatalogEntry,
  WorkspaceCatalogSkill,
  WorkspaceManifest,
  WorkspaceSkillEntry,
} from './types.js';
import { detectLocalSkills } from './explorer.js';
import { WorkspaceSkillReferenceError } from './errors.js';
import { extractSkillExtensions } from './skill.js';
import { resolveManifestSkills } from './workspace.js';
import type { StorageProvider } from '../storage/provider.js';

interface ProviderSkillIndexEntry {
  name: string;
  type: ContentType;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
}

interface BuildWorkspaceCatalogParams {
  filePath: string;
  isActive: boolean;
  manifest: WorkspaceManifest | null;
  loadError?: string;
  providerIndex?: Map<string, ProviderSkillIndexEntry>;
}

export interface AdoptLocalSkillsResult {
  skills: WorkspaceSkillEntry[];
  detectedSkillCount: number;
  adoptedSkillCount: number;
  ignoredSkillNames: string[];
}

export async function loadProviderSkillIndex(
  provider: StorageProvider,
): Promise<Map<string, ProviderSkillIndexEntry>> {
  const names = await provider.list();

  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const pkg = await provider.get(name);
        const ext = extractSkillExtensions(pkg.skill);
        return [
          name,
          {
            name: pkg.skill.name,
            type: pkg.skill.type ?? 'skill',
            description: pkg.skill.description ?? null,
            category: ext.category ?? null,
            tags: ext.tags ?? [],
            fileCount: pkg.files.length,
          } satisfies ProviderSkillIndexEntry,
        ] as const;
      } catch {
        return [
          name,
          {
            name,
            type: 'skill',
            description: '(could not load)',
            category: null,
            tags: [],
            fileCount: 0,
          } satisfies ProviderSkillIndexEntry,
        ] as const;
      }
    }),
  );

  return new Map(entries);
}

export async function validateWorkspaceManifestSkills(
  manifest: WorkspaceManifest,
  provider: StorageProvider,
  options?: { filter?: string[] },
): Promise<void> {
  let resolved = resolveManifestSkills(manifest);

  if (options?.filter?.length) {
    const allowed = new Set(options.filter.map((item) => item.toLowerCase()));
    resolved = resolved.filter((skill) => allowed.has(skill.name.toLowerCase()));
  }

  const missing: string[] = [];

  for (const skill of resolved) {
    if (!(await provider.exists(skill.name))) {
      missing.push(skill.name);
    }
  }

  if (missing.length > 0) {
    throw new WorkspaceSkillReferenceError(missing);
  }
}

export async function buildWorkspaceCatalogEntry(
  params: BuildWorkspaceCatalogParams,
): Promise<WorkspaceCatalogEntry> {
  const { filePath, isActive, manifest, loadError, providerIndex } = params;
  const workspaceDir = path.dirname(filePath);
  const detectedLocalSkills = dedupeDetectedLocalSkills(await detectLocalSkills(workspaceDir));

  if (!manifest) {
    const workspaceName = lastPathSegment(workspaceDir);
    return {
      filePath,
      workspaceDir,
      workspaceName,
      isActive,
      configuredSkillCount: 0,
      detectedSkillCount: uniqueLocalSkillNames(detectedLocalSkills).size,
      configuredOnlyCount: 0,
      detectedOnlyCount: uniqueLocalSkillNames(detectedLocalSkills).size,
      missingInProviderCount: 0,
      driftCount: uniqueLocalSkillNames(detectedLocalSkills).size,
      detectedLocalSkills,
      skills: [],
      error: loadError ?? 'Workspace manifest could not be loaded.',
    };
  }

  const resolvedSkills = resolveManifestSkills(manifest);
  const configuredByName = new Map<string, DeployTarget[]>();
  const detectedByName = groupDetectedLocalSkills(detectedLocalSkills);

  for (const skill of resolvedSkills) {
    configuredByName.set(skill.name, skill.targets);
  }

  const skillNames = new Set<string>([
    ...configuredByName.keys(),
    ...detectedByName.keys(),
  ]);

  const skills = [...skillNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const configuredTargets = configuredByName.get(name) ?? [];
      const detectedEntries = detectedByName.get(name) ?? [];
      const providerSkill = providerIndex?.get(name) ?? null;
      const configured = configuredTargets.length > 0;
      const detectedLocally = detectedEntries.length > 0;
      const existsInProvider = Boolean(providerSkill);

      const status = resolveWorkspaceSkillStatus({
        configured,
        detectedLocally,
        existsInProvider,
      });

      return {
        name,
        type: providerSkill?.type ?? null,
        description: providerSkill?.description ?? null,
        category: providerSkill?.category ?? null,
        tags: providerSkill?.tags ?? [],
        fileCount: providerSkill?.fileCount ?? 0,
        configuredTargets,
        configured,
        detectedLocally,
        existsInProvider,
        status,
        detectedTools: [...new Set(detectedEntries.map((entry) => entry.tool))].sort(),
      } satisfies WorkspaceCatalogSkill;
    });

  const configuredOnlyCount = skills.filter((skill) => skill.status === 'configured_only').length;
  const detectedOnlyCount = skills.filter((skill) => skill.status === 'detected_only').length;
  const missingInProviderCount = skills.filter((skill) => skill.status === 'missing_in_provider').length;

  return {
    filePath,
    workspaceDir,
    workspaceName: manifest.name?.trim() || lastPathSegment(workspaceDir),
    isActive,
    configuredSkillCount: resolvedSkills.length,
    detectedSkillCount: uniqueLocalSkillNames(detectedLocalSkills).size,
    configuredOnlyCount,
    detectedOnlyCount,
    missingInProviderCount,
    driftCount: configuredOnlyCount + detectedOnlyCount + missingInProviderCount,
    detectedLocalSkills,
    skills,
  };
}

export async function buildSkillsCatalog(
  registry: { active?: string; paths: string[] },
  provider: StorageProvider,
  loadManifest: (filePath: string) => Promise<WorkspaceManifest>,
): Promise<SkillsCatalog> {
  const providerIndex = await loadProviderSkillIndex(provider);
  const workspaces: WorkspaceCatalogEntry[] = [];
  const invalidWorkspaces: SkillsCatalog['invalidWorkspaces'] = [];
  const configuredNames = new Set<string>();

  for (const filePath of registry.paths) {
    try {
      const manifest = await loadManifest(filePath);
      const entry = await buildWorkspaceCatalogEntry({
        filePath,
        isActive: filePath === registry.active,
        manifest,
        providerIndex,
      });

      entry.skills
        .filter((skill) => skill.configured)
        .forEach((skill) => configuredNames.add(skill.name));

      workspaces.push(entry);
    } catch (err) {
      const loadError = err instanceof Error ? err.message : String(err);
      const entry = await buildWorkspaceCatalogEntry({
        filePath,
        isActive: filePath === registry.active,
        manifest: null,
        loadError,
      });

      invalidWorkspaces.push({
        filePath,
        workspaceDir: entry.workspaceDir,
        workspaceName: entry.workspaceName,
        error: loadError,
        detectedSkillCount: entry.detectedSkillCount,
      });
    }
  }

  const unassigned = [...providerIndex.values()]
    .filter((skill) => !configuredNames.has(skill.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({
      name: skill.name,
      type: skill.type,
      description: skill.description,
      category: skill.category,
      tags: skill.tags,
      fileCount: skill.fileCount,
    }));

  return {
    providerSkillCount: providerIndex.size,
    workspaces,
    unassigned,
    invalidWorkspaces,
  };
}

export async function buildAdoptedManifestSkills(
  workspaceDir: string,
  provider: StorageProvider,
): Promise<AdoptLocalSkillsResult> {
  const detectedLocalSkills = dedupeDetectedLocalSkills(await detectLocalSkills(workspaceDir));
  const grouped = groupDetectedLocalSkills(detectedLocalSkills);
  const skills: WorkspaceSkillEntry[] = [];
  const ignoredSkillNames: string[] = [];

  for (const [name, detectedEntries] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!(await provider.exists(name))) {
      ignoredSkillNames.push(name);
      continue;
    }

    const targets = [...new Set(
      detectedEntries
        .map((entry) => entry.target)
        .filter((target): target is DeployTarget => Boolean(target)),
    )].sort();

    skills.push(
      targets.length > 0
        ? { name, targets }
        : { name },
    );
  }

  return {
    skills,
    detectedSkillCount: uniqueLocalSkillNames(detectedLocalSkills).size,
    adoptedSkillCount: skills.length,
    ignoredSkillNames,
  };
}

function resolveWorkspaceSkillStatus(params: {
  configured: boolean;
  detectedLocally: boolean;
  existsInProvider: boolean;
}): WorkspaceCatalogSkill['status'] {
  const { configured, detectedLocally, existsInProvider } = params;

  if (configured && !existsInProvider) {
    return 'missing_in_provider';
  }
  if (configured && detectedLocally) {
    return 'configured_and_detected';
  }
  if (configured) {
    return 'configured_only';
  }
  return 'detected_only';
}

function dedupeDetectedLocalSkills(entries: DetectedLocalSkill[]): DetectedLocalSkill[] {
  const map = new Map<string, DetectedLocalSkill>();

  for (const entry of entries) {
    const key = `${entry.name}::${entry.tool}::${entry.absolutePath}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.tool.localeCompare(b.tool));
}

function uniqueLocalSkillNames(entries: DetectedLocalSkill[]): Set<string> {
  return new Set(entries.map((entry) => entry.name));
}

function groupDetectedLocalSkills(entries: DetectedLocalSkill[]): Map<string, DetectedLocalSkill[]> {
  const grouped = new Map<string, DetectedLocalSkill[]>();

  for (const entry of entries) {
    const existing = grouped.get(entry.name);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(entry.name, [entry]);
    }
  }

  return grouped;
}

function lastPathSegment(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}
