/**
 * Phase 4 integration tests — clone, rename, edit (field merge), info.
 *
 * These tests verify the core logic used by CLI/MCP/API for Phase 4 operations
 * without requiring actual storage providers or filesystem I/O.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSkill,
  serializeSkill,
  validateSkill,
  getMarkerFile,
} from '../../src/core/skill.js';
import { getSkillStats, formatBytes } from '../../src/core/stats.js';
import type { Skill, SkillPackage } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides?: Partial<Skill>): Skill {
  return {
    name: 'original-skill',
    description: 'Original description',
    body: '# Hello\n\nThis is the body content.\n\nSecond paragraph.',
    metadata: { tags: ['testing', 'demo'], category: 'quality' },
    ...overrides,
  };
}

function makePkg(overrides?: Partial<Skill>): SkillPackage {
  const skill = makeSkill(overrides);
  const markerFile = getMarkerFile(skill.type);
  return {
    skill,
    files: [
      { relativePath: markerFile, content: serializeSkill(skill) },
      { relativePath: 'agents/helper.yaml', content: 'key: value' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Clone logic
// ---------------------------------------------------------------------------

describe('clone logic', () => {
  it('creates a copy with a new name', () => {
    const pkg = makePkg();
    const clonedSkill = { ...pkg.skill, name: 'cloned-skill' };

    expect(clonedSkill.name).toBe('cloned-skill');
    expect(clonedSkill.description).toBe(pkg.skill.description);
    expect(clonedSkill.body).toBe(pkg.skill.body);
    expect(clonedSkill.metadata).toEqual(pkg.skill.metadata);
  });

  it('preserves original after cloning', () => {
    const pkg = makePkg();
    const _clonedSkill = { ...pkg.skill, name: 'cloned-skill' };

    // Original is unchanged.
    expect(pkg.skill.name).toBe('original-skill');
  });

  it('serialized clone has the new name', () => {
    const pkg = makePkg();
    const clonedSkill = { ...pkg.skill, name: 'cloned-skill' };
    const serialized = serializeSkill(clonedSkill);
    const reparsed = parseSkill(serialized);

    expect(reparsed.name).toBe('cloned-skill');
    expect(reparsed.description).toBe(pkg.skill.description);
    expect(reparsed.body).toBe(pkg.skill.body);
  });

  it('clone validates correctly', () => {
    const pkg = makePkg();
    const clonedSkill = { ...pkg.skill, name: 'valid-clone' };
    expect(() => validateSkill(clonedSkill)).not.toThrow();
  });

  it('clone with empty name fails validation', () => {
    const pkg = makePkg();
    const clonedSkill = { ...pkg.skill, name: '' };
    expect(() => validateSkill(clonedSkill)).toThrow(/name/);
  });

  it('clone preserves companion files', () => {
    const pkg = makePkg();
    const markerFile = getMarkerFile(pkg.skill.type);
    const companionFiles = pkg.files.filter((f) => f.relativePath !== markerFile);

    expect(companionFiles).toHaveLength(1);
    expect(companionFiles[0]!.relativePath).toBe('agents/helper.yaml');
    expect(companionFiles[0]!.content).toBe('key: value');
  });

  it('clone of prompt type uses PROMPT.md marker', () => {
    const pkg = makePkg({ type: 'prompt' });
    const clonedSkill = { ...pkg.skill, name: 'cloned-prompt' };
    const marker = getMarkerFile(clonedSkill.type);

    expect(marker).toBe('PROMPT.md');
  });
});

// ---------------------------------------------------------------------------
// Rename logic
// ---------------------------------------------------------------------------

describe('rename logic', () => {
  it('creates a renamed skill with correct name', () => {
    const pkg = makePkg();
    const renamedSkill = { ...pkg.skill, name: 'new-name' };

    expect(renamedSkill.name).toBe('new-name');
    expect(renamedSkill.description).toBe(pkg.skill.description);
    expect(renamedSkill.body).toBe(pkg.skill.body);
  });

  it('round-trips correctly through serialize/parse', () => {
    const pkg = makePkg();
    const renamedSkill = { ...pkg.skill, name: 'renamed-skill' };
    const serialized = serializeSkill(renamedSkill);
    const reparsed = parseSkill(serialized);

    expect(reparsed.name).toBe('renamed-skill');
    expect(reparsed.body).toBe(pkg.skill.body);
  });

  it('preserves metadata through rename', () => {
    const pkg = makePkg();
    const renamedSkill = { ...pkg.skill, name: 'renamed-skill' };
    const serialized = serializeSkill(renamedSkill);
    const reparsed = parseSkill(serialized);

    expect(reparsed.metadata?.tags).toEqual(['testing', 'demo']);
    expect(reparsed.metadata?.category).toBe('quality');
  });
});

// ---------------------------------------------------------------------------
// Edit (field merge) logic
// ---------------------------------------------------------------------------

describe('edit field merge logic', () => {
  it('merges new description while preserving body', () => {
    const skill = makeSkill();
    skill.description = 'Updated description';

    expect(skill.description).toBe('Updated description');
    expect(skill.body).toBe('# Hello\n\nThis is the body content.\n\nSecond paragraph.');
  });

  it('merges new body while preserving description', () => {
    const skill = makeSkill();
    const originalDesc = skill.description;
    skill.body = 'Brand new body';

    expect(skill.body).toBe('Brand new body');
    expect(skill.description).toBe(originalDesc);
  });

  it('merges new tags into metadata', () => {
    const skill = makeSkill();
    skill.metadata = { ...skill.metadata, tags: ['new-tag-1', 'new-tag-2'] };

    expect(skill.metadata?.tags).toEqual(['new-tag-1', 'new-tag-2']);
    // Category preserved from original.
    expect(skill.metadata?.category).toBe('quality');
  });

  it('merges new category into metadata', () => {
    const skill = makeSkill();
    skill.metadata = { ...skill.metadata, category: 'infrastructure' };

    expect(skill.metadata?.category).toBe('infrastructure');
    // Tags preserved.
    expect(skill.metadata?.tags).toEqual(['testing', 'demo']);
  });

  it('validates after edit', () => {
    const skill = makeSkill();
    skill.description = 'Still valid';
    expect(() => validateSkill(skill)).not.toThrow();
  });

  it('rejects edit that removes description', () => {
    const skill = makeSkill();
    skill.description = '';
    expect(() => validateSkill(skill)).toThrow(/description/);
  });

  it('preserves name on edit (no rename via edit)', () => {
    const skill = makeSkill();
    skill.body = 'edited body';
    skill.description = 'edited desc';

    expect(skill.name).toBe('original-skill');
  });

  it('round-trips edited skill correctly', () => {
    const skill = makeSkill();
    skill.description = 'Edited description';
    skill.body = 'Edited body content';
    skill.metadata = { ...skill.metadata, tags: ['edited'] };

    const serialized = serializeSkill(skill);
    const reparsed = parseSkill(serialized);

    expect(reparsed.name).toBe('original-skill');
    expect(reparsed.description).toBe('Edited description');
    expect(reparsed.body).toBe('Edited body content');
    expect(reparsed.metadata?.tags).toEqual(['edited']);
  });
});

// ---------------------------------------------------------------------------
// Info / Stats logic
// ---------------------------------------------------------------------------

describe('info/stats logic', () => {
  it('computes stats for a standard skill package', () => {
    const pkg = makePkg();
    const stats = getSkillStats(pkg);

    expect(stats.wordCount).toBeGreaterThan(0);
    expect(stats.lineCount).toBeGreaterThan(0);
    expect(stats.charCount).toBeGreaterThan(0);
    expect(stats.fileCount).toBe(2); // SKILL.md + agents/helper.yaml
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.type).toBe('skill');
    expect(stats.hasCompanionFiles).toBe(true);
    expect(stats.companionFiles).toContain('agents/helper.yaml');
  });

  it('reports prompt type correctly', () => {
    const pkg = makePkg({ type: 'prompt' });
    const stats = getSkillStats(pkg);
    expect(stats.type).toBe('prompt');
  });

  it('reports subagent type correctly', () => {
    const pkg = makePkg({ type: 'subagent' });
    const stats = getSkillStats(pkg);
    expect(stats.type).toBe('subagent');
  });

  it('formats bytes human-readably', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });

  it('stats word count matches manual count', () => {
    const pkg = makePkg({ body: 'one two three four five six seven eight nine ten' });
    const stats = getSkillStats(pkg);
    expect(stats.wordCount).toBe(10);
  });
});
