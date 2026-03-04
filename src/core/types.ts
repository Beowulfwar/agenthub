/**
 * Core type definitions for agent-hub.
 *
 * All interfaces used across the project are defined here to keep
 * the type surface in a single, importable location.
 */

// ---------------------------------------------------------------------------
// Skill types
// ---------------------------------------------------------------------------

/** Arbitrary metadata extracted from YAML frontmatter. */
export interface SkillMetadata {
  [key: string]: unknown;
}

/** A parsed skill (SKILL.md frontmatter + body). */
export interface Skill {
  /** Unique kebab-case identifier. */
  name: string;
  /** Human-readable one-line description. */
  description: string;
  /** Markdown body (everything after the frontmatter). */
  body: string;
  /** Extra YAML frontmatter fields beyond name/description. */
  metadata?: SkillMetadata;
}

/** A single file that belongs to a skill package. */
export interface SkillFile {
  /** Path relative to the skill directory root (e.g. "agents/openai.yaml"). */
  relativePath: string;
  /** UTF-8 file content. */
  content: string;
}

/** A skill together with its companion files (agents/, scripts/, references/). */
export interface SkillPackage {
  /** The parsed SKILL.md. */
  skill: Skill;
  /** Every file inside the skill directory (including SKILL.md itself). */
  files: SkillFile[];
}

// ---------------------------------------------------------------------------
// Deploy targets
// ---------------------------------------------------------------------------

/** Supported deployment targets. */
export type DeployTarget = 'claude-code' | 'codex' | 'cursor';

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

/** Git backend settings. */
export interface GitConfig {
  /** Remote repository URL (HTTPS or SSH). */
  repoUrl: string;
  /** Branch to sync from. Defaults to "main". */
  branch: string;
  /** Sub-directory inside the repo that holds skills. Defaults to ".". */
  skillsDir: string;
}

/** Google Drive backend settings. */
export interface DriveConfig {
  /** The Drive folder ID that holds skill directories. */
  folderId: string;
  /** Path to a GCP service-account key JSON, if any. */
  credentialsPath?: string;
}

/** Top-level configuration persisted at ~/.ahub/config.json. */
export interface AhubConfig {
  /** Which storage provider is active. */
  provider: 'git' | 'drive';
  /** Git provider settings (required when provider === 'git'). */
  git?: GitConfig;
  /** Google Drive provider settings (required when provider === 'drive'). */
  drive?: DriveConfig;
  /** Where skills are deployed to. Key = target name, value = absolute path override. */
  deployTargets?: Partial<Record<DeployTarget, string>>;
}

// ---------------------------------------------------------------------------
// Operation results
// ---------------------------------------------------------------------------

/** Result of a provider health check. */
export interface HealthCheckResult {
  /** Whether the provider is reachable and configured correctly. */
  ok: boolean;
  /** Human-readable status message. */
  message: string;
}
