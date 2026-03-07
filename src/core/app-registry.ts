import type {
  AgentAppCatalogItem,
  AgentAppId,
  AgentRepositoryLocation,
  ArtifactKind,
  ArtifactLossiness,
  ArtifactScope,
  ArtifactVisibilityStatus,
  DeployTarget,
  SupportLevel,
} from './types.js';

type DetectionMode = 'single_file' | 'content_entries' | 'pattern_files';

interface RepositoryLocationDefinition extends AgentRepositoryLocation {
  detectionMode: DetectionMode;
  recursive?: boolean;
  extensions?: string[];
  suffixes?: string[];
  defaultVisibilityStatus?: ArtifactVisibilityStatus;
  defaultLossiness?: ArtifactLossiness;
}

interface AgentAppDefinition {
  appId: AgentAppId;
  label: string;
  artifactKinds: ArtifactKind[];
  canonicalLocations: RepositoryLocationDefinition[];
  legacyLocations: RepositoryLocationDefinition[];
  precedence: ArtifactScope[];
  readStrategy: string;
  writeStrategy: string;
  supportLevel: SupportLevel;
  docUrls: string[];
  deployTarget?: DeployTarget;
}

function location(
  _appId: AgentAppId,
  id: string,
  label: string,
  artifactKind: ArtifactKind,
  scope: ArtifactScope,
  relativePath: string,
  canonical: boolean,
  detectionMode: DetectionMode,
  extras?: Partial<Omit<RepositoryLocationDefinition, 'id' | 'label' | 'artifactKind' | 'scope' | 'relativePath' | 'canonical' | 'detectionMode'>>,
): RepositoryLocationDefinition {
  return {
    id,
    label,
    artifactKind,
    scope,
    relativePath,
    canonical,
    detectionMode,
    ...extras,
  };
}

const OFFICIAL_AGENT_APPS: AgentAppDefinition[] = [
  {
    appId: 'codex',
    label: 'Codex',
    artifactKinds: ['instruction_file', 'skill_package', 'prompt_file', 'subagent_file'],
    canonicalLocations: [
      location('codex', 'codex-instructions-workspace', 'Codex instructions', 'instruction_file', 'workspace', 'AGENTS.md', true, 'single_file'),
      location('codex', 'codex-skills-workspace', 'Codex skills', 'skill_package', 'workspace', '.codex/skills', true, 'content_entries'),
      location('codex', 'codex-prompts-workspace', 'Codex prompts', 'prompt_file', 'workspace', '.codex/prompts', true, 'content_entries'),
      location('codex', 'codex-agents-workspace', 'Codex agents', 'subagent_file', 'workspace', '.codex/agents', true, 'content_entries'),
      location('codex', 'codex-skills-user', 'Codex skills', 'skill_package', 'user', '.codex/skills', true, 'content_entries'),
      location('codex', 'codex-prompts-user', 'Codex prompts', 'prompt_file', 'user', '.codex/prompts', true, 'content_entries'),
      location('codex', 'codex-agents-user', 'Codex agents', 'subagent_file', 'user', '.codex/agents', true, 'content_entries'),
    ],
    legacyLocations: [
      location(
        'codex',
        'codex-generic-skills-workspace',
        'Generic .skills directory',
        'skill_package',
        'workspace',
        '.skills',
        false,
        'content_entries',
        {
          defaultVisibilityStatus: 'found_in_wrong_repository',
          defaultLossiness: 'lossless',
        },
      ),
    ],
    precedence: ['workspace', 'user'],
    readStrategy: 'Workspace instructions in AGENTS.md plus package directories under .codex.',
    writeStrategy: 'Install package directories under .codex/{skills,prompts,agents}.',
    supportLevel: 'official',
    docUrls: [
      'https://openai.com/index/introducing-codex/',
      'https://github.com/openai/codex',
    ],
    deployTarget: 'codex',
  },
  {
    appId: 'claude-code',
    label: 'Claude Code',
    artifactKinds: ['instruction_file', 'command_file', 'prompt_file', 'subagent_file', 'skill_package'],
    canonicalLocations: [
      location('claude-code', 'claude-memory-workspace', 'CLAUDE.md', 'instruction_file', 'workspace', 'CLAUDE.md', true, 'single_file'),
      location('claude-code', 'claude-commands-workspace', 'Claude Code commands', 'command_file', 'workspace', '.claude/commands', true, 'pattern_files', {
        extensions: ['.md'],
      }),
      location('claude-code', 'claude-prompts-workspace', 'Claude Code prompts', 'prompt_file', 'workspace', '.claude/prompts', true, 'pattern_files', {
        extensions: ['.md'],
      }),
      location('claude-code', 'claude-agents-workspace', 'Claude Code subagents', 'subagent_file', 'workspace', '.claude/agents', true, 'pattern_files', {
        extensions: ['.md'],
      }),
      location('claude-code', 'claude-commands-user', 'Claude Code commands', 'command_file', 'user', '.claude/commands', true, 'pattern_files', {
        extensions: ['.md'],
      }),
      location('claude-code', 'claude-prompts-user', 'Claude Code prompts', 'prompt_file', 'user', '.claude/prompts', true, 'pattern_files', {
        extensions: ['.md'],
      }),
      location('claude-code', 'claude-agents-user', 'Claude Code subagents', 'subagent_file', 'user', '.claude/agents', true, 'pattern_files', {
        extensions: ['.md'],
      }),
    ],
    legacyLocations: [
      location('claude-code', 'claude-skills-legacy-workspace', 'Legacy Claude skills', 'skill_package', 'workspace', '.claude/skills', false, 'content_entries', {
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
      location('claude-code', 'claude-skills-legacy-user', 'Legacy Claude skills', 'skill_package', 'user', '.claude/skills', false, 'content_entries', {
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
      location('claude-code', 'claude-generic-skills-workspace', 'Generic .skills directory', 'skill_package', 'workspace', '.skills', false, 'content_entries', {
        defaultVisibilityStatus: 'found_in_wrong_repository',
        defaultLossiness: 'lossless',
      }),
    ],
    precedence: ['workspace', 'user'],
    readStrategy: 'CLAUDE.md provides project memory; .claude/{commands,prompts,agents} expose reusable files.',
    writeStrategy: 'Write markdown bodies into .claude/{commands,prompts,agents}.',
    supportLevel: 'official',
    docUrls: [
      'https://docs.anthropic.com/en/docs/claude-code/slash-commands',
      'https://docs.anthropic.com/en/docs/claude-code/sub-agents',
      'https://docs.anthropic.com/en/docs/claude-code/memory',
    ],
    deployTarget: 'claude-code',
  },
  {
    appId: 'cursor',
    label: 'Cursor',
    artifactKinds: ['rule_file', 'instruction_file', 'prompt_file', 'subagent_file'],
    canonicalLocations: [
      location('cursor', 'cursor-rules-workspace', 'Cursor rules', 'rule_file', 'workspace', '.cursor/rules', true, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
      }),
      location('cursor', 'cursor-prompts-workspace', 'Cursor prompts', 'prompt_file', 'workspace', '.cursor/prompts', true, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
      }),
      location('cursor', 'cursor-agents-workspace', 'Cursor agents', 'subagent_file', 'workspace', '.cursor/agents', true, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
      }),
    ],
    legacyLocations: [
      location('cursor', 'cursor-cursorrules-legacy', 'Legacy .cursorrules', 'rule_file', 'workspace', '.cursorrules', false, 'single_file', {
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
      location('cursor', 'cursor-agentsmd-legacy', 'AGENTS.md compatibility', 'instruction_file', 'workspace', 'AGENTS.md', false, 'single_file', {
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
      location('cursor', 'cursor-generic-skills-workspace', 'Generic .skills directory', 'skill_package', 'workspace', '.skills', false, 'content_entries', {
        defaultVisibilityStatus: 'found_in_wrong_repository',
        defaultLossiness: 'lossy_with_explicit_warning',
      }),
    ],
    precedence: ['workspace'],
    readStrategy: 'Cursor reads project-local rules, prompts and agents from .cursor.',
    writeStrategy: 'Write markdown files into .cursor/{rules,prompts,agents}.',
    supportLevel: 'official',
    docUrls: [
      'https://docs.cursor.com/en/context/rules',
    ],
    deployTarget: 'cursor',
  },
  {
    appId: 'windsurf',
    label: 'Windsurf',
    artifactKinds: ['rule_file'],
    canonicalLocations: [
      location('windsurf', 'windsurf-rules-workspace', 'Windsurf rules', 'rule_file', 'workspace', '.windsurf/rules', true, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
      }),
    ],
    legacyLocations: [],
    precedence: ['workspace'],
    readStrategy: 'Windsurf reads rules from .windsurf/rules.',
    writeStrategy: 'Migration writes markdown rule files into .windsurf/rules.',
    supportLevel: 'official_but_detect_only',
    docUrls: [
      'https://docs.windsurf.com/windsurf/cascade/memories',
    ],
  },
  {
    appId: 'cline',
    label: 'Cline',
    artifactKinds: ['rule_file'],
    canonicalLocations: [
      location('cline', 'cline-rules-workspace', 'Cline rules', 'rule_file', 'workspace', '.clinerules', true, 'single_file'),
    ],
    legacyLocations: [
      location('cline', 'cline-rules-directory-legacy', 'Legacy .cline/rules', 'rule_file', 'workspace', '.cline/rules', false, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
    ],
    precedence: ['workspace'],
    readStrategy: 'Cline uses the .clinerules repository instructions file.',
    writeStrategy: 'Migration writes a single .clinerules markdown file.',
    supportLevel: 'official_but_detect_only',
    docUrls: [
      'https://docs.cline.bot/',
    ],
  },
  {
    appId: 'continue',
    label: 'Continue',
    artifactKinds: ['rule_file'],
    canonicalLocations: [
      location('continue', 'continue-rules-workspace', 'Continue rules', 'rule_file', 'workspace', '.continue/rules', true, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
      }),
      location('continue', 'continue-rules-user', 'Continue rules', 'rule_file', 'user', '.continue/rules', true, 'pattern_files', {
        extensions: ['.md', '.mdc'],
        recursive: true,
      }),
    ],
    legacyLocations: [],
    precedence: ['workspace', 'user'],
    readStrategy: 'Continue reads project and user rules from .continue/rules.',
    writeStrategy: 'Migration writes markdown rules into .continue/rules.',
    supportLevel: 'official_but_detect_only',
    docUrls: [
      'https://docs.continue.dev/customize/rules',
    ],
  },
  {
    appId: 'gemini-cli',
    label: 'Gemini CLI',
    artifactKinds: ['instruction_file'],
    canonicalLocations: [
      location('gemini-cli', 'gemini-context-workspace', 'GEMINI.md', 'instruction_file', 'workspace', 'GEMINI.md', true, 'single_file'),
    ],
    legacyLocations: [],
    precedence: ['workspace'],
    readStrategy: 'Gemini CLI reads GEMINI.md context files.',
    writeStrategy: 'Detection only in v1; migration remains manual.',
    supportLevel: 'official_but_detect_only',
    docUrls: [
      'https://github.com/google-gemini/gemini-cli',
    ],
  },
  {
    appId: 'amp',
    label: 'Amp',
    artifactKinds: ['instruction_file', 'skill_package'],
    canonicalLocations: [
      location('amp', 'amp-instructions-workspace', 'Amp AGENTS.md', 'instruction_file', 'workspace', 'AGENTS.md', true, 'single_file'),
      location('amp', 'amp-skills-user', 'Amp skills', 'skill_package', 'user', '.amp/skills', true, 'content_entries'),
    ],
    legacyLocations: [
      location('amp', 'amp-claude-skills-legacy', 'Claude skill compatibility', 'skill_package', 'workspace', '.claude/skills', false, 'content_entries', {
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
      location('amp', 'amp-claude-skills-user-legacy', 'Claude skill compatibility', 'skill_package', 'user', '.claude/skills', false, 'content_entries', {
        defaultVisibilityStatus: 'found_in_legacy_repository',
        defaultLossiness: 'lossless',
      }),
    ],
    precedence: ['workspace', 'user'],
    readStrategy: 'Amp uses AGENTS.md plus skills repositories documented by the manual.',
    writeStrategy: 'Planning only in v1; execution stays manual.',
    supportLevel: 'official_but_detect_only',
    docUrls: [
      'https://ampcode.com/manual',
    ],
  },
  {
    appId: 'github-copilot',
    label: 'GitHub Copilot',
    artifactKinds: ['instruction_file', 'skill_package'],
    canonicalLocations: [
      location('github-copilot', 'copilot-instructions-workspace', 'copilot-instructions.md', 'instruction_file', 'workspace', '.github/copilot-instructions.md', true, 'single_file'),
      location('github-copilot', 'copilot-instructions-directory-workspace', 'Copilot instruction files', 'instruction_file', 'workspace', '.github/instructions', true, 'pattern_files', {
        recursive: true,
        suffixes: ['.instructions.md'],
      }),
      location('github-copilot', 'copilot-skills-workspace', 'Copilot agent skills', 'skill_package', 'workspace', '.github/skills', true, 'content_entries'),
      location('github-copilot', 'copilot-skills-user', 'Copilot agent skills', 'skill_package', 'user', '.copilot/skills', true, 'content_entries'),
    ],
    legacyLocations: [],
    precedence: ['workspace', 'user'],
    readStrategy: 'Copilot reads repository instructions and agent skills from .github and optional user skills.',
    writeStrategy: 'Planning only in v1; execution stays manual.',
    supportLevel: 'official_but_detect_only',
    docUrls: [
      'https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions',
      'https://docs.github.com/en/copilot/tutorials/customization-library/creating-an-agent-skill',
    ],
  },
  {
    appId: 'antigravity',
    label: 'Antigravity',
    artifactKinds: ['unknown'],
    canonicalLocations: [],
    legacyLocations: [],
    precedence: ['workspace'],
    readStrategy: 'Official app known, but local repository layout is not verified enough for automated detection.',
    writeStrategy: 'Manual only.',
    supportLevel: 'official_app_unverified_layout',
    docUrls: [
      'https://codelabs.developers.google.com/getting-started-google-antigravity',
    ],
  },
];

export type { AgentAppDefinition, RepositoryLocationDefinition };

export function listAgentApps(): AgentAppCatalogItem[] {
  return OFFICIAL_AGENT_APPS.map((entry) => ({
    appId: entry.appId,
    label: entry.label,
    artifactKinds: [...entry.artifactKinds],
    canonicalLocations: entry.canonicalLocations.map(toPublicLocation),
    legacyLocations: entry.legacyLocations.map(toPublicLocation),
    precedence: [...entry.precedence],
    workspaceRelative: uniqueRelativePaths(entry, 'workspace'),
    userRelative: uniqueRelativePaths(entry, 'user'),
    readStrategy: entry.readStrategy,
    writeStrategy: entry.writeStrategy,
    supportLevel: entry.supportLevel,
    docUrls: [...entry.docUrls],
    ...(entry.deployTarget ? { deployTarget: entry.deployTarget } : {}),
  }));
}

export function getAgentAppDefinition(appId: AgentAppId): AgentAppDefinition | undefined {
  return OFFICIAL_AGENT_APPS.find((entry) => entry.appId === appId);
}

export function getAllAgentAppDefinitions(): AgentAppDefinition[] {
  return OFFICIAL_AGENT_APPS.map((entry) => ({
    ...entry,
    canonicalLocations: entry.canonicalLocations.map((location) => ({ ...location })),
    legacyLocations: entry.legacyLocations.map((location) => ({ ...location })),
    artifactKinds: [...entry.artifactKinds],
    precedence: [...entry.precedence],
    docUrls: [...entry.docUrls],
  }));
}

export function flattenWorkspaceDirectoryHints(): Array<{
  label: string;
  relativePath: string;
  tool: AgentAppId;
}> {
  const seen = new Set<string>();
  const rows: Array<{ label: string; relativePath: string; tool: AgentAppId }> = [];

  for (const entry of OFFICIAL_AGENT_APPS) {
    const allLocations = [...entry.canonicalLocations, ...entry.legacyLocations];
    for (const location of allLocations) {
      if (location.scope !== 'workspace') continue;
      if (location.detectionMode === 'single_file') continue;

      const key = `${entry.appId}::${location.relativePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        label: location.label,
        relativePath: location.relativePath,
        tool: entry.appId,
      });
    }
  }

  return rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function toPublicLocation(location: RepositoryLocationDefinition): AgentRepositoryLocation {
  return {
    id: location.id,
    label: location.label,
    artifactKind: location.artifactKind,
    scope: location.scope,
    relativePath: location.relativePath,
    canonical: location.canonical,
  };
}

function uniqueRelativePaths(entry: AgentAppDefinition, scope: ArtifactScope): string[] {
  const set = new Set<string>();
  for (const location of [...entry.canonicalLocations, ...entry.legacyLocations]) {
    if (location.scope !== scope) continue;
    set.add(location.relativePath);
  }
  return [...set].sort();
}
