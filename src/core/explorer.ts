/**
 * Filesystem explorer for workspace registration.
 *
 * Provides interactive directory browsing and auto-detection of
 * well-known agent skill directories used by popular AI coding tools.
 */

import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isWSL, normalizeExternalPath, normalizePath, toWindowsPath } from './wsl.js';
import { ALL_MARKER_FILES } from './types.js';
import { findWorkspaceManifestInDirectory } from './workspace.js';
import type { DeployTarget, DetectedLocalSkill } from './types.js';

const execFileAsync = promisify(execFile);

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

const TOOL_TO_TARGET: Partial<Record<string, DeployTarget>> = {
  'claude-code': 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
};

/** A suggested workspace root inferred from detected local skills. */
export interface WorkspaceSuggestion {
  /** Absolute workspace directory to register. */
  workspaceDir: string;
  /** Human-readable origin for the suggestion. */
  label: string;
  /** Absolute path to the workspace manifest inside the directory. */
  manifestPath: string;
  /** Whether the manifest already exists in the directory. */
  manifestExists: boolean;
  /** Total skill-like files found across detected directories. */
  skillCount: number;
  /** Detected skill directories inside the workspace. */
  detected: DetectedSkillDir[];
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
    const detectedSkills = await listSkillEntriesInDir(fullPath, pattern.label, pattern.tool);
    const count = detectedSkills.length;

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
 * Detect concrete skill names inside all well-known local directories of a workspace.
 */
export async function detectLocalSkills(baseDir: string): Promise<DetectedLocalSkill[]> {
  const normalized = normalizePath(baseDir);
  const results: DetectedLocalSkill[] = [];

  for (const pattern of WELL_KNOWN_SKILL_DIRS) {
    const fullPath = path.join(normalized, pattern.relativePath);
    const entries = await listSkillEntriesInDir(fullPath, pattern.label, pattern.tool);
    results.push(...entries);
  }

  return results;
}

/**
 * Count files that look like skills (SKILL.md, PROMPT.md, AGENT.md, or .md files)
 * inside a directory. Counts both direct .md files and subdirectories with marker files.
 */
async function countSkillFiles(dir: string): Promise<number> {
  return (await listSkillEntriesInDir(dir, 'local', 'generic')).length;
}

async function listSkillEntriesInDir(
  dir: string,
  label: string,
  tool: string,
): Promise<DetectedLocalSkill[]> {
  try {
    await access(dir);
  } catch {
    return [];
  }

  const results: DetectedLocalSkill[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check for marker files inside subdirectory (skill package)
        for (const marker of ALL_MARKER_FILES) {
          try {
            await access(path.join(dir, entry.name, marker));
            results.push({
              name: entry.name,
              label,
              tool,
              directoryPath: dir,
              absolutePath: path.join(dir, entry.name),
              target: TOOL_TO_TARGET[tool],
            });
            break;
          } catch {
            // no marker in this subdir
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Direct .md files (e.g. claude commands)
        results.push({
          name: entry.name.replace(/\.md$/i, ''),
          label,
          tool,
          directoryPath: dir,
          absolutePath: path.join(dir, entry.name),
          target: TOOL_TO_TARGET[tool],
        });
      }
    }
  } catch {
    // Cannot read directory
  }

  return results;
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
 * Suggest workspace roots based on shallow scans for well-known skill directories.
 *
 * The scan favors practical project locations (cwd + common dev roots) and
 * searches a few directory levels deep so a path like `./.skills` promotes the
 * project root itself as the workspace suggestion.
 */
export async function suggestWorkspaceDirs(): Promise<WorkspaceSuggestion[]> {
  const results = new Map<string, WorkspaceSuggestion>();
  const roots = suggestStartDirs();
  const seenRoots = new Set<string>();

  for (const root of roots) {
    const normalizedRoot = normalizePath(root.path);
    if (seenRoots.has(normalizedRoot)) continue;
    seenRoots.add(normalizedRoot);

    if (!(await isValidDirectory(normalizedRoot))) {
      continue;
    }

    await collectWorkspaceSuggestions(normalizedRoot, root.label, results);
  }

  return Array.from(results.values()).sort((a, b) => {
    if (b.skillCount !== a.skillCount) {
      return b.skillCount - a.skillCount;
    }
    return a.workspaceDir.localeCompare(b.workspaceDir);
  });
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

const MAX_SCAN_DEPTH = 2;
const MAX_SCANNED_DIRECTORIES_PER_ROOT = 80;

async function collectWorkspaceSuggestions(
  rootDir: string,
  rootLabel: string,
  results: Map<string, WorkspaceSuggestion>,
): Promise<void> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
  const visited = new Set<string>();
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_SCANNED_DIRECTORIES_PER_ROOT) {
    const current = queue.shift();
    if (!current) break;

    const normalizedDir = normalizePath(current.dir);
    if (visited.has(normalizedDir)) continue;
    visited.add(normalizedDir);
    scanned += 1;

    const detected = await scanForSkillDirs(normalizedDir);
    if (detected.length > 0) {
      const manifestPath = path.join(normalizedDir, 'ahub.workspace.json');
      const manifestExists = (await findWorkspaceManifestInDirectory(normalizedDir)) !== null;
      const skillCount = detected.reduce((sum, entry) => sum + entry.skillCount, 0);
      const relativeDir = path.relative(rootDir, normalizedDir);
      const label = relativeDir
        ? `${rootLabel} / ${relativeDir}`
        : rootLabel;

      results.set(normalizedDir, {
        workspaceDir: normalizedDir,
        label,
        manifestPath,
        manifestExists,
        skillCount,
        detected,
      });
    }

    if (current.depth >= MAX_SCAN_DEPTH) {
      continue;
    }

    let children;
    try {
      children = await readdir(normalizedDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const nextDirectories = children
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !SKIP_DIRS.has(name))
      .filter((name) => !name.startsWith('.'))
      .sort((a, b) => a.localeCompare(b));

    for (const name of nextDirectories) {
      queue.push({
        dir: path.join(normalizedDir, name),
        depth: current.depth + 1,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Native directory picker
// ---------------------------------------------------------------------------

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isCancelledPickerError(err: unknown): boolean {
  const code = (err as { code?: string | number } | null)?.code;
  return code === 1 || code === '1';
}

async function runPickerCommand(cmd: string, args: string[]): Promise<string | null | undefined> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      encoding: 'utf-8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const selected = String(stdout).trim();
    return selected || null;
  } catch (err) {
    const code = (err as { code?: string | number } | null)?.code;
    if (code === 'ENOENT') return undefined;
    if (isCancelledPickerError(err)) return null;
    throw err;
  }
}

async function pickDirectoryWithPowerShell(initialDir?: string): Promise<string | null> {
  const selectedPath = initialDir ? escapePowerShellString(initialDir) : '';
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Select a workspace folder'",
    '$dialog.ShowNewFolderButton = $true',
    selectedPath ? `$dialog.SelectedPath = '${selectedPath}'` : '',
    '$result = $dialog.ShowDialog()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '  Write-Output $dialog.SelectedPath',
    '}',
  ].filter(Boolean).join('; ');

  const selected = await runPickerCommand('powershell.exe', ['-NoProfile', '-STA', '-Command', script]);
  return selected ?? null;
}

async function pickDirectoryWithAppleScript(initialDir?: string): Promise<string | null | undefined> {
  const script = initialDir
    ? `POSIX path of (choose folder with prompt "Select a workspace folder" default location POSIX file "${escapeAppleScriptString(initialDir)}")`
    : 'POSIX path of (choose folder with prompt "Select a workspace folder")';

  return runPickerCommand('osascript', ['-e', script]);
}

async function pickDirectoryWithZenity(initialDir?: string): Promise<string | null | undefined> {
  const args = ['--file-selection', '--directory', '--title=Select a workspace folder'];
  if (initialDir) {
    args.push(`--filename=${initialDir.replace(/\/?$/, '/')}`);
  }
  return runPickerCommand('zenity', args);
}

async function pickDirectoryWithKDialog(initialDir?: string): Promise<string | null | undefined> {
  const startDir = initialDir ?? os.homedir();
  return runPickerCommand('kdialog', ['--getexistingdirectory', startDir, 'Select a workspace folder']);
}

/**
 * Open the platform-native folder picker and return the selected directory.
 * Returns null when the user cancels the dialog.
 */
export async function pickDirectory(initialDir?: string): Promise<string | null> {
  const normalizedInitial = initialDir ? await normalizeExternalPath(initialDir) : undefined;

  if (process.platform === 'win32' || isWSL()) {
    const dialogStart = normalizedInitial && isWSL()
      ? (await toWindowsPath(normalizedInitial)) ?? normalizedInitial
      : normalizedInitial;
    const selected = await pickDirectoryWithPowerShell(dialogStart);
    return selected ? normalizeExternalPath(selected) : null;
  }

  if (process.platform === 'darwin') {
    const selected = await pickDirectoryWithAppleScript(normalizedInitial);
    if (selected !== undefined) {
      return selected ? normalizeExternalPath(selected) : null;
    }
  }

  const zenitySelected = await pickDirectoryWithZenity(normalizedInitial);
  if (zenitySelected !== undefined) {
    return zenitySelected ? normalizeExternalPath(zenitySelected) : null;
  }

  const kdialogSelected = await pickDirectoryWithKDialog(normalizedInitial);
  if (kdialogSelected !== undefined) {
    return kdialogSelected ? normalizeExternalPath(kdialogSelected) : null;
  }

  throw new Error('No native folder picker is available on this system.');
}
