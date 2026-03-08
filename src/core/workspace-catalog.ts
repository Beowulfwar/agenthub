import path from 'node:path';
import os from 'node:os';

import type {
  AgentAppCatalogItem,
  CloudSkillCatalogItem,
  CloudSkillInstallState,
  ContentType,
  DeployTarget,
  DeployTargetDirectory,
  DetectedLocalSkill,
  SkillsCatalog,
  WorkspaceAgentInventory,
  WorkspaceAgentSkill,
  WorkspaceAgentSkillStatus,
  WorkspaceCatalogEntry,
  WorkspaceCatalogSkill,
  WorkspaceManifest,
  WorkspaceSkillEntry,
} from './types.js';
import { listAgentApps } from './app-registry.js';
import { formatContentRef } from './content-ref.js';
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

interface BuildCloudSkillsCatalogParams {
  provider: StorageProvider;
  loadManifest: (filePath: string) => Promise<WorkspaceManifest>;
  workspaceFilePath?: string;
  target?: DeployTarget;
  query?: string;
  type?: ContentType;
  category?: string;
  tag?: string;
  installState?: CloudSkillInstallState;
}

interface BuildWorkspaceAgentInventoriesParams {
  workspaceDir: string;
  manifest: WorkspaceManifest | null;
  targetDirectories: DeployTargetDirectory[];
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
  const refs = typeof provider.listContentRefs === 'function'
    ? await provider.listContentRefs()
    : (await provider.list()).map((name) => {
      if (name.startsWith('prompt/')) return { type: 'prompt' as const, name: name.slice('prompt/'.length) };
      if (name.startsWith('subagent/')) return { type: 'subagent' as const, name: name.slice('subagent/'.length) };
      if (name.startsWith('skill/')) return { type: 'skill' as const, name: name.slice('skill/'.length) };
      return { type: 'skill' as const, name };
    });
  const index = new Map<string, ProviderSkillIndexEntry>();

  const entries = await Promise.all(
    refs.map(async (ref) => {
      try {
        const pkg = await provider.get(ref);
        const ext = extractSkillExtensions(pkg.skill);
        return {
          key: formatContentRef({ type: pkg.skill.type ?? ref.type, name: pkg.skill.name }),
          value: {
            name: pkg.skill.name,
            type: pkg.skill.type ?? ref.type,
            description: pkg.skill.description ?? null,
            category: ext.category ?? null,
            tags: ext.tags ?? [],
            fileCount: pkg.files.length,
          } satisfies ProviderSkillIndexEntry,
        } as const;
      } catch {
        return {
          key: formatContentRef(ref),
          value: {
            name: ref.name,
            type: ref.type,
            description: '(could not load)',
            category: null,
            tags: [],
            fileCount: 0,
          } satisfies ProviderSkillIndexEntry,
        } as const;
      }
    }),
  );

  for (const entry of entries) {
    index.set(entry.key, entry.value);
    if (entry.value.type === 'skill') {
      index.set(entry.value.name, entry.value);
    }
  }

  return index;
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
    if (!(await provider.exists({ type: skill.type, name: skill.name }))) {
      missing.push(formatContentRef(skill));
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
    const localSkillCount = uniqueLocalSkillNames(detectedLocalSkills).size;
    return {
      filePath,
      workspaceDir,
      workspaceName,
      isActive,
      configuredSkillCount: 0,
      detectedSkillCount: localSkillCount,
      configuredOnlyCount: 0,
      detectedOnlyCount: localSkillCount,
      missingInProviderCount: 0,
      driftCount: localSkillCount,
      detectedLocalSkills,
      skills: [],
      error: loadError ?? 'Workspace manifest could not be loaded.',
    };
  }

  const resolvedSkills = resolveManifestSkills(manifest);
  const configuredByName = new Map<string, DeployTarget[]>();
  const detectedByName = groupDetectedLocalSkills(detectedLocalSkills);

  for (const skill of resolvedSkills) {
    configuredByName.set(formatContentRef(skill), skill.targets);
  }

  const skillNames = new Set<string>([
    ...configuredByName.keys(),
    ...detectedByName.keys(),
  ]);

  const skills = [...skillNames]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const ref = parseWorkspaceCatalogKey(key);
      const configuredTargets = configuredByName.get(key) ?? [];
      const detectedEntries = detectedByName.get(key) ?? [];
      const providerSkill = providerIndex?.get(key) ?? providerIndex?.get(ref.name) ?? null;
      const configured = configuredTargets.length > 0;
      const detectedLocally = detectedEntries.length > 0;
      const existsInProvider = Boolean(providerSkill);

      return {
        name: ref.name,
        type: providerSkill?.type ?? ref.type ?? null,
        description: providerSkill?.description ?? null,
        category: providerSkill?.category ?? null,
        tags: providerSkill?.tags ?? [],
        fileCount: providerSkill?.fileCount ?? 0,
        configuredTargets,
        configured,
        detectedLocally,
        existsInProvider,
        status: resolveWorkspaceSkillStatus({ configured, detectedLocally, existsInProvider }),
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

export async function buildCloudSkillsCatalog(
  params: BuildCloudSkillsCatalogParams,
): Promise<SkillsCatalog> {
  const {
    provider,
    loadManifest,
    workspaceFilePath,
    target,
    query,
    type,
    category,
    tag,
    installState,
  } = params;
  const providerIndex = await loadProviderSkillIndex(provider);
  const allSkills = [...new Map(
    [...providerIndex.entries()]
      .filter(([key]) => key.includes('/'))
      .map(([key, value]) => [key, value]),
  ).values()].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });

  let workspaceName: string | null = null;
  let workspaceDir: string | null = null;
  let installedNames: Set<string> | null = null;

  if (workspaceFilePath) {
    workspaceDir = path.dirname(workspaceFilePath);
    const manifest = await loadManifest(workspaceFilePath);
    workspaceName = manifest.name?.trim() || lastPathSegment(workspaceDir);

    if (target) {
      installedNames = await detectInstalledSkillNames(workspaceDir, target);
    }
  }

  const availableFilters = {
    types: [...new Set(allSkills.map((skill) => skill.type))].sort(),
    categories: [...new Set(allSkills.map((skill) => skill.category).filter(Boolean))].sort() as string[],
    tags: [...new Set(allSkills.flatMap((skill) => skill.tags))].sort(),
    installStates: ['installed', 'not_installed', 'unknown'] as CloudSkillInstallState[],
  };

  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  const normalizedTag = tag?.trim().toLowerCase() ?? '';
  const normalizedCategory = category?.trim().toLowerCase() ?? '';

  const filteredItems = allSkills
    .map((skill) => buildCloudSkillCatalogItem(skill, installedNames))
    .filter((skill) => {
      if (normalizedQuery && !matchesCatalogQuery(skill, normalizedQuery)) {
        return false;
      }
      if (type && skill.type !== type) {
        return false;
      }
      if (normalizedCategory && (skill.category ?? '').toLowerCase() !== normalizedCategory) {
        return false;
      }
      if (normalizedTag && !skill.tags.some((entry) => entry.toLowerCase() === normalizedTag)) {
        return false;
      }
      return true;
    });

  const counts = {
    installed: filteredItems.filter((skill) => skill.installState === 'installed').length,
    not_installed: filteredItems.filter((skill) => skill.installState === 'not_installed').length,
    unknown: filteredItems.filter((skill) => skill.installState === 'unknown').length,
  } satisfies Record<CloudSkillInstallState, number>;

  const items = installState
    ? filteredItems.filter((skill) => skill.installState === installState)
    : filteredItems;

  return {
    total: items.length,
    items,
    availableFilters,
    destinationScope: {
      workspaceFilePath: workspaceFilePath ?? null,
      workspaceName,
      workspaceDir,
      target: target ?? null,
      ready: Boolean(workspaceFilePath && target),
    },
    counts,
  };
}

export async function buildWorkspaceAgentInventories(
  params: BuildWorkspaceAgentInventoriesParams,
): Promise<WorkspaceAgentInventory[]> {
  const { workspaceDir, manifest, targetDirectories, providerIndex } = params;
  const resolved = manifest ? resolveManifestSkills(manifest) : [];
  const detectedLocalSkills = dedupeDetectedLocalSkills(await detectLocalSkills(workspaceDir));
  const appCatalog = new Map(
    listAgentApps()
      .filter((app): app is AgentAppCatalogItem & { deployTarget: DeployTarget } => Boolean(app.deployTarget))
      .map((app) => [app.deployTarget, app] as const),
  );

  return targetDirectories.map((targetDirectory) => {
    const appInfo = appCatalog.get(targetDirectory.target);
    const configuredNames = new Set(
      resolved
        .filter((skill) => skill.targets.includes(targetDirectory.target))
        .map((skill) => formatContentRef(skill)),
    );
    const detectedForTarget = detectedLocalSkills.filter((skill) => skill.target === targetDirectory.target);
    const detectedByName = groupDetectedLocalSkills(detectedForTarget);
    const skillNames = new Set<string>([
      ...configuredNames,
      ...detectedByName.keys(),
    ]);

    const skills = [...skillNames]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => {
        const ref = parseWorkspaceCatalogKey(key);
        const localEntries = detectedByName.get(key) ?? [];
        const inManifest = configuredNames.has(key);
        const installedLocally = localEntries.length > 0;
        const providerSkill = providerIndex?.get(key) ?? providerIndex?.get(ref.name) ?? null;
        const existsInProvider = Boolean(providerSkill);

        return {
          name: ref.name,
          type: providerSkill?.type ?? ref.type ?? null,
          description: providerSkill?.description ?? null,
          category: providerSkill?.category ?? null,
          tags: providerSkill?.tags ?? [],
          fileCount: providerSkill?.fileCount ?? 0,
          status: resolveWorkspaceAgentSkillStatus({ inManifest, installedLocally, existsInProvider }),
          inManifest,
          installedLocally,
          existsInProvider,
          localPaths: localEntries.map((entry) => entry.absolutePath).sort(),
        } satisfies WorkspaceAgentSkill;
      });

    const counts = {
      total: skills.length,
      manifest_and_installed: skills.filter((skill) => skill.status === 'manifest_and_installed').length,
      manifest_missing_local: skills.filter((skill) => skill.status === 'manifest_missing_local').length,
      local_outside_manifest: skills.filter((skill) => skill.status === 'local_outside_manifest').length,
      missing_in_provider: skills.filter((skill) => skill.status === 'missing_in_provider').length,
    };

    return {
      target: targetDirectory.target,
      label: targetDirectory.label,
      source: targetDirectory.source,
      rootPath: targetDirectory.rootPath,
      skillPath: targetDirectory.directories.skill,
      exists: targetDirectory.exists,
      ...(appInfo
        ? {
            appId: appInfo.appId,
            canonicalPaths: resolveCatalogPaths(workspaceDir, appInfo.canonicalLocations),
            legacyPaths: resolveCatalogPaths(workspaceDir, appInfo.legacyLocations),
          }
        : {}),
      counts,
      skills,
    } satisfies WorkspaceAgentInventory;
  });
}

export async function buildAdoptedManifestSkills(
  workspaceDir: string,
  provider: StorageProvider,
): Promise<AdoptLocalSkillsResult> {
  const detectedLocalSkills = dedupeDetectedLocalSkills(await detectLocalSkills(workspaceDir));
  const grouped = groupDetectedLocalSkills(detectedLocalSkills);
  const skills: WorkspaceSkillEntry[] = [];
  const ignoredSkillNames: string[] = [];

  for (const [key, detectedEntries] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const { type, name } = parseWorkspaceCatalogKey(key);
    if (!(await provider.exists({ type, name }))) {
      ignoredSkillNames.push(key);
      continue;
    }

    const targets = [...new Set(
      detectedEntries
        .map((entry) => entry.target)
        .filter((candidate): candidate is DeployTarget => Boolean(candidate)),
    )].sort();

    skills.push(targets.length > 0 ? { type, name, targets } : { type, name });
  }

  return {
    skills,
    detectedSkillCount: uniqueLocalSkillNames(detectedLocalSkills).size,
    adoptedSkillCount: skills.length,
    ignoredSkillNames,
  };
}

function buildCloudSkillCatalogItem(
  skill: ProviderSkillIndexEntry,
  installedNames: Set<string> | null,
): CloudSkillCatalogItem {
  const contentId = formatContentRef({ type: skill.type, name: skill.name });
  return {
    name: skill.name,
    type: skill.type,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    fileCount: skill.fileCount,
    installState: installedNames
      ? (installedNames.has(contentId) ? 'installed' : 'not_installed')
      : 'unknown',
  };
}

async function detectInstalledSkillNames(
  workspaceDir: string,
  target: DeployTarget,
): Promise<Set<string>> {
  const localSkills = await detectLocalSkills(workspaceDir);
  return new Set(
    localSkills
      .filter((skill) => skill.target === target)
      .map((skill) => formatContentRef({ type: resolveDetectedSkillType(skill), name: skill.name })),
  );
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

function resolveWorkspaceAgentSkillStatus(params: {
  inManifest: boolean;
  installedLocally: boolean;
  existsInProvider: boolean;
}): WorkspaceAgentSkillStatus {
  const { inManifest, installedLocally, existsInProvider } = params;

  if (inManifest && !existsInProvider) {
    return 'missing_in_provider';
  }
  if (inManifest && installedLocally) {
    return 'manifest_and_installed';
  }
  if (inManifest) {
    return 'manifest_missing_local';
  }
  return 'local_outside_manifest';
}

function matchesCatalogQuery(
  skill: {
    name: string;
    description?: string | null;
    category?: string | null;
    tags?: string[];
  },
  query: string,
): boolean {
  const haystack = [
    skill.name,
    skill.description ?? '',
    skill.category ?? '',
    ...(skill.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query);
}

function dedupeDetectedLocalSkills(entries: DetectedLocalSkill[]): DetectedLocalSkill[] {
  const map = new Map<string, DetectedLocalSkill>();

  for (const entry of entries) {
    const key = `${resolveDetectedSkillType(entry)}::${entry.name}::${entry.tool}::${entry.absolutePath}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.tool.localeCompare(b.tool));
}

function uniqueLocalSkillNames(entries: DetectedLocalSkill[]): Set<string> {
  return new Set(entries.map((entry) => formatContentRef({ type: resolveDetectedSkillType(entry), name: entry.name })));
}

function groupDetectedLocalSkills(entries: DetectedLocalSkill[]): Map<string, DetectedLocalSkill[]> {
  const grouped = new Map<string, DetectedLocalSkill[]>();

  for (const entry of entries) {
    const key = formatContentRef({ type: resolveDetectedSkillType(entry), name: entry.name });
    const existing = grouped.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(key, [entry]);
    }
  }

  return grouped;
}

function resolveDetectedSkillType(entry: DetectedLocalSkill): ContentType {
  switch (entry.artifactKind) {
    case 'prompt_file':
      return 'prompt';
    case 'subagent_file':
      return 'subagent';
    default:
      return 'skill';
  }
}

function parseWorkspaceCatalogKey(key: string): { type: ContentType; name: string } {
  if (key.startsWith('prompt/')) {
    return { type: 'prompt', name: key.slice('prompt/'.length) };
  }
  if (key.startsWith('subagent/')) {
    return { type: 'subagent', name: key.slice('subagent/'.length) };
  }
  if (key.startsWith('skill/')) {
    return { type: 'skill', name: key.slice('skill/'.length) };
  }
  return { type: 'skill', name: key };
}

function resolveCatalogPaths(
  workspaceDir: string,
  locations: Array<{ scope: 'workspace' | 'user' | 'global'; relativePath: string }>,
): string[] {
  return [...new Set(locations.map((location) => {
    switch (location.scope) {
      case 'workspace':
        return path.join(workspaceDir, location.relativePath);
      case 'user':
        return path.join(os.homedir(), location.relativePath);
      case 'global':
        return path.resolve(location.relativePath);
    }
  }))].sort();
}

function lastPathSegment(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}
