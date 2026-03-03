import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseSkill, serializeSkill, validateSkill } from '../../src/core/skill.js';
import { SkillValidationError } from '../../src/core/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'sample-skill.md');

describe('parseSkill', () => {
  it('parses a SKILL.md with name, description, and body', () => {
    const content = [
      '---',
      'name: "hello-world"',
      'description: "A simple greeting skill"',
      '---',
      '',
      '# Hello World',
      '',
      'This skill says hello.',
    ].join('\n');

    const skill = parseSkill(content);

    expect(skill.name).toBe('hello-world');
    expect(skill.description).toBe('A simple greeting skill');
    expect(skill.body).toContain('# Hello World');
    expect(skill.body).toContain('This skill says hello.');
  });

  it('parses a SKILL.md with extra metadata fields', () => {
    const content = [
      '---',
      'name: "advanced-skill"',
      'description: "Has extra metadata"',
      'tags:',
      '  - testing',
      '  - advanced',
      'version: "1.2.0"',
      '---',
      '',
      'Body content here.',
    ].join('\n');

    const skill = parseSkill(content);

    expect(skill.name).toBe('advanced-skill');
    expect(skill.description).toBe('Has extra metadata');
    expect(skill.metadata).toBeDefined();
    expect(skill.metadata!.tags).toEqual(['testing', 'advanced']);
    expect(skill.metadata!.version).toBe('1.2.0');
  });

  it('parses the fixture file correctly', async () => {
    const content = await readFile(FIXTURE_PATH, 'utf-8');
    const skill = parseSkill(content);

    expect(skill.name).toBe('test-skill');
    expect(skill.description).toBe('A test skill for unit tests');
    expect(skill.metadata!.tags).toEqual(['testing', 'sample']);
    expect(skill.body).toContain('# Test Skill');
    expect(skill.body).toContain('## Usage');
  });

  it('returns empty name and description when frontmatter lacks them', () => {
    const content = [
      '---',
      'author: "someone"',
      '---',
      '',
      'Just a body.',
    ].join('\n');

    const skill = parseSkill(content);

    expect(skill.name).toBe('');
    expect(skill.description).toBe('');
    expect(skill.metadata!.author).toBe('someone');
  });
});

describe('serializeSkill', () => {
  it('produces a string with YAML frontmatter and body', () => {
    const skill = {
      name: 'my-skill',
      description: 'My description',
      body: '# Title\n\nSome content.',
      metadata: {},
    };

    const output = serializeSkill(skill);

    expect(output).toContain('name: my-skill');
    expect(output).toContain('description: My description');
    expect(output).toContain('# Title');
    expect(output).toContain('Some content.');
    // Should have frontmatter delimiters
    expect(output).toContain('---');
  });

  it('includes metadata fields in frontmatter', () => {
    const skill = {
      name: 'tagged-skill',
      description: 'Has tags',
      body: 'Body text.',
      metadata: { version: '2.0.0' },
    };

    const output = serializeSkill(skill);

    expect(output).toContain('version:');
    expect(output).toContain('2.0.0');
  });
});

describe('parseSkill / serializeSkill round-trip', () => {
  it('parse then serialize preserves name, description, and body', () => {
    const original = [
      '---',
      'name: "round-trip-skill"',
      'description: "Tests the round trip"',
      'tags:',
      '  - alpha',
      '  - beta',
      '---',
      '',
      '# Round Trip',
      '',
      'This content should survive the round trip.',
    ].join('\n');

    const skill = parseSkill(original);
    const serialized = serializeSkill(skill);
    const reparsed = parseSkill(serialized);

    expect(reparsed.name).toBe(skill.name);
    expect(reparsed.description).toBe(skill.description);
    expect(reparsed.body).toBe(skill.body);
    expect(reparsed.metadata!.tags).toEqual(skill.metadata!.tags);
  });
});

describe('validateSkill', () => {
  it('throws SkillValidationError when name is empty', () => {
    const skill = {
      name: '',
      description: 'Valid description',
      body: 'body',
    };

    expect(() => validateSkill(skill)).toThrow(SkillValidationError);
  });

  it('throws SkillValidationError when description is empty', () => {
    const skill = {
      name: 'valid-name',
      description: '',
      body: 'body',
    };

    expect(() => validateSkill(skill)).toThrow(SkillValidationError);
  });

  it('throws with both violations when both name and description are empty', () => {
    const skill = {
      name: '',
      description: '',
      body: 'body',
    };

    try {
      validateSkill(skill);
      // Should not reach here
      expect.unreachable('validateSkill should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SkillValidationError);
      const validationErr = err as InstanceType<typeof SkillValidationError>;
      expect(validationErr.violations).toHaveLength(2);
    }
  });

  it('passes for a valid skill', () => {
    const skill = {
      name: 'good-skill',
      description: 'A perfectly valid skill',
      body: '# Content',
    };

    // Should not throw
    expect(() => validateSkill(skill)).not.toThrow();
  });

  it('throws when name is only whitespace', () => {
    const skill = {
      name: '   ',
      description: 'Valid',
      body: 'body',
    };

    expect(() => validateSkill(skill)).toThrow(SkillValidationError);
  });
});
