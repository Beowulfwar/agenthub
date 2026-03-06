/**
 * Skill package statistics — word count, line count, file inventory.
 *
 * Provides a quick summary of a skill package without needing to
 * parse or inspect individual files.
 */

import type { SkillPackage } from './types.js';
import { ALL_MARKER_FILES } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregated statistics for a skill package. */
export interface SkillStats {
  /** Number of words in the skill body. */
  wordCount: number;
  /** Number of lines in the skill body. */
  lineCount: number;
  /** Number of characters in the skill body. */
  charCount: number;
  /** Total number of files in the package. */
  fileCount: number;
  /** Sum of byte lengths across all files. */
  totalBytes: number;
  /** Content type (defaults to 'skill'). */
  type: string;
  /** Whether the package contains files beyond the marker file. */
  hasCompanionFiles: boolean;
  /** Relative paths of companion files (excluding marker). */
  companionFiles: string[];
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

/** Set of known marker filenames for quick lookup. */
const MARKER_SET = new Set<string>(ALL_MARKER_FILES);

/**
 * Compute statistics for a skill package.
 *
 * @param pkg - A loaded `SkillPackage`.
 * @returns Aggregated stats.
 */
export function getSkillStats(pkg: SkillPackage): SkillStats {
  const body = pkg.skill.body ?? '';

  const wordCount = countWords(body);
  const lineCount = body.length === 0 ? 0 : body.split('\n').length;
  const charCount = body.length;

  const totalBytes = pkg.files.reduce(
    (sum, f) => sum + Buffer.byteLength(f.content, 'utf-8'),
    0,
  );

  const companionFiles = pkg.files
    .map((f) => f.relativePath)
    .filter((p) => !MARKER_SET.has(p));

  return {
    wordCount,
    lineCount,
    charCount,
    fileCount: pkg.files.length,
    totalBytes,
    type: pkg.skill.type ?? 'skill',
    hasCompanionFiles: companionFiles.length > 0,
    companionFiles,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a byte count into a human-readable string (e.g. "4.2 KB").
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Count whitespace-separated words in a string. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
