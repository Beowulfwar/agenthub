import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseSkill,
  serializeSkill,
  loadSkillPackage,
  detectContentType,
  getMarkerFile,
  getCompanionDirs,
  extractSkillExtensions,
} from '../../src/core/skill.js';
import { CONTENT_TYPE_CONFIG, ALL_MARKER_FILES, MARKER_TO_TYPE } from '../../src/core/types.js';
import type { ContentType } from '../../src/core/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('CONTENT_TYPE_CONFIG', () => {
  it('has entries for all three content types', () => {
    expect(CONTENT_TYPE_CONFIG).toHaveProperty('skill');
    expect(CONTENT_TYPE_CONFIG).toHaveProperty('prompt');
    expect(CONTENT_TYPE_CONFIG).toHaveProperty('subagent');
  });

  it('each entry has a markerFile and companionDirs', () => {
    for (const [type, cfg] of Object.entries(CONTENT_TYPE_CONFIG)) {
      expect(cfg.markerFile).toBeDefined();
      expect(cfg.markerFile).toMatch(/\.md$/);
      expect(Array.isArray(cfg.companionDirs)).toBe(true);
    }
  });
});

describe('ALL_MARKER_FILES', () => {
  it('contains SKILL.md, PROMPT.md, AGENT.md', () => {
    expect(ALL_MARKER_FILES).toContain('SKILL.md');
    expect(ALL_MARKER_FILES).toContain('PROMPT.md');
    expect(ALL_MARKER_FILES).toContain('AGENT.md');
  });
});

describe('MARKER_TO_TYPE', () => {
  it('maps each marker file to its content type', () => {
    expect(MARKER_TO_TYPE['SKILL.md']).toBe('skill');
    expect(MARKER_TO_TYPE['PROMPT.md']).toBe('prompt');
    expect(MARKER_TO_TYPE['AGENT.md']).toBe('subagent');
  });
});

// ---------------------------------------------------------------------------
// getMarkerFile / getCompanionDirs
// ---------------------------------------------------------------------------

describe('getMarkerFile', () => {
  it('returns SKILL.md for skill type', () => {
    expect(getMarkerFile('skill')).toBe('SKILL.md');
  });

  it('returns PROMPT.md for prompt type', () => {
    expect(getMarkerFile('prompt')).toBe('PROMPT.md');
  });

  it('returns AGENT.md for subagent type', () => {
    expect(getMarkerFile('subagent')).toBe('AGENT.md');
  });

  it('defaults to SKILL.md when type is undefined', () => {
    expect(getMarkerFile(undefined)).toBe('SKILL.md');
  });
});

describe('getCompanionDirs', () => {
  it('returns skill companion dirs', () => {
    const dirs = getCompanionDirs('skill');
    expect(dirs).toContain('agents');
    expect(dirs).toContain('scripts');
    expect(dirs).toContain('references');
  });

  it('returns prompt companion dirs', () => {
    const dirs = getCompanionDirs('prompt');
    expect(dirs).toContain('examples');
    expect(dirs).toContain('references');
  });

  it('returns subagent companion dirs', () => {
    const dirs = getCompanionDirs('subagent');
    expect(dirs).toContain('tools');
    expect(dirs).toContain('config');
    expect(dirs).toContain('references');
  });

  it('defaults to skill dirs when type is undefined', () => {
    expect(getCompanionDirs(undefined)).toEqual(getCompanionDirs('skill'));
  });
});

// ---------------------------------------------------------------------------
// parseSkill with type
// ---------------------------------------------------------------------------

describe('parseSkill with type', () => {
  it('extracts type from frontmatter', () => {
    const content = [
      '---',
      'name: "my-prompt"',
      'description: "A prompt"',
      'type: prompt',
      '---',
      '',
      'Prompt body.',
    ].join('\n');

    const skill = parseSkill(content);
    expect(skill.type).toBe('prompt');
    expect(skill.name).toBe('my-prompt');
  });

  it('extracts subagent type from frontmatter', () => {
    const content = [
      '---',
      'name: "my-agent"',
      'description: "An agent"',
      'type: subagent',
      '---',
      '',
      'Agent body.',
    ].join('\n');

    const skill = parseSkill(content);
    expect(skill.type).toBe('subagent');
  });

  it('type is undefined when not specified in frontmatter', () => {
    const content = [
      '---',
      'name: "classic-skill"',
      'description: "No type specified"',
      '---',
      '',
      'Body.',
    ].join('\n');

    const skill = parseSkill(content);
    expect(skill.type).toBeUndefined();
  });

  it('does NOT include type in metadata', () => {
    const content = [
      '---',
      'name: "typed"',
      'description: "Has type"',
      'type: prompt',
      'tags:',
      '  - test',
      '---',
      '',
      'Body.',
    ].join('\n');

    const skill = parseSkill(content);
    expect(skill.type).toBe('prompt');
    expect(skill.metadata?.type).toBeUndefined();
    expect(skill.metadata?.tags).toEqual(['test']);
  });
});

// ---------------------------------------------------------------------------
// serializeSkill with type
// ---------------------------------------------------------------------------

describe('serializeSkill with type', () => {
  it('omits type field for skill type (backward compat)', () => {
    const skill = {
      name: 'classic',
      description: 'A skill',
      body: 'Body.',
      type: 'skill' as ContentType,
      metadata: {},
    };

    const output = serializeSkill(skill);
    expect(output).not.toContain('type:');
    expect(output).toContain('name: classic');
  });

  it('includes type field for prompt', () => {
    const skill = {
      name: 'my-prompt',
      description: 'A prompt',
      body: 'Body.',
      type: 'prompt' as ContentType,
      metadata: {},
    };

    const output = serializeSkill(skill);
    expect(output).toContain('type: prompt');
  });

  it('includes type field for subagent', () => {
    const skill = {
      name: 'my-agent',
      description: 'An agent',
      body: 'Body.',
      type: 'subagent' as ContentType,
      metadata: {},
    };

    const output = serializeSkill(skill);
    expect(output).toContain('type: subagent');
  });

  it('omits type when undefined (backward compat)', () => {
    const skill = {
      name: 'old-skill',
      description: 'No type',
      body: 'Body.',
      metadata: {},
    };

    const output = serializeSkill(skill);
    expect(output).not.toContain('type:');
  });
});

// ---------------------------------------------------------------------------
// Round-trip with type
// ---------------------------------------------------------------------------

describe('round-trip with content type', () => {
  it('preserves prompt type through parse -> serialize -> parse', () => {
    const original = [
      '---',
      'name: "round-trip-prompt"',
      'description: "Tests prompt round trip"',
      'type: prompt',
      'tags:',
      '  - test',
      '---',
      '',
      '# Round Trip Prompt',
      '',
      'Content here.',
    ].join('\n');

    const skill = parseSkill(original);
    const serialized = serializeSkill(skill);
    const reparsed = parseSkill(serialized);

    expect(reparsed.type).toBe('prompt');
    expect(reparsed.name).toBe('round-trip-prompt');
    expect(reparsed.body).toBe(skill.body);
    expect(reparsed.metadata?.tags).toEqual(['test']);
  });

  it('skill type produces identical output on round-trip (no type field emitted)', () => {
    const original = [
      '---',
      'name: "round-trip-skill"',
      'description: "Classic skill"',
      '---',
      '',
      'Body.',
    ].join('\n');

    const skill = parseSkill(original);
    expect(skill.type).toBeUndefined();

    const serialized = serializeSkill(skill);
    expect(serialized).not.toContain('type:');
  });
});

// ---------------------------------------------------------------------------
// detectContentType
// ---------------------------------------------------------------------------

describe('detectContentType', () => {
  it('detects skill from SKILL.md', async () => {
    const dir = path.join(FIXTURES, 'sample-skill');
    const type = await detectContentType(dir);
    expect(type).toBe('skill');
  });

  it('detects prompt from PROMPT.md', async () => {
    const dir = path.join(FIXTURES, 'sample-prompt');
    const type = await detectContentType(dir);
    expect(type).toBe('prompt');
  });

  it('detects subagent from AGENT.md', async () => {
    const dir = path.join(FIXTURES, 'sample-agent');
    const type = await detectContentType(dir);
    expect(type).toBe('subagent');
  });

  it('defaults to skill for empty directory', async () => {
    const dir = path.join(FIXTURES, 'nonexistent-dir-' + Date.now());
    const type = await detectContentType(dir);
    expect(type).toBe('skill');
  });
});

// ---------------------------------------------------------------------------
// loadSkillPackage with different types
// ---------------------------------------------------------------------------

describe('loadSkillPackage with content types', () => {
  it('loads a prompt package from PROMPT.md', async () => {
    const dir = path.join(FIXTURES, 'sample-prompt');
    const pkg = await loadSkillPackage(dir);

    expect(pkg.skill.name).toBe('sample-prompt');
    expect(pkg.skill.type).toBe('prompt');
    expect(pkg.skill.description).toBe('A sample prompt for testing');
    expect(pkg.skill.body).toContain('# Sample Prompt');
    expect(pkg.files.some((f) => f.relativePath === 'PROMPT.md')).toBe(true);
  });

  it('loads a subagent package from AGENT.md', async () => {
    const dir = path.join(FIXTURES, 'sample-agent');
    const pkg = await loadSkillPackage(dir);

    expect(pkg.skill.name).toBe('sample-agent');
    expect(pkg.skill.type).toBe('subagent');
    expect(pkg.skill.description).toBe('A sample subagent for testing');
    expect(pkg.skill.body).toContain('# Sample Agent');
    expect(pkg.files.some((f) => f.relativePath === 'AGENT.md')).toBe(true);
  });

  it('loads a skill package (backward compat)', async () => {
    const dir = path.join(FIXTURES, 'sample-skill');
    const pkg = await loadSkillPackage(dir);

    expect(pkg.skill.name).toBe('test-skill');
    // Existing skills without type in frontmatter: type stays undefined
    // (treated as 'skill' everywhere via `type ?? 'skill'`).
    // Only prompt/subagent detected types get explicitly set.
    expect(pkg.files.some((f) => f.relativePath === 'SKILL.md')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractSkillExtensions with type
// ---------------------------------------------------------------------------

describe('extractSkillExtensions includes type', () => {
  it('includes type in extensions', () => {
    const skill = {
      name: 'typed-skill',
      description: 'Has type',
      body: 'Body.',
      type: 'prompt' as ContentType,
      metadata: { tags: ['test'] },
    };

    const ext = extractSkillExtensions(skill);
    expect(ext.type).toBe('prompt');
    expect(ext.tags).toEqual(['test']);
  });

  it('type is undefined when skill has no type', () => {
    const skill = {
      name: 'untyped',
      description: 'No type',
      body: 'Body.',
      metadata: {},
    };

    const ext = extractSkillExtensions(skill);
    expect(ext.type).toBeUndefined();
  });
});
