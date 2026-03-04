import { describe, it, expect } from 'vitest';
import {
  assertSafeSkillName,
  assertSafeRelativePath,
  assertSafePackage,
} from '../../src/core/sanitize.js';
import type { SkillPackage } from '../../src/core/types.js';

describe('assertSafeSkillName', () => {
  it('accepts valid kebab-case names', () => {
    expect(() => assertSafeSkillName('my-skill')).not.toThrow();
    expect(() => assertSafeSkillName('skill123')).not.toThrow();
    expect(() => assertSafeSkillName('a')).not.toThrow();
  });

  it('accepts names with underscores and dots', () => {
    expect(() => assertSafeSkillName('my_skill')).not.toThrow();
    expect(() => assertSafeSkillName('skill.v2')).not.toThrow();
  });

  it('rejects empty names', () => {
    expect(() => assertSafeSkillName('')).toThrow('cannot be empty');
    expect(() => assertSafeSkillName('  ')).toThrow('cannot be empty');
  });

  it('rejects names starting with non-alphanumeric', () => {
    expect(() => assertSafeSkillName('.hidden')).toThrow('invalid characters');
    expect(() => assertSafeSkillName('-start')).toThrow('invalid characters');
    expect(() => assertSafeSkillName('_start')).toThrow('invalid characters');
  });

  it('rejects path traversal attempts', () => {
    expect(() => assertSafeSkillName('../etc/passwd')).toThrow();
    expect(() => assertSafeSkillName('foo/bar')).toThrow();
    expect(() => assertSafeSkillName('foo\\bar')).toThrow();
  });

  it('rejects names with spaces or special chars', () => {
    expect(() => assertSafeSkillName('my skill')).toThrow('invalid characters');
    expect(() => assertSafeSkillName('skill@2')).toThrow('invalid characters');
  });
});

describe('assertSafeRelativePath', () => {
  it('accepts valid relative paths', () => {
    expect(() => assertSafeRelativePath('SKILL.md')).not.toThrow();
    expect(() => assertSafeRelativePath('agents/openai.yaml')).not.toThrow();
    expect(() => assertSafeRelativePath('scripts/run.py')).not.toThrow();
  });

  it('rejects empty paths', () => {
    expect(() => assertSafeRelativePath('')).toThrow('cannot be empty');
  });

  it('rejects absolute paths', () => {
    expect(() => assertSafeRelativePath('/etc/passwd')).toThrow('must be relative');
  });

  it('rejects parent directory traversal', () => {
    expect(() => assertSafeRelativePath('../secret.txt')).toThrow('escape');
    expect(() => assertSafeRelativePath('foo/../../etc/passwd')).toThrow('escape');
  });
});

describe('assertSafePackage', () => {
  it('accepts a valid package', () => {
    const pkg: SkillPackage = {
      skill: { name: 'test-skill', description: 'test', body: '# hi' },
      files: [
        { relativePath: 'SKILL.md', content: '---\nname: test\n---\n' },
        { relativePath: 'agents/openai.yaml', content: 'model: gpt-4' },
      ],
    };
    expect(() => assertSafePackage(pkg)).not.toThrow();
  });

  it('rejects a package with unsafe skill name', () => {
    const pkg: SkillPackage = {
      skill: { name: '../evil', description: 'x', body: '' },
      files: [{ relativePath: 'SKILL.md', content: '' }],
    };
    expect(() => assertSafePackage(pkg)).toThrow();
  });

  it('rejects a package with unsafe file path', () => {
    const pkg: SkillPackage = {
      skill: { name: 'good-name', description: 'x', body: '' },
      files: [{ relativePath: '../../etc/passwd', content: '' }],
    };
    expect(() => assertSafePackage(pkg)).toThrow();
  });
});
