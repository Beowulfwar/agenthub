/**
 * Skill parsing, serialization, validation, and package I/O.
 *
 * The canonical on-disk format is a directory containing at minimum
 * a `SKILL.md` file with YAML frontmatter:
 *
 * ```
 * ---
 * name: "skill-name"
 * description: "Description here"
 * ---
 *
 * # Title
 * Content here...
 * ```
 *
 * Optional companion subdirectories: `agents/`, `scripts/`, `references/`.
 */

import matter from 'gray-matter';
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ContentType, DeployTarget, Skill, SkillFile, SkillFrontmatterExtensions, SkillMetadata, SkillPackage } from './types.js';
import { ALL_MARKER_FILES, CONTENT_TYPE_CONFIG, MARKER_TO_TYPE } from './types.js';
import { SkillNotFoundError, SkillValidationError } from './errors.js';
import { assertSafeRelativePath, assertSafeSkillName } from './sanitize.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default marker filename (backward compat). */
const DEFAULT_MARKER = 'SKILL.md';

/** Valid content type strings for frontmatter validation. */
const VALID_CONTENT_TYPES = new Set<string>(['skill', 'prompt', 'subagent']);

// ---------------------------------------------------------------------------
// Parsing & Serialization
// ---------------------------------------------------------------------------

/**
 * Parse a raw SKILL.md string into a `Skill` object.
 *
 * Frontmatter fields `name` and `description` are promoted to
 * first-class properties; everything else lands in `metadata`.
 *
 * @param content - Full text content of a SKILL.md file.
 * @returns A `Skill` with separated frontmatter and body.
 */
export function parseSkill(content: string): Skill {
  const { data, content: body } = matter(content);

  const name: string = typeof data.name === 'string' ? data.name : '';
  const description: string =
    typeof data.description === 'string' ? data.description : '';

  // Extract content type from frontmatter (defaults to undefined → treated as 'skill').
  const type: ContentType | undefined =
    typeof data.type === 'string' && VALID_CONTENT_TYPES.has(data.type)
      ? (data.type as ContentType)
      : undefined;

  // Build metadata from remaining frontmatter keys.
  const { name: _n, description: _d, type: _t, ...rest } = data;
  const metadata: SkillMetadata = rest;

  return {
    name,
    type,
    description,
    body: body.trim(),
    metadata,
  };
}

/**
 * Serialize a `Skill` back into the SKILL.md string format
 * (YAML frontmatter + markdown body).
 *
 * @param skill - The skill to serialize.
 * @returns A string suitable for writing to SKILL.md.
 */
export function serializeSkill(skill: Skill): string {
  const frontmatter: Record<string, unknown> = {
    name: skill.name,
    description: skill.description,
    ...skill.metadata,
  };

  // Only emit type when it differs from the default 'skill' to keep
  // existing files identical on round-trip.
  if (skill.type && skill.type !== 'skill') {
    frontmatter.type = skill.type;
  }

  // gray-matter.stringify prepends frontmatter fences around `data`
  // and appends the content string.
  return matter.stringify(`\n${skill.body}\n`, frontmatter);
}

/**
 * Validate that a `Skill` has all required fields.
 *
 * @param skill - The skill object to check.
 * @throws {SkillValidationError} when one or more required fields are
 *   missing or empty.
 */
export function validateSkill(skill: Skill): void {
  const violations: string[] = [];

  if (!skill.name || skill.name.trim().length === 0) {
    violations.push('Field "name" is required and must be non-empty.');
  }

  if (!skill.description || skill.description.trim().length === 0) {
    violations.push('Field "description" is required and must be non-empty.');
  }

  if (violations.length > 0) {
    throw new SkillValidationError(violations);
  }
}

// ---------------------------------------------------------------------------
// Content-type helpers
// ---------------------------------------------------------------------------

/**
 * Detect the content type of a directory by checking which marker file exists.
 * Tries SKILL.md, PROMPT.md, AGENT.md in order.
 *
 * @param dirPath - Absolute path to a content directory.
 * @returns The detected content type (defaults to `'skill'` when no marker found).
 */
export async function detectContentType(dirPath: string): Promise<ContentType> {
  for (const marker of ALL_MARKER_FILES) {
    try {
      await stat(path.join(dirPath, marker));
      return MARKER_TO_TYPE[marker] ?? 'skill';
    } catch {
      // Not found, try next marker.
    }
  }
  return 'skill';
}

/**
 * Get the marker filename for a content type.
 * @param type - Content type (defaults to `'skill'`).
 */
export function getMarkerFile(type?: ContentType): string {
  return CONTENT_TYPE_CONFIG[type ?? 'skill'].markerFile;
}

/**
 * Get the companion directory names for a content type.
 * @param type - Content type (defaults to `'skill'`).
 */
export function getCompanionDirs(type?: ContentType): readonly string[] {
  return CONTENT_TYPE_CONFIG[type ?? 'skill'].companionDirs;
}

// ---------------------------------------------------------------------------
// Package I/O
// ---------------------------------------------------------------------------

/**
 * Load a full skill package from disk.
 *
 * Auto-detects the content type by checking which marker file exists
 * (SKILL.md, PROMPT.md, or AGENT.md), then reads the marker file and
 * walks the appropriate companion directories.
 *
 * @param dirPath - Absolute path to the skill directory.
 * @returns The loaded `SkillPackage`.
 * @throws {SkillNotFoundError} when no marker file is found.
 */
export async function loadSkillPackage(dirPath: string): Promise<SkillPackage> {
  // Auto-detect content type by checking which marker file exists.
  const detectedType = await detectContentType(dirPath);
  const markerFile = getMarkerFile(detectedType);
  const companionDirs = getCompanionDirs(detectedType);

  const markerPath = path.join(dirPath, markerFile);

  let raw: string;
  try {
    raw = await readFile(markerPath, 'utf-8');
  } catch {
    throw new SkillNotFoundError(path.basename(dirPath));
  }

  const skill = parseSkill(raw);

  // If frontmatter didn't specify a type, use the detected one
  // (only when it differs from the default 'skill').
  if (!skill.type && detectedType !== 'skill') {
    skill.type = detectedType;
  }

  // Validate skill name for path safety (don't crash on unnamed skills during load).
  if (skill.name) {
    assertSafeSkillName(skill.name);
  }

  // Start the files array with the marker file itself.
  const files: SkillFile[] = [
    { relativePath: markerFile, content: raw },
  ];

  // Walk each companion subdirectory.
  for (const subdir of companionDirs) {
    const subdirPath = path.join(dirPath, subdir);
    const collected = await walkDir(subdirPath, dirPath);
    files.push(...collected);
  }

  return { skill, files };
}

/**
 * Write a complete skill package to disk.
 *
 * Creates the target directory and all necessary subdirectories,
 * then writes every file in the package.
 *
 * @param dirPath - Absolute path to the skill directory.
 * @param pkg     - The skill package to persist.
 */
export async function saveSkillPackage(
  dirPath: string,
  pkg: SkillPackage,
): Promise<void> {
  await mkdir(dirPath, { recursive: true });

  for (const file of pkg.files) {
    assertSafeRelativePath(file.relativePath);
    const target = path.join(dirPath, file.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Frontmatter extensions
// ---------------------------------------------------------------------------

const VALID_TARGETS: ReadonlySet<string> = new Set(['claude-code', 'codex', 'cursor']);

/**
 * Extract well-known optional fields from a skill's metadata.
 *
 * This provides a typed overlay for `tags`, `targets`, and `category`
 * without changing how `parseSkill` or `serializeSkill` work.
 */
export function extractSkillExtensions(skill: Skill): SkillFrontmatterExtensions {
  const meta = skill.metadata ?? {};

  return {
    type: skill.type,
    tags: Array.isArray(meta.tags)
      ? (meta.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : undefined,
    targets: Array.isArray(meta.targets)
      ? (meta.targets as unknown[]).filter((t): t is DeployTarget =>
          typeof t === 'string' && VALID_TARGETS.has(t),
        )
      : undefined,
    category: typeof meta.category === 'string' ? meta.category : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all files under `dirPath` and return them as
 * `SkillFile[]` with paths relative to `basePath`.
 */
async function walkDir(
  dirPath: string,
  basePath: string,
): Promise<SkillFile[]> {
  const results: SkillFile[] = [];

  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    // Directory does not exist -- perfectly fine, just skip.
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath, basePath);
      results.push(...nested);
    } else if (entry.isFile()) {
      const content = await readFile(fullPath, 'utf-8');
      const relativePath = path.relative(basePath, fullPath);
      results.push({ relativePath, content });
    }
  }

  return results;
}
