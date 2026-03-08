import { access, mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';

import type { ContentType } from './types.js';
import { detectContentType } from './skill.js';

const TYPE_DIRS: Record<ContentType, string> = {
  skill: 'skills',
  prompt: 'prompts',
  subagent: 'subagents',
};

export interface StorageLayoutMigrationItem {
  name: string;
  type: ContentType;
  sourcePath: string;
  destinationPath: string;
  status: 'ready' | 'conflict';
  reason?: string;
}

export interface StorageLayoutMigrationReport {
  rootDir: string;
  items: StorageLayoutMigrationItem[];
  movableCount: number;
  conflictCount: number;
}

export async function planStorageLayoutMigration(rootDir: string): Promise<StorageLayoutMigrationReport> {
  const normalizedRoot = path.resolve(rootDir);
  const entries = await readdir(normalizedRoot, { withFileTypes: true }).catch(() => []);
  const items: StorageLayoutMigrationItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if ((Object.values(TYPE_DIRS) as string[]).includes(entry.name)) continue;

    const sourcePath = path.join(normalizedRoot, entry.name);
    const type = await detectContentType(sourcePath).catch(() => null);
    if (!type) continue;

    const destinationPath = path.join(normalizedRoot, TYPE_DIRS[type], entry.name);
    const conflict = await pathExists(destinationPath);

    items.push({
      name: entry.name,
      type,
      sourcePath,
      destinationPath,
      status: conflict ? 'conflict' : 'ready',
      ...(conflict ? { reason: 'Ja existe um diretorio canonico para este type/name.' } : {}),
    });
  }

  items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  return {
    rootDir: normalizedRoot,
    items,
    movableCount: items.filter((item) => item.status === 'ready').length,
    conflictCount: items.filter((item) => item.status === 'conflict').length,
  };
}

export async function applyStorageLayoutMigration(rootDir: string): Promise<StorageLayoutMigrationReport> {
  const report = await planStorageLayoutMigration(rootDir);

  for (const item of report.items.filter((entry) => entry.status === 'ready')) {
    await mkdir(path.dirname(item.destinationPath), { recursive: true });
    await rename(item.sourcePath, item.destinationPath);
  }

  return report;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
