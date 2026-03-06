/**
 * Filesystem explorer for workspace registration.
 *
 * Provides interactive directory browsing and auto-detection of
 * well-known agent skill directories used by popular AI coding tools.
 */

import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { normalizePath } from './wsl.js';
import { ALL_MARKER_FILES } from './types.js';

// ---------------------------------------------------------------------------
// Well-known skill directory patterns
// ---------------------------------------------------------------------------

/**
 * Common directories where AI agents store skills/commands/rules.
 * Each entry maps a display label to a relative path (from a project root).
 */
export const WELL_KNOWN_SKILL_DIRS: ReadonlyArray<{
  label: string;
  relativePath: string;
  tool: string;
}> = [
  // Claude Code
  { label: 'Claude Code commands',  relativePath: '.claude/commands',  tool: 'claude-code' },
  { label: 'Claude Code skills',    relativePath: '.claude/skills',    tool: 'claude-code' },
  { label: 'Claude Code agents',    relativePath: '.claude/agents',    tool: 'claude-code' },
  { label: 'Claude Code prompts',   relativePath: '.claude/prompts',   tool: 'claude-code' },

  // Codex
  { label: 'Codex skills',          relativePath: '.codex/skills',     tool: 'codex' },
  { label: 'Codex agents',          relativePath: '.codex/agents',     tool: 'codex' },
  { label: 'Codex prompts',         relativePath: '.codex/prompts',    tool: 'codex' },

  // Cursor
  { label: 'Cursor rules',          relativePath: '.cursor/rules',     tool: 'cursor' },
  { label: 'Cursor agents',         relativePath: '.cursor/agents',    tool: 'cursor' },
  { label: 'Cursor prompts',        relativePath: '.cursor/prompts',   tool: 'cursor' },

  // Generic / ahub
  { label: 'Skills directory',      relativePath: '.skills',           tool: 'generic' },

  // Windsurf
  { label: 'Windsurf rules',        relativePath: '.windsurf/rules',   tool: 'windsurf' },

  // Aider
  { label: 'Aider conventions',     relativePath: '.aider/conventions', tool: 'aider' },

  // Cline
  { label: 'Cline rules',           relativePath: '.cline/rules',      tool: 'cline' },

  // Continue
  { label: 'Continue prompts',      relativePath: '.continue/prompts', tool: 'continue' },
];

// ---------------------------------------------------------------------------
// Detected skill directory result
// ---------------------------------------------------------------------------

/** A detected skill directory with metadata. */
export interface DetectedSkillDir {
  /** Absolute path to the directory. */
  absolutePath: string;
  /** Display label (from well-known patterns or auto-detected). */
  label: string;
  /** Which tool this directory belongs to. */
  tool: string;
  /** Number of skill-like files found. */
  skillCount: number;
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

/**
 * Scan a base directory for well-known agent skill directories.
 * Returns all detected directories that exist and contain files.
 *
 * @param baseDir - The directory to scan (e.g. /home/user/project)
 */
export async function scanForSkillDirs(baseDir: string): Promise<DetectedSkillDir[]> {
  const normalized = normalizePath(baseDir);
  const results: DetectedSkillDir[] = [];

  for (const pattern of WELL_KNOWN_SKILL_DIRS) {
    const fullPath = path.join(normalized, pattern.relativePath);
    const count = await countSkillFiles(fullPath);

    if (count > 0) {
      results.push({
        absolutePath: fullPath,
        label: pattern.label,
        tool: pattern.tool,
        skillCount: count,
      });
    }
  }

  return results;
}

/**
 * Count files that look like skills (SKILL.md, PROMPT.md, AGENT.md, or .md files)
 * inside a directory. Counts both direct .md files and subdirectories with marker files.
 */
async function countSkillFiles(dir: string): Promise<number> {
  try {
    await access(dir);
  } catch {
    return 0;
  }

  let count = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check for marker files inside subdirectory (skill package)
        for (const marker of ALL_MARKER_FILES) {
          try {
            await access(path.join(dir, entry.name, marker));
            count++;
            break;
          } catch {
            // no marker in this subdir
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Direct .md files (e.g. claude commands)
        count++;
      }
    }
  } catch {
    // Cannot read directory
  }

  return count;
}

// ---------------------------------------------------------------------------
// Directory listing for interactive explorer
// ---------------------------------------------------------------------------

/** An entry in the directory listing. */
export interface DirEntry {
  /** Entry name. */
  name: string;
  /** Full absolute path. */
  fullPath: string;
  /** Whether this is a directory. */
  isDirectory: boolean;
  /** If this matches a well-known skill pattern. */
  skillMatch?: {
    label: string;
    tool: string;
    count: number;
  };
}

/**
 * List directory contents for the interactive explorer.
 * Returns directories first (sorted), annotated with skill pattern matches.
 *
 * @param dir - Directory to list.
 * @param showHidden - Whether to include hidden directories (default: true).
 */
export async function listDirectory(
  dir: string,
  showHidden = true,
): Promise<DirEntry[]> {
  const normalized = normalizePath(dir);
  const entries: DirEntry[] = [];

  try {
    const items = await readdir(normalized, { withFileTypes: true });

    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (!showHidden && item.name.startsWith('.')) continue;

      // Skip common non-useful directories
      if (SKIP_DIRS.has(item.name)) continue;

      const fullPath = path.join(normalized, item.name);
      const entry: DirEntry = {
        name: item.name,
        fullPath,
        isDirectory: true,
      };

      // Check if this matches a well-known pattern
      const match = WELL_KNOWN_SKILL_DIRS.find(
        (p) => p.relativePath === item.name || p.relativePath.startsWith(item.name + '/'),
      );

      if (match) {
        const matchPath = path.join(normalized, match.relativePath);
        const count = await countSkillFiles(matchPath);
        if (count > 0) {
          entry.skillMatch = {
            label: match.label,
            tool: match.tool,
            count,
          };
        }
      }

      entries.push(entry);
    }
  } catch {
    // Cannot read directory
  }

  // Sort: skill matches first, then alphabetically
  entries.sort((a, b) => {
    if (a.skillMatch && !b.skillMatch) return -1;
    if (!a.skillMatch && b.skillMatch) return 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

/** Directories to skip in the explorer (large/irrelevant). */
const SKIP_DIRS = new Set([
  'node_modules',
  '__pycache__',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.nyc_output',
  'target',  // Rust/Java
]);

// ---------------------------------------------------------------------------
// Quick-scan starting points
// ---------------------------------------------------------------------------

/**
 * Suggest starting directories for the explorer based on common workspace locations.
 * Returns paths grouped by category: current project, home, common dev dirs.
 */
export function suggestStartDirs(): Array<{ path: string; label: string }> {
  const home = os.homedir();
  const cwd = process.cwd();
  const seen = new Set<string>();

  const dirs: Array<{ path: string; label: string }> = [];

  const add = (p: string, label: string) => {
    const normalized = normalizePath(p);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      dirs.push({ path: normalized, label });
    }
  };

  // Current working directory (likely the project)
  add(cwd, 'Current directory');

  // Home directory
  add(home, 'Home');

  // Common dev directories
  const devDirs = [
    { rel: 'projects', label: 'Projects' },
    { rel: 'workspace', label: 'Workspace' },
    { rel: 'code', label: 'Code' },
    { rel: 'dev', label: 'Dev' },
    { rel: 'repos', label: 'Repos' },
    { rel: 'src', label: 'Source' },
    { rel: 'Documents', label: 'Documents' },
    { rel: 'programacao', label: 'Programação' },
  ];

  for (const d of devDirs) {
    add(path.join(home, d.rel), d.label);
  }

  return dirs;
}

/**
 * Check if a directory exists and is readable.
 */
export async function isValidDirectory(dir: string): Promise<boolean> {
  try {
    const s = await stat(normalizePath(dir));
    return s.isDirectory();
  } catch {
    return false;
  }
}
