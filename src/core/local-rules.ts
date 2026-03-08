import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AgentAppId } from './types.js';
import { assertSafeSkillName } from './sanitize.js';

const WRITABLE_RULE_APPS = new Set<AgentAppId>(['cursor']);
const ALLOWED_RULE_EXTENSIONS = new Set(['.md', '.mdc']);

function assertWritableRuleApp(appId: AgentAppId): void {
  if (!WRITABLE_RULE_APPS.has(appId)) {
    throw new Error(`Regras locais com escrita ainda nao sao suportadas para "${appId}".`);
  }
}

function isPathInsideWorkspace(workspaceDir: string, filePath: string): boolean {
  const normalizedWorkspace = path.resolve(workspaceDir);
  const normalizedPath = path.resolve(filePath);
  return normalizedPath === normalizedWorkspace || normalizedPath.startsWith(`${normalizedWorkspace}${path.sep}`);
}

function resolveCursorRulePath(workspaceDir: string, name: string): string {
  assertSafeSkillName(name);
  return path.join(path.resolve(workspaceDir), '.cursor', 'rules', `${name}.md`);
}

function resolveRulePath(params: {
  workspaceDir: string;
  appId: AgentAppId;
  name: string;
  detectedPath?: string;
}): string {
  assertWritableRuleApp(params.appId);

  if (params.detectedPath) {
    const absolutePath = path.resolve(params.detectedPath);
    if (!isPathInsideWorkspace(params.workspaceDir, absolutePath)) {
      throw new Error('O caminho da regra deve permanecer dentro do workspace.');
    }

    const ext = path.extname(absolutePath).toLowerCase();
    if (!ALLOWED_RULE_EXTENSIONS.has(ext)) {
      throw new Error(`Extensao de regra nao suportada: "${ext || '(sem extensao)'}".`);
    }

    return absolutePath;
  }

  return resolveCursorRulePath(params.workspaceDir, params.name);
}

export async function readLocalWorkspaceRule(params: {
  workspaceDir: string;
  appId: AgentAppId;
  name: string;
  detectedPath?: string;
}): Promise<{ path: string; content: string }> {
  const filePath = resolveRulePath(params);
  const content = await readFile(filePath, 'utf-8');
  return { path: filePath, content };
}

export async function upsertLocalWorkspaceRule(params: {
  workspaceDir: string;
  appId: AgentAppId;
  name: string;
  content: string;
  detectedPath?: string;
}): Promise<{ path: string; created: boolean }> {
  const filePath = resolveRulePath(params);
  let created = false;

  try {
    await access(filePath);
  } catch {
    created = true;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${params.content.replace(/\r\n/g, '\n').trimEnd()}\n`, 'utf-8');

  return { path: filePath, created };
}

export async function deleteLocalWorkspaceRule(params: {
  workspaceDir: string;
  appId: AgentAppId;
  name: string;
  detectedPath?: string;
}): Promise<{ path: string }> {
  assertWritableRuleApp(params.appId);
  const candidates = params.detectedPath
    ? [resolveRulePath(params)]
    : [
        resolveCursorRulePath(params.workspaceDir, params.name),
        path.join(path.resolve(params.workspaceDir), '.cursor', 'rules', `${params.name}.mdc`),
      ];

  for (const filePath of candidates) {
    try {
      await access(filePath);
      await rm(filePath);
      return { path: filePath };
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Regra local "${params.name}" nao encontrada.`);
}
