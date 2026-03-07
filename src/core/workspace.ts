/**
 * Workspace manifest management for agent-hub.
 *
 * A workspace manifest (`ahub.workspace.json`) declares which skills
 * a project needs and which deploy targets they belong to.  The sync
 * engine reads this manifest to perform one-command environment setup.
 *
 * The manifest is searched by walking up from the current directory,
 * similar to how `.gitignore` or `tsconfig.json` are resolved.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DeployTarget,
  WorkspaceManifest,
  WorkspaceSkillEntry,
  WorkspaceTargetGroup,
} from './types.js';
import { WorkspaceNotFoundError } from './errors.js';
import { assertSafeSkillName } from './sanitize.js';

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

// ---------------------------------------------------------------------------
// Find manifest
// ---------------------------------------------------------------------------

/**
 * Walk up from `startDir` (default: `process.cwd()`) looking for a
 * workspace manifest file.
 *
 * @returns The absolute path to the manifest, or `null` if none found.
 */
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

/**
 * Look for a workspace manifest only inside the provided directory.
 *
 * Unlike `findWorkspaceManifest()`, this does not walk parent directories.
 */
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

/**
 * Load and validate a workspace manifest from a specific file path.
 *
 * @throws {Error} when the file cannot be read or parsed.
 * @throws {Error} when validation fails (version, targets, skill names).
 */
export async function loadWorkspaceManifest(
  filePath: string,
): Promise<WorkspaceManifest> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid workspace manifest at "${filePath}": expected a JSON object.`);
  }

  const manifest = parsed as Record<string, unknown>;

  // Version check.
  if (manifest.version !== 1) {
    throw new Error(
      `Unsupported workspace manifest version: ${String(manifest.version)}. Expected 1.`,
    );
  }

  const result = manifest as unknown as WorkspaceManifest;

  // Validate default targets.
  if (result.defaultTargets) {
    for (const t of result.defaultTargets) {
      if (!VALID_TARGETS.has(t)) {
        throw new Error(`Invalid default target "${t}" in workspace manifest.`);
      }
    }
  }

  // Validate flat skills entries.
  if (result.skills) {
    for (const entry of result.skills) {
      assertSafeSkillName(entry.name);
      if (entry.targets) {
        for (const t of entry.targets) {
          if (!VALID_TARGETS.has(t)) {
            throw new Error(`Invalid target "${t}" for skill "${entry.name}" in workspace manifest.`);
          }
        }
      }
    }
  }

  // Validate grouped entries.
  if (result.groups) {
    for (const group of result.groups) {
      for (const t of group.targets) {
        if (!VALID_TARGETS.has(t)) {
          throw new Error(`Invalid target "${t}" in workspace manifest group.`);
        }
      }
      for (const name of group.skills) {
        assertSafeSkillName(name);
      }
    }
  }

  return result;
}

/**
 * Load the workspace manifest from the current directory (or upward),
 * throwing `WorkspaceNotFoundError` if none exists.
 */
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

/**
 * Persist a workspace manifest to disk.
 */
export async function saveWorkspaceManifest(
  filePath: string,
  manifest: WorkspaceManifest,
): Promise<void> {
  const content = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

/** A resolved skill with its final set of deploy targets. */
export interface ResolvedSkill {
  name: string;
  targets: DeployTarget[];
}

/**
 * Resolve a workspace manifest into a flat, deduplicated list of
 * `{ name, targets[] }` entries ready for the sync engine.
 *
 * Resolution rules:
 *   1. `groups[]` pairs each skill with the group's targets.
 *   2. `skills[]` uses `entry.targets ?? manifest.defaultTargets ?? ['claude-code']`.
 *   3. If a skill appears in both `groups` and `skills`, targets are merged.
 */
export function resolveManifestSkills(
  manifest: WorkspaceManifest,
): ResolvedSkill[] {
  const fallbackTargets: DeployTarget[] = manifest.defaultTargets ?? ['claude-code'];

  // Accumulate targets per skill name.
  const targetMap = new Map<string, Set<DeployTarget>>();

  function addSkill(name: string, targets: DeployTarget[]): void {
    const existing = targetMap.get(name);
    if (existing) {
      for (const t of targets) existing.add(t);
    } else {
      targetMap.set(name, new Set(targets));
    }
  }

  // Process groups.
  if (manifest.groups) {
    for (const group of manifest.groups) {
      for (const name of group.skills) {
        addSkill(name, group.targets);
      }
    }
  }

  // Process flat skills.
  if (manifest.skills) {
    for (const entry of manifest.skills) {
      const targets = entry.targets ?? fallbackTargets;
      addSkill(entry.name, targets);
    }
  }

  // Convert to sorted array.
  const result: ResolvedSkill[] = [];
  for (const [name, targets] of targetMap) {
    result.push({ name, targets: [...targets].sort() });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function cloneManifest(manifest: WorkspaceManifest): WorkspaceManifest {
  return {
    ...manifest,
    ...(manifest.defaultTargets ? { defaultTargets: [...manifest.defaultTargets] } : {}),
    ...(manifest.skills
      ? {
          skills: manifest.skills.map((entry) => ({
            ...entry,
            ...(entry.targets ? { targets: [...entry.targets] } : {}),
          })),
        }
      : {}),
    ...(manifest.groups
      ? {
          groups: manifest.groups.map((group) => ({
            targets: [...group.targets],
            skills: [...group.skills],
          })),
        }
      : {}),
  };
}

export function setSkillTargetsInManifest(
  manifest: WorkspaceManifest,
  name: string,
  targets: DeployTarget[],
): WorkspaceManifest {
  assertSafeSkillName(name);
  const nextManifest = cloneManifest(manifest);
  const normalizedTargets = [...new Set(targets)].sort();

  if (nextManifest.skills) {
    nextManifest.skills = nextManifest.skills.filter((entry) => entry.name !== name);
    if (nextManifest.skills.length === 0) {
      delete nextManifest.skills;
    }
  }

  if (nextManifest.groups) {
    nextManifest.groups = nextManifest.groups
      .map((group) => ({
        ...group,
        skills: group.skills.filter((skillName) => skillName !== name),
      }))
      .filter((group) => group.skills.length > 0);

    if (nextManifest.groups.length === 0) {
      delete nextManifest.groups;
    }
  }

  if (normalizedTargets.length === 0) {
    return nextManifest;
  }

  const nextEntry: WorkspaceSkillEntry = { name, targets: normalizedTargets };
  nextManifest.skills = [...(nextManifest.skills ?? []), nextEntry].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return nextManifest;
}

export function addTargetToManifest(
  manifest: WorkspaceManifest,
  name: string,
  target: DeployTarget,
): WorkspaceManifest {
  const currentTargets =
    resolveManifestSkills(manifest).find((entry) => entry.name === name)?.targets ?? [];
  return setSkillTargetsInManifest(manifest, name, [...currentTargets, target]);
}

export function removeTargetFromManifest(
  manifest: WorkspaceManifest,
  name: string,
  target: DeployTarget,
): WorkspaceManifest {
  const currentTargets =
    resolveManifestSkills(manifest).find((entry) => entry.name === name)?.targets ?? [];
  return setSkillTargetsInManifest(
    manifest,
    name,
    currentTargets.filter((entry) => entry !== target),
  );
}
