/**
 * Sanitization and path safety utilities for agent-hub.
 *
 * Prevents path traversal attacks (C3, C4) by validating skill names
 * and file relative paths before any filesystem operation.
 */

import path from 'node:path';

import { SkillValidationError } from './errors.js';
import type { SkillPackage } from './types.js';

/**
 * Validate that a skill name is safe for filesystem use.
 * Only allows: letters, numbers, hyphens, underscores, dots.
 * Must start with an alphanumeric character.
 * Rejects: path separators, dots at start, empty strings.
 * @throws {SkillValidationError} if name is unsafe.
 */
export function assertSafeSkillName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new SkillValidationError(['Skill name cannot be empty.']);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new SkillValidationError([
      `Skill name "${name}" contains invalid characters. Only letters, numbers, hyphens, underscores and dots are allowed (must start with alphanumeric).`,
    ]);
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new SkillValidationError([
      `Skill name "${name}" contains path traversal characters.`,
    ]);
  }
}

/**
 * Validate that a relative path stays within its base directory.
 * @throws {SkillValidationError} if path escapes the base.
 */
export function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath || relativePath.trim().length === 0) {
    throw new SkillValidationError(['File relative path cannot be empty.']);
  }

  const normalized = path.normalize(relativePath);

  // Reject absolute paths
  if (path.isAbsolute(normalized)) {
    throw new SkillValidationError([
      `File path "${relativePath}" must be relative, not absolute.`,
    ]);
  }

  // Reject paths that escape the base directory
  if (
    normalized.startsWith('..') ||
    normalized.includes('/../') ||
    normalized.includes('\\..\\'  )
  ) {
    throw new SkillValidationError([
      `File path "${relativePath}" attempts to escape the skill directory.`,
    ]);
  }
}

/**
 * Validate an entire SkillPackage for path safety.
 */
export function assertSafePackage(pkg: SkillPackage): void {
  assertSafeSkillName(pkg.skill.name);
  for (const file of pkg.files) {
    assertSafeRelativePath(file.relativePath);
  }
}

/**
 * Validate that a source ID is safe for filesystem and config use.
 * Same rules as skill names: alphanumeric start, [a-zA-Z0-9._-] chars.
 * @throws {SkillValidationError} if the ID is unsafe.
 */
export function assertSafeSourceId(id: string): void {
  if (!id || id.trim().length === 0) {
    throw new SkillValidationError(['Source ID cannot be empty.']);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new SkillValidationError([
      `Source ID "${id}" contains invalid characters. Only letters, numbers, hyphens, underscores and dots are allowed (must start with alphanumeric).`,
    ]);
  }
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new SkillValidationError([
      `Source ID "${id}" contains path traversal characters.`,
    ]);
  }
}
