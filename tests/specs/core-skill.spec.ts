/**
 * Characterization tests for core-skill module.
 *
 * These tests validate the behavioral contracts documented in
 * docs/specs/core-skill.md. They focus on observable behavior,
 * not implementation details.
 *
 * @see docs/specs/core-skill.md
 */

import { describe, it, expect } from 'vitest';

import {
  parseSkill,
  serializeSkill,
  validateSkill,
  extractSkillExtensions,
} from '../../src/core/skill.js';
import { SkillValidationError } from '../../src/core/errors.js';
import type { Skill } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkillMd(fields: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${JSON.stringify(item)}`);
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push('---', '', body);
  return lines.join('\n');
}

function makeSkill(overrides?: Partial<Skill>): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    body: '# Test\n\nBody content.',
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Contract: parseSkill always returns Skill (never throws)
// ---------------------------------------------------------------------------

describe('Spec: parseSkill never throws', () => {
  it('returns Skill with empty strings when frontmatter has no name/description', () => {
    const content = '---\nversion: 1\n---\n\nSome body';
    const skill = parseSkill(content);

    expect(skill.name).toBe('');
    expect(skill.description).toBe('');
    expect(skill.body).toContain('Some body');
  });

  it('returns Skill with empty strings for completely empty frontmatter', () => {
    const content = '---\n---\n\nJust body';
    const skill = parseSkill(content);

    expect(skill.name).toBe('');
    expect(skill.description).toBe('');
    expect(skill.body).toContain('Just body');
  });

  it('extracts name and description from valid frontmatter', () => {
    const content = makeSkillMd(
      { name: 'my-skill', description: 'My description' },
      '# Title\n\nContent here.',
    );
    const skill = parseSkill(content);

    expect(skill.name).toBe('my-skill');
    expect(skill.description).toBe('My description');
    expect(skill.body).toContain('# Title');
  });

  it('puts extra frontmatter fields into metadata', () => {
    const content = makeSkillMd(
      { name: 'sk', description: 'desc', version: '2.0', custom: 'val' },
      'Body',
    );
    const skill = parseSkill(content);

    expect(skill.metadata).toHaveProperty('version', '2.0');
    expect(skill.metadata).toHaveProperty('custom', 'val');
    // name and description must NOT appear in metadata
    expect(skill.metadata).not.toHaveProperty('name');
    expect(skill.metadata).not.toHaveProperty('description');
  });
});

// ---------------------------------------------------------------------------
// Contract: round-trip parseSkill(serializeSkill(skill)) preserves data
// ---------------------------------------------------------------------------

describe('Spec: serialize/parse round-trip', () => {
  it('preserves name, description, body, and metadata', () => {
    const original = makeSkill({
      name: 'fiscal-nfe',
      description: 'Fiscal NFe skill',
      body: '# NFe Operations\n\nDetailed content here.',
      metadata: { tags: ['fiscal', 'ops'], version: '1.0' },
    });

    const serialized = serializeSkill(original);
    const restored = parseSkill(serialized);

    expect(restored.name).toBe(original.name);
    expect(restored.description).toBe(original.description);
    expect(restored.body).toContain('# NFe Operations');
    expect(restored.body).toContain('Detailed content here.');
    expect(restored.metadata?.tags).toEqual(['fiscal', 'ops']);
    expect(restored.metadata?.version).toBe('1.0');
  });

  it('preserves skill with empty metadata', () => {
    const original = makeSkill({ metadata: {} });

    const serialized = serializeSkill(original);
    const restored = parseSkill(serialized);

    expect(restored.name).toBe(original.name);
    expect(restored.description).toBe(original.description);
  });
});

// ---------------------------------------------------------------------------
// Contract: validateSkill rejects missing required fields
// ---------------------------------------------------------------------------

describe('Spec: validateSkill rejects incomplete skills', () => {
  it('throws SkillValidationError when name is empty', () => {
    const skill = makeSkill({ name: '' });

    expect(() => validateSkill(skill)).toThrow(SkillValidationError);
  });

  it('throws SkillValidationError when description is empty', () => {
    const skill = makeSkill({ description: '' });

    expect(() => validateSkill(skill)).toThrow(SkillValidationError);
  });

  it('throws SkillValidationError with both missing, listing both violations', () => {
    const skill = makeSkill({ name: '', description: '' });

    try {
      validateSkill(skill);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SkillValidationError);
      expect((err as SkillValidationError).violations).toHaveLength(2);
    }
  });

  it('does not throw for a valid skill', () => {
    const skill = makeSkill();
    expect(() => validateSkill(skill)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Contract: extractSkillExtensions typed overlay
// ---------------------------------------------------------------------------

describe('Spec: extractSkillExtensions', () => {
  it('extracts tags, targets, and category from metadata', () => {
    const skill = makeSkill({
      metadata: {
        tags: ['fiscal', 'ops'],
        targets: ['claude-code', 'cursor'],
        category: 'fiscal',
      },
    });

    const ext = extractSkillExtensions(skill);

    expect(ext.tags).toEqual(['fiscal', 'ops']);
    expect(ext.targets).toEqual(['claude-code', 'cursor']);
    expect(ext.category).toBe('fiscal');
  });

  it('returns undefined for missing extension fields', () => {
    const skill = makeSkill({ metadata: {} });

    const ext = extractSkillExtensions(skill);

    expect(ext.tags).toBeUndefined();
    expect(ext.targets).toBeUndefined();
    expect(ext.category).toBeUndefined();
  });

  it('filters out invalid targets', () => {
    const skill = makeSkill({
      metadata: { targets: ['claude-code', 'invalid-target', 'cursor'] },
    });

    const ext = extractSkillExtensions(skill);

    expect(ext.targets).toEqual(['claude-code', 'cursor']);
  });

  it('filters out non-string tags', () => {
    const skill = makeSkill({
      metadata: { tags: ['valid', 123, 'also-valid', null] },
    });

    const ext = extractSkillExtensions(skill);

    expect(ext.tags).toEqual(['valid', 'also-valid']);
  });

  it('returns undefined when metadata is undefined', () => {
    const skill = makeSkill({ metadata: undefined });

    const ext = extractSkillExtensions(skill);

    expect(ext.tags).toBeUndefined();
    expect(ext.targets).toBeUndefined();
    expect(ext.category).toBeUndefined();
  });
});
