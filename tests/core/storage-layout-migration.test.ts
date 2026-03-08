import { beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyStorageLayoutMigration, planStorageLayoutMigration } from '../../src/core/storage-layout-migration.js';
import { serializeSkill } from '../../src/core/skill.js';

const TEST_ROOT = path.join(os.tmpdir(), 'ahub-storage-layout-migration-test');

async function writeLegacyContent(name: string, markerFile: 'SKILL.md' | 'PROMPT.md' | 'AGENT.md') {
  const dir = path.join(TEST_ROOT, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, markerFile),
    serializeSkill({
      name,
      description: `Descricao ${name}`,
      body: `# ${name}\n\nConteudo`,
      ...(markerFile === 'PROMPT.md'
        ? { type: 'prompt' as const }
        : markerFile === 'AGENT.md'
          ? { type: 'subagent' as const }
          : {}),
      metadata: {},
    }),
    'utf-8',
  );
}

describe('storage-layout-migration', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true });
    await mkdir(TEST_ROOT, { recursive: true });
  });

  it('plans legacy flat directories into typed destinations', async () => {
    await writeLegacyContent('alpha', 'SKILL.md');
    await writeLegacyContent('beta', 'PROMPT.md');

    const report = await planStorageLayoutMigration(TEST_ROOT);

    expect(report.items.map((item) => `${item.type}:${item.name}:${item.status}`)).toEqual([
      'prompt:beta:ready',
      'skill:alpha:ready',
    ]);
    expect(report.movableCount).toBe(2);
    expect(report.conflictCount).toBe(0);
  });

  it('marks conflicts when canonical destination already exists', async () => {
    await writeLegacyContent('alpha', 'SKILL.md');
    await mkdir(path.join(TEST_ROOT, 'skills', 'alpha'), { recursive: true });
    await writeFile(path.join(TEST_ROOT, 'skills', 'alpha', 'SKILL.md'), '# conflict\n', 'utf-8');

    const report = await planStorageLayoutMigration(TEST_ROOT);

    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.status).toBe('conflict');
    expect(report.conflictCount).toBe(1);
  });

  it('applies the migration by renaming ready entries into typed folders', async () => {
    await writeLegacyContent('agent-one', 'AGENT.md');

    const report = await applyStorageLayoutMigration(TEST_ROOT);

    expect(report.movableCount).toBe(1);
    await expect(access(path.join(TEST_ROOT, 'subagents', 'agent-one', 'AGENT.md'))).resolves.toBeUndefined();
    await expect(access(path.join(TEST_ROOT, 'agent-one'))).rejects.toThrow();
  });
});
