/**
 * Workspace manifest management for agent-hub.
 *
 * A workspace manifest (`ahub.workspace.json`) declares which cloud-backed
 * contents a project needs and which deploy targets they belong to.
 *
 * Legacy version 1 manifests centered on `skills[]` are still accepted at
 * load time and normalized to the canonical version 2 shape.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ContentRef,
  DeployTarget,
  WorkspaceContentEntry,
  WorkspaceContentGroup,
  WorkspaceManifest,
} from './types.js';
import { WorkspaceNotFoundError } from './errors.js';
import { assertSafeSkillName } from './sanitize.js';

type LegacyWorkspaceSkillEntry = {
  name: string;
  targets?: DeployTarget[];
  source?: string;
};

type LegacyWorkspaceTargetGroup = {
  targets: DeployTarget[];
  skills: string[];
};

type LegacyWorkspaceManifest = {
  version: 1;
  name?: string;
  description?: string;
  defaultTargets?: DeployTarget[];
  skills?: LegacyWorkspaceSkillEntry[];
  groups?: LegacyWorkspaceTargetGroup[];
  profile?: string;
};

type RawWorkspaceManifest = WorkspaceManifest | LegacyWorkspaceManifest;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File names searched (in order) when locating a workspace manifest. */
export const WORKSPACE_FILENAMES = ['ahub.workspace.json', '.ahub.json'] as const;

const VALID_TARGETS: ReadonlySet<string> = new Set<DeployTarget>([
  'claude-code',
  'codex',
  'cursor',
]);

const VALID_CONTENT_TYPES = new Set(['skill', 'prompt', 'subagent']);

// ---------------------------------------------------------------------------
// Find manifest
// ---------------------------------------------------------------------------

export async function findWorkspaceManifest(
  startDir?: string,
): Promise<string | null> {
  let dir = path.resolve(startDir ?? process.cwd());
  const root = path.parse(dir).root;

  while (true) {
    for (const filename of WORKSPACE_FILENAMES) {
      const candidate = path.join(dir, filename);
      try {
        await readFile(candidate, 'utf-8');
        return candidate;
      } catch {
        // File does not exist at this level — try next.
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      return null;
    }
    dir = parent;
  }
}

export async function findWorkspaceManifestInDirectory(
  dir: string,
): Promise<string | null> {
  const resolvedDir = path.resolve(dir);

  for (const filename of WORKSPACE_FILENAMES) {
    const candidate = path.join(resolvedDir, filename);
    try {
      await readFile(candidate, 'utf-8');
      return candidate;
    } catch {
      // File does not exist in this directory — try next.
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Load & validate
// ---------------------------------------------------------------------------

export async function loadWorkspaceManifest(
  filePath: string,
): Promise<WorkspaceManifest> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid workspace manifest at "${filePath}": expected a JSON object.`);
  }

  return normalizeWorkspaceManifest(parsed as Record<string, unknown>, filePath);
}

export async function requireWorkspaceManifest(
  startDir?: string,
): Promise<{ manifest: WorkspaceManifest; filePath: string }> {
  const resolvedStart = startDir ?? process.cwd();
  const filePath = await findWorkspaceManifest(resolvedStart);
  if (!filePath) {
    throw new WorkspaceNotFoundError(resolvedStart);
  }
  const manifest = await loadWorkspaceManifest(filePath);
  return { manifest, filePath };
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveWorkspaceManifest(
  filePath: string,
  manifest: WorkspaceManifest,
): Promise<void> {
  const normalized = normalizeWorkspaceManifest(manifest as unknown as Record<string, unknown>, filePath);
  const content = JSON.stringify(stripLegacyManifestAliases(normalized), null, 2) + '\n';
  await writeFile(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export interface ResolvedContent extends ContentRef {
  targets: DeployTarget[];
  source?: string;
}

export type ResolvedSkill = ResolvedContent;

export function resolveManifestContents(
  manifest: WorkspaceManifest,
): ResolvedContent[] {
  const canonicalManifest = ensureCanonicalManifest(manifest);
  const fallbackTargets: DeployTarget[] = canonicalManifest.defaultTargets ?? ['claude-code'];
  const targetMap = new Map<string, ResolvedContent>();

  function addContent(
    ref: ContentRef,
    targets: DeployTarget[],
    source?: string,
  ): void {
    const normalizedTargets = [...new Set(targets)].sort();
    const key = contentKey(ref, source);
    const existing = targetMap.get(key);

    if (existing) {
      existing.targets = [...new Set([...existing.targets, ...normalizedTargets])].sort();
      return;
    }

    targetMap.set(key, {
      ...ref,
      targets: normalizedTargets,
      ...(source ? { source } : {}),
    });
  }

  for (const group of canonicalManifest.groups ?? []) {
    for (const ref of group.contents) {
      addContent(ref, group.targets);
    }
  }

  for (const entry of canonicalManifest.contents ?? []) {
    addContent(
      { type: entry.type, name: entry.name },
      entry.targets ?? fallbackTargets,
      entry.source,
    );
  }

  return [...targetMap.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });
}

export function resolveManifestSkills(
  manifest: WorkspaceManifest,
): ResolvedSkill[] {
  return resolveManifestContents(manifest);
}

export function setContentTargetsInManifest(
  manifest: WorkspaceManifest,
  ref: ContentRef,
  targets: DeployTarget[],
): WorkspaceManifest {
  assertSafeSkillName(ref.name);
  const nextManifest = cloneManifest(manifest);
  const normalizedTargets = [...new Set(targets)].sort();
  const existing = findManifestContent(nextManifest, ref);

  if (nextManifest.contents) {
    nextManifest.contents = nextManifest.contents.filter((entry) => !contentRefsEqual(entry, ref));
    if (nextManifest.contents.length === 0) {
      delete nextManifest.contents;
      delete nextManifest.skills;
    }
  }

  if (nextManifest.groups) {
    nextManifest.groups = nextManifest.groups
      .map((group) => ({
        ...group,
        contents: group.contents.filter((entry) => !contentRefsEqual(entry, ref)),
      }))
      .filter((group) => group.contents.length > 0);

    if (nextManifest.groups.length === 0) {
      delete nextManifest.groups;
    }
  }

  if (nextManifest.groups) {
    nextManifest.groups = withLegacyGroupAliases(nextManifest.groups);
  }

  if (normalizedTargets.length === 0) {
    if (nextManifest.contents) {
      nextManifest.skills = nextManifest.contents.map((entry) => ({
        ...entry,
        ...(entry.targets ? { targets: [...entry.targets] } : {}),
      }));
    }
    return nextManifest;
  }

  const nextEntry: WorkspaceContentEntry = {
    ...ref,
    targets: normalizedTargets,
    ...(existing?.source ? { source: existing.source } : {}),
  };

  nextManifest.contents = [...(nextManifest.contents ?? []), nextEntry].sort(compareContentEntry);
  nextManifest.skills = nextManifest.contents.map((entry) => ({
    ...entry,
    ...(entry.targets ? { targets: [...entry.targets] } : {}),
  }));
  return nextManifest;
}

export function setSkillTargetsInManifest(
  manifest: WorkspaceManifest,
  name: string,
  targets: DeployTarget[],
): WorkspaceManifest {
  return setContentTargetsInManifest(manifest, { type: 'skill', name }, targets);
}

export function addContentTargetToManifest(
  manifest: WorkspaceManifest,
  ref: ContentRef,
  target: DeployTarget,
): WorkspaceManifest {
  const currentTargets =
    resolveManifestContents(manifest)
      .find((entry) => contentRefsEqual(entry, ref))?.targets ?? [];
  return setContentTargetsInManifest(manifest, ref, [...currentTargets, target]);
}

export function addTargetToManifest(
  manifest: WorkspaceManifest,
  name: string,
  target: DeployTarget,
): WorkspaceManifest {
  return addContentTargetToManifest(manifest, { type: 'skill', name }, target);
}

export function removeContentTargetFromManifest(
  manifest: WorkspaceManifest,
  ref: ContentRef,
  target: DeployTarget,
): WorkspaceManifest {
  const currentTargets =
    resolveManifestContents(manifest)
      .find((entry) => contentRefsEqual(entry, ref))?.targets ?? [];
  return setContentTargetsInManifest(
    manifest,
    ref,
    currentTargets.filter((entry) => entry !== target),
  );
}

export function removeTargetFromManifest(
  manifest: WorkspaceManifest,
  name: string,
  target: DeployTarget,
): WorkspaceManifest {
  return removeContentTargetFromManifest(manifest, { type: 'skill', name }, target);
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeWorkspaceManifest(
  input: Record<string, unknown>,
  filePath?: string,
): WorkspaceManifest {
  const version = input.version;
  if (version !== 1 && version !== 2) {
    throw new Error(
      `Unsupported workspace manifest version: ${String(version)}. Expected 1 or 2.`,
    );
  }

  const name = typeof input.name === 'string' ? input.name : undefined;
  const description = typeof input.description === 'string' ? input.description : undefined;
  const profile = typeof input.profile === 'string' ? input.profile : undefined;
  const defaultTargets = normalizeTargets(
    Array.isArray(input.defaultTargets) ? input.defaultTargets : undefined,
    'default target',
  );

  if (version === 1) {
    const legacy = input as unknown as LegacyWorkspaceManifest;
    const contents = normalizeLegacyEntries(legacy.skills, filePath);
    const groups = normalizeLegacyGroups(legacy.groups, filePath);
    return {
      version: 2,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(defaultTargets ? { defaultTargets } : {}),
      ...(contents.length > 0 ? { contents, skills: contents } : {}),
      ...(groups.length > 0 ? { groups: withLegacyGroupAliases(groups) } : {}),
      ...(profile ? { profile } : {}),
    };
  }

  const contents = normalizeContentEntries(
    Array.isArray(input.contents) ? input.contents : undefined,
    filePath,
  );
  const groups = normalizeContentGroups(
    Array.isArray(input.groups) ? input.groups : undefined,
    filePath,
  );

  return {
    version: 2,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(defaultTargets ? { defaultTargets } : {}),
    ...(contents.length > 0 ? { contents, skills: contents } : {}),
    ...(groups.length > 0 ? { groups: withLegacyGroupAliases(groups) } : {}),
    ...(profile ? { profile } : {}),
  };
}

function normalizeLegacyEntries(
  entries: LegacyWorkspaceSkillEntry[] | undefined,
  filePath?: string,
): WorkspaceContentEntry[] {
  if (!entries) return [];

  return entries.map((entry, index) => {
    assertValidName(entry.name, filePath, `skills[${index}]`);
    return {
      type: 'skill' as const,
      name: entry.name,
      ...(entry.targets ? { targets: normalizeTargets(entry.targets, `skill "${entry.name}"`, filePath) } : {}),
      ...(entry.source ? { source: entry.source } : {}),
    };
  }).sort(compareContentEntry);
}

function normalizeLegacyGroups(
  groups: LegacyWorkspaceTargetGroup[] | undefined,
  filePath?: string,
): WorkspaceContentGroup[] {
  if (!groups) return [];

  return groups.map((group, groupIndex) => ({
    targets: normalizeTargets(group.targets, `group ${groupIndex}`, filePath) ?? [],
    contents: group.skills.map((name, contentIndex) => {
      assertValidName(name, filePath, `groups[${groupIndex}].skills[${contentIndex}]`);
      return { type: 'skill' as const, name };
    }).sort(compareContentRef),
  }));
}

function normalizeContentEntries(
  entries: unknown[] | undefined,
  filePath?: string,
): WorkspaceContentEntry[] {
  if (!entries) return [];

  return entries.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(errorPrefix(filePath, `contents[${index}] must be an object.`));
    }
    const record = entry as Record<string, unknown>;
    const type = normalizeContentType(record.type, filePath, `contents[${index}].type`);
    const name = normalizeContentName(record.name, filePath, `contents[${index}].name`);
    const targets = Array.isArray(record.targets)
      ? normalizeTargets(record.targets, `content "${type}/${name}"`, filePath)
      : undefined;
    const source = typeof record.source === 'string' ? record.source : undefined;

    return {
      type,
      name,
      ...(targets ? { targets } : {}),
      ...(source ? { source } : {}),
    };
  }).sort(compareContentEntry);
}

function normalizeContentGroups(
  groups: unknown[] | undefined,
  filePath?: string,
): WorkspaceContentGroup[] {
  if (!groups) return [];

  return groups.map((group, groupIndex) => {
    if (typeof group !== 'object' || group === null) {
      throw new Error(errorPrefix(filePath, `groups[${groupIndex}] must be an object.`));
    }
    const record = group as Record<string, unknown>;
    const targets = normalizeTargets(
      Array.isArray(record.targets) ? record.targets : undefined,
      `group ${groupIndex}`,
      filePath,
    ) ?? [];
    const contentsValue = record.contents;
    if (!Array.isArray(contentsValue)) {
      throw new Error(errorPrefix(filePath, `groups[${groupIndex}].contents must be an array.`));
    }

    return {
      targets,
      contents: contentsValue.map((item, contentIndex) => {
        if (typeof item !== 'object' || item === null) {
          throw new Error(errorPrefix(filePath, `groups[${groupIndex}].contents[${contentIndex}] must be an object.`));
        }
        const ref = item as Record<string, unknown>;
        const type = normalizeContentType(ref.type, filePath, `groups[${groupIndex}].contents[${contentIndex}].type`);
        const name = normalizeContentName(ref.name, filePath, `groups[${groupIndex}].contents[${contentIndex}].name`);
        return { type, name };
      }).sort(compareContentRef),
    };
  });
}

function normalizeTargets(
  targets: unknown[] | undefined,
  context: string,
  filePath?: string,
): DeployTarget[] | undefined {
  if (!targets) return undefined;

  return targets.map((value) => {
    if (typeof value !== 'string' || !VALID_TARGETS.has(value)) {
      const label = context === 'default target'
        ? `Invalid default target "${String(value)}" in workspace manifest.`
        : `Invalid target "${String(value)}" in ${context}.`;
      throw new Error(errorPrefix(filePath, label));
    }
    return value as DeployTarget;
  });
}

function normalizeContentType(
  value: unknown,
  filePath: string | undefined,
  context: string,
): 'skill' | 'prompt' | 'subagent' {
  if (typeof value !== 'string' || !VALID_CONTENT_TYPES.has(value)) {
    throw new Error(errorPrefix(filePath, `Invalid content type "${String(value)}" in ${context}.`));
  }
  return value as 'skill' | 'prompt' | 'subagent';
}

function normalizeContentName(
  value: unknown,
  filePath: string | undefined,
  context: string,
): string {
  if (typeof value !== 'string') {
    throw new Error(errorPrefix(filePath, `Invalid content name "${String(value)}" in ${context}.`));
  }
  assertValidName(value, filePath, context);
  return value;
}

function assertValidName(name: string, filePath?: string, context?: string): void {
  try {
    assertSafeSkillName(name);
  } catch (err) {
    const message = context
      ? `${context} has invalid name "${name}".`
      : `Invalid content name "${name}".`;
    throw new Error(errorPrefix(filePath, message), { cause: err });
  }
}

function cloneManifest(manifest: WorkspaceManifest): WorkspaceManifest {
  const normalized = ensureCanonicalManifest(manifest);
  return {
    version: 2,
    ...(normalized.name ? { name: normalized.name } : {}),
    ...(normalized.description ? { description: normalized.description } : {}),
    ...(normalized.defaultTargets ? { defaultTargets: [...normalized.defaultTargets] } : {}),
    ...(normalized.contents
      ? {
          contents: normalized.contents.map((entry) => ({
            ...entry,
            ...(entry.targets ? { targets: [...entry.targets] } : {}),
          })),
          skills: normalized.contents.map((entry) => ({
            ...entry,
            ...(entry.targets ? { targets: [...entry.targets] } : {}),
          })),
        }
      : {}),
    ...(normalized.groups
      ? {
          groups: withLegacyGroupAliases(normalized.groups.map((group) => ({
            targets: [...group.targets],
            contents: group.contents.map((entry) => ({ ...entry })),
          }))),
        }
      : {}),
    ...(normalized.profile ? { profile: normalized.profile } : {}),
  };
}

function withLegacyGroupAliases(groups: WorkspaceContentGroup[]): WorkspaceContentGroup[] {
  return groups.map((group) => ({
    ...group,
    skills: group.contents.map((entry) => entry.name),
  }));
}

function stripLegacyManifestAliases(manifest: WorkspaceManifest): WorkspaceManifest {
  return {
    version: 2,
    ...(manifest.name ? { name: manifest.name } : {}),
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.defaultTargets ? { defaultTargets: [...manifest.defaultTargets] } : {}),
    ...(manifest.contents
      ? {
          contents: manifest.contents.map((entry) => ({
            type: entry.type,
            name: entry.name,
            ...(entry.targets ? { targets: [...entry.targets] } : {}),
            ...(entry.source ? { source: entry.source } : {}),
          })),
        }
      : {}),
    ...(manifest.groups
      ? {
          groups: manifest.groups.map((group) => ({
            targets: [...group.targets],
            contents: group.contents.map((entry) => ({ ...entry })),
          })),
        }
      : {}),
    ...(manifest.profile ? { profile: manifest.profile } : {}),
  };
}

function compareContentRef(a: ContentRef, b: ContentRef): number {
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.name.localeCompare(b.name);
}

function compareContentEntry(a: WorkspaceContentEntry, b: WorkspaceContentEntry): number {
  return compareContentRef(a, b);
}

function contentRefsEqual(a: ContentRef, b: ContentRef): boolean {
  return a.type === b.type && a.name === b.name;
}

function contentKey(ref: ContentRef, source?: string): string {
  return `${source ?? ''}::${ref.type}::${ref.name}`;
}

function findManifestContent(
  manifest: WorkspaceManifest,
  ref: ContentRef,
): WorkspaceContentEntry | null {
  return manifest.contents?.find((entry) => contentRefsEqual(entry, ref)) ?? null;
}

function errorPrefix(filePath: string | undefined, message: string): string {
  return filePath
    ? `Invalid workspace manifest at "${filePath}": ${message}`
    : message;
}

function ensureCanonicalManifest(manifest: WorkspaceManifest): WorkspaceManifest {
  if ((manifest as WorkspaceManifest).version === 2 && manifest.contents && manifest.groups?.every((group) => Array.isArray(group.contents))) {
    return manifest;
  }

  return normalizeWorkspaceManifest(manifest as unknown as Record<string, unknown>);
}
