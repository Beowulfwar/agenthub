/**
 * Tests for src/core/stats.ts
 */

import { describe, it, expect } from 'vitest';
import { getSkillStats, formatBytes } from '../../src/core/stats.js';
import type { SkillPackage } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkg(overrides?: Partial<{
  body: string;
  type: string;
  files: { relativePath: string; content: string }[];
}>): SkillPackage {
  const body = overrides?.body ?? 'Hello world, this is a test body.\nSecond line here.';
  return {
    skill: {
      name: 'test-skill',
      description: 'A test skill',
      type: (overrides?.type as 'skill' | 'prompt' | 'subagent' | undefined) ?? undefined,
      body,
      metadata: {},
    },
    files: overrides?.files ?? [
      { relativePath: 'SKILL.md', content: `---\nname: test-skill\n---\n${body}` },
    ],
  };
}

// ---------------------------------------------------------------------------
// getSkillStats
// ---------------------------------------------------------------------------

describe('getSkillStats', () => {
  it('counts words correctly', () => {
    const pkg = makePkg({ body: 'one two three four five' });
    const stats = getSkillStats(pkg);
    expect(stats.wordCount).toBe(5);
  });

  it('counts lines correctly', () => {
    const pkg = makePkg({ body: 'line1\nline2\nline3' });
    const stats = getSkillStats(pkg);
    expect(stats.lineCount).toBe(3);
  });

  it('counts characters correctly', () => {
    const pkg = makePkg({ body: 'abcdef' });
    const stats = getSkillStats(pkg);
    expect(stats.charCount).toBe(6);
  });

  it('handles empty body', () => {
    const pkg = makePkg({ body: '' });
    const stats = getSkillStats(pkg);
    expect(stats.wordCount).toBe(0);
    expect(stats.lineCount).toBe(0);
    expect(stats.charCount).toBe(0);
  });

  it('counts files correctly', () => {
    const pkg = makePkg({
      files: [
        { relativePath: 'SKILL.md', content: '---\nname: x\n---\nbody' },
        { relativePath: 'agents/helper.yaml', content: 'key: val' },
        { relativePath: 'scripts/run.sh', content: '#!/bin/bash' },
      ],
    });
    const stats = getSkillStats(pkg);
    expect(stats.fileCount).toBe(3);
  });

  it('computes total bytes from all files', () => {
    const content1 = 'hello';
    const content2 = 'world';
    const pkg = makePkg({
      files: [
        { relativePath: 'SKILL.md', content: content1 },
        { relativePath: 'agents/a.yaml', content: content2 },
      ],
    });
    const stats = getSkillStats(pkg);
    expect(stats.totalBytes).toBe(
      Buffer.byteLength(content1, 'utf-8') + Buffer.byteLength(content2, 'utf-8'),
    );
  });

  it('identifies companion files (excludes marker)', () => {
    const pkg = makePkg({
      files: [
        { relativePath: 'SKILL.md', content: 'marker' },
        { relativePath: 'agents/a.yaml', content: 'agent' },
        { relativePath: 'scripts/run.sh', content: 'script' },
      ],
    });
    const stats = getSkillStats(pkg);
    expect(stats.hasCompanionFiles).toBe(true);
    expect(stats.companionFiles).toEqual(['agents/a.yaml', 'scripts/run.sh']);
  });

  it('reports no companion files for single-file package', () => {
    const pkg = makePkg({
      files: [{ relativePath: 'SKILL.md', content: 'marker' }],
    });
    const stats = getSkillStats(pkg);
    expect(stats.hasCompanionFiles).toBe(false);
    expect(stats.companionFiles).toEqual([]);
  });

  it('uses skill type from package', () => {
    const pkg = makePkg({ type: 'prompt' });
    const stats = getSkillStats(pkg);
    expect(stats.type).toBe('prompt');
  });

  it('defaults type to skill when absent', () => {
    const pkg = makePkg();
    const stats = getSkillStats(pkg);
    expect(stats.type).toBe('skill');
  });

  it('excludes all marker files from companion list', () => {
    const pkg = makePkg({
      files: [
        { relativePath: 'PROMPT.md', content: 'marker' },
        { relativePath: 'examples/ex1.md', content: 'example' },
      ],
    });
    const stats = getSkillStats(pkg);
    expect(stats.companionFiles).toEqual(['examples/ex1.md']);
  });

  it('handles multi-byte characters in byte count', () => {
    const utf8Content = 'Olá mundo! 🌍';
    const pkg = makePkg({
      files: [{ relativePath: 'SKILL.md', content: utf8Content }],
    });
    const stats = getSkillStats(pkg);
    expect(stats.totalBytes).toBe(Buffer.byteLength(utf8Content, 'utf-8'));
    // UTF-8: "á" = 2 bytes, "🌍" = 4 bytes → more bytes than chars
    expect(stats.totalBytes).toBeGreaterThan(utf8Content.length);
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(4300)).toBe('4.2 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(2_500_000)).toBe('2.4 MB');
  });

  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });
});
