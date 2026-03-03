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

import type { Skill, SkillFile, SkillMetadata, SkillPackage } from './types.js';
import { SkillNotFoundError, SkillValidationError } from './errors.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Filename that every skill directory must contain. */
const SKILL_FILENAME = 'SKILL.md';

/**
 * Subdirectories that are walked when loading a SkillPackage.
 * Other top-level directories are ignored to keep packages focused.
 */
const COMPANION_DIRS = ['agents', 'scripts', 'references'] as const;

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

  // Build metadata from remaining frontmatter keys.
  const { name: _n, description: _d, ...rest } = data;
  const metadata: SkillMetadata = rest;

  return {
    name,
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
// Package I/O
// ---------------------------------------------------------------------------

/**
 * Load a full skill package from disk.
 *
 * Reads the mandatory `SKILL.md` and walks the companion directories
 * (`agents/`, `scripts/`, `references/`).
 *
 * @param dirPath - Absolute path to the skill directory.
 * @returns The loaded `SkillPackage`.
 * @throws {SkillNotFoundError} when `SKILL.md` is missing.
 */
export async function loadSkillPackage(dirPath: string): Promise<SkillPackage> {
  const skillMdPath = path.join(dirPath, SKILL_FILENAME);

  let raw: string;
  try {
    raw = await readFile(skillMdPath, 'utf-8');
  } catch {
    throw new SkillNotFoundError(path.basename(dirPath));
  }

  const skill = parseSkill(raw);

  // Start the files array with SKILL.md itself.
  const files: SkillFile[] = [
    { relativePath: SKILL_FILENAME, content: raw },
  ];

  // Walk each companion subdirectory.
  for (const subdir of COMPANION_DIRS) {
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
    const target = path.join(dirPath, file.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf-8');
  }
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
