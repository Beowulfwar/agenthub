import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { detectAppArtifacts, readDetectedArtifactContent } from './app-artifacts.js';
import { getAgentAppDefinition } from './app-registry.js';
import { loadSkillPackage, serializeSkill } from './skill.js';
import type {
  AgentAppId,
  AppMigrationPlan,
  ArtifactKind,
  ArtifactLossiness,
  DetectedAppArtifact,
  MigrationPlanItem,
  Skill,
} from './types.js';

interface PlanMigrationParams {
  workspaceDir: string;
  fromApp: AgentAppId;
  toApp: AgentAppId;
  skill?: string;
  all?: boolean;
}

interface ExecuteMigrationParams extends PlanMigrationParams {
  force?: boolean;
}

const SUPPORTED_EXECUTION_PAIRS = new Set<string>([
  'codex->claude-code',
  'claude-code->codex',
  'cursor->claude-code',
  'claude-code->cursor',
  'cursor->windsurf',
  'windsurf->cursor',
  'cursor->continue',
  'continue->cursor',
  'cursor->cline',
  'cline->cursor',
]);

export async function planAppMigration(params: PlanMigrationParams): Promise<AppMigrationPlan> {
  const workspaceDir = path.resolve(params.workspaceDir);
  const fromApp = getAgentAppDefinition(params.fromApp);
  const toApp = getAgentAppDefinition(params.toApp);

  if (!fromApp) {
    throw new Error(`Unknown source app: ${params.fromApp}`);
  }
  if (!toApp) {
    throw new Error(`Unknown target app: ${params.toApp}`);
  }

  const blockedReasons: string[] = [];
  const manualSteps: string[] = [];

  if (toApp.supportLevel === 'official_app_unverified_layout') {
    blockedReasons.push(`${toApp.label} ainda nao possui layout local oficial suficientemente verificavel para migracao automatica.`);
  }

  const artifacts = await detectAppArtifacts(workspaceDir);
  let sourceArtifacts = artifacts.filter((artifact) => artifact.appId === params.fromApp);

  if (params.skill) {
    sourceArtifacts = sourceArtifacts.filter((artifact) => artifact.name === params.skill);
  } else if (!params.all) {
    sourceArtifacts = sourceArtifacts.slice(0, 1);
  }

  if (sourceArtifacts.length === 0) {
    blockedReasons.push(
      params.skill
        ? `Nenhum artefato "${params.skill}" foi encontrado para ${fromApp.label} em ${workspaceDir}.`
        : `Nenhum artefato foi encontrado para ${fromApp.label} em ${workspaceDir}.`,
    );
  }

  if (params.toApp === 'cline' && sourceArtifacts.length > 1) {
    blockedReasons.push('Cline usa um unico arquivo .clinerules. Selecione apenas um artefato por vez.');
  }

  const items = await Promise.all(
    sourceArtifacts.map((artifact) => planMigrationItem(workspaceDir, artifact, params.toApp)),
  );

  const executable =
    blockedReasons.length === 0
    && items.every((item) => item.migratable)
    && isSupportedExecutionPair(params.fromApp, params.toApp);

  if (!isSupportedExecutionPair(params.fromApp, params.toApp)) {
    blockedReasons.push(`A rota ${fromApp.label} -> ${toApp.label} esta disponivel apenas como planejamento nesta versao.`);
  }

  if (items.some((item) => item.manualSteps.length > 0)) {
    manualSteps.push(...items.flatMap((item) => item.manualSteps));
  }

  return {
    fromApp: params.fromApp,
    toApp: params.toApp,
    workspaceDir,
    executable,
    plannedCount: items.filter((item) => item.migratable).length,
    blockedCount: items.filter((item) => !item.migratable).length + blockedReasons.length,
    items,
    blockedReasons: uniqueStrings(blockedReasons),
    manualSteps: uniqueStrings(manualSteps),
  };
}

export async function executeAppMigration(params: ExecuteMigrationParams): Promise<AppMigrationPlan> {
  const plan = await planAppMigration(params);
  if (!plan.executable) {
    return plan;
  }

  for (const item of plan.items) {
    if (!item.migratable) continue;
    await applyMigrationItem(params.workspaceDir, plan.fromApp, plan.toApp, item);
  }

  return plan;
}

async function planMigrationItem(
  workspaceDir: string,
  artifact: DetectedAppArtifact,
  toApp: AgentAppId,
): Promise<MigrationPlanItem> {
  const route = `${artifact.appId}->${toApp}`;

  if (toApp === 'antigravity') {
    return blockedItem(artifact, artifact.detectedPath, artifact.artifactKind, [
      'Antigravity nao possui repositorio local oficial verificavel para escrita automatica.',
    ]);
  }

  switch (route) {
    case 'codex->claude-code':
      return buildPackageToFilePlan(artifact, workspaceDir, '.claude', {
        skill_package: { subdir: 'commands', kind: 'command_file', lossiness: 'lossy_with_explicit_warning', warning: 'Arquivos auxiliares e frontmatter do pacote Codex nao sao preservados no arquivo Claude Code.' },
        prompt_file: { subdir: 'prompts', kind: 'prompt_file', lossiness: 'lossless' },
        subagent_file: { subdir: 'agents', kind: 'subagent_file', lossiness: 'lossless' },
      });
    case 'claude-code->codex':
      return buildFileToPackagePlan(artifact, workspaceDir, '.codex', {
        command_file: { subdir: 'skills', kind: 'skill_package', lossiness: 'lossy_with_explicit_warning', warning: 'A migracao para Codex gera um SKILL.md com descricao sintetica; revise antes de publicar.' },
        prompt_file: { subdir: 'prompts', kind: 'prompt_file', lossiness: 'lossless' },
        subagent_file: { subdir: 'agents', kind: 'subagent_file', lossiness: 'lossless' },
      });
    case 'cursor->claude-code':
      return buildFileToFilePlan(artifact, workspaceDir, '.claude', {
        rule_file: { subdir: 'commands', kind: 'command_file', lossiness: 'lossless' },
        prompt_file: { subdir: 'prompts', kind: 'prompt_file', lossiness: 'lossless' },
        subagent_file: { subdir: 'agents', kind: 'subagent_file', lossiness: 'lossless' },
      });
    case 'claude-code->cursor':
      return buildFileToFilePlan(artifact, workspaceDir, '.cursor', {
        command_file: { subdir: 'rules', kind: 'rule_file', lossiness: 'lossless' },
        prompt_file: { subdir: 'prompts', kind: 'prompt_file', lossiness: 'lossless' },
        subagent_file: { subdir: 'agents', kind: 'subagent_file', lossiness: 'lossless' },
      });
    case 'cursor->windsurf':
      return buildFileToFilePlan(artifact, workspaceDir, '.windsurf', {
        rule_file: { subdir: 'rules', kind: 'rule_file', lossiness: 'lossless' },
      });
    case 'windsurf->cursor':
      return buildFileToFilePlan(artifact, workspaceDir, '.cursor', {
        rule_file: { subdir: 'rules', kind: 'rule_file', lossiness: 'lossless' },
      });
    case 'cursor->continue':
      return buildFileToFilePlan(artifact, workspaceDir, '.continue', {
        rule_file: { subdir: 'rules', kind: 'rule_file', lossiness: 'lossless' },
      });
    case 'continue->cursor':
      return buildFileToFilePlan(artifact, workspaceDir, '.cursor', {
        rule_file: { subdir: 'rules', kind: 'rule_file', lossiness: 'lossless' },
      });
    case 'cursor->cline': {
      if (artifact.artifactKind !== 'rule_file') {
        return blockedItem(artifact, path.join(workspaceDir, '.clinerules'), 'rule_file', [
          'Apenas regras markdown simples podem migrar para Cline nesta versao.',
        ]);
      }
      return {
        name: artifact.name,
        sourcePath: artifact.detectedPath,
        sourceKind: artifact.artifactKind,
        targetPath: path.join(workspaceDir, '.clinerules'),
        targetKind: 'rule_file',
        action: 'generate',
        migratable: true,
        lossiness: 'lossless',
        warnings: [],
        blockedReasons: [],
        generatedFiles: [path.join(workspaceDir, '.clinerules')],
        manualSteps: [],
      };
    }
    case 'cline->cursor':
      return {
        name: artifact.name,
        sourcePath: artifact.detectedPath,
        sourceKind: artifact.artifactKind,
        targetPath: path.join(workspaceDir, '.cursor', 'rules', `${artifact.name}.md`),
        targetKind: 'rule_file',
        action: 'copy',
        migratable: artifact.artifactKind === 'rule_file',
        lossiness: artifact.artifactKind === 'rule_file' ? 'lossless' : 'not_migratable',
        warnings: [],
        blockedReasons: artifact.artifactKind === 'rule_file' ? [] : ['Apenas regras markdown simples podem sair de Cline nesta versao.'],
        generatedFiles: [path.join(workspaceDir, '.cursor', 'rules', `${artifact.name}.md`)],
        manualSteps: [],
      };
    default:
      return blockedItem(artifact, artifact.expectedPath, artifact.artifactKind, [
        `Nao existe adaptador oficial implementado para ${artifact.appLabel} -> ${toApp}.`,
      ]);
  }
}

async function applyMigrationItem(
  workspaceDir: string,
  fromApp: AgentAppId,
  toApp: AgentAppId,
  item: MigrationPlanItem,
): Promise<void> {
  const sourceArtifacts = await detectAppArtifacts(workspaceDir);
  const source = sourceArtifacts.find((artifact) => artifact.appId === fromApp && artifact.detectedPath === item.sourcePath);
  if (!source) {
    throw new Error(`Fonte da migracao nao encontrada: ${item.sourcePath}`);
  }

  if (toApp === 'codex') {
    await writePackageArtifact(source, item);
    return;
  }

  const content = await renderTargetContent(source, toApp);
  await mkdir(path.dirname(item.targetPath), { recursive: true });
  await writeFile(item.targetPath, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
}

async function writePackageArtifact(source: DetectedAppArtifact, item: MigrationPlanItem): Promise<void> {
  const marker = item.targetKind === 'prompt_file'
    ? 'PROMPT.md'
    : item.targetKind === 'subagent_file'
      ? 'AGENT.md'
      : 'SKILL.md';
  const targetDir = item.targetPath;
  const content = await renderTargetContent(source, 'codex');
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, marker), content, 'utf-8');
}

async function renderTargetContent(source: DetectedAppArtifact, toApp: AgentAppId): Promise<string> {
  if (toApp === 'codex') {
    const skill = await buildSkillForPackage(source);
    return serializeSkill(skill);
  }

  const sourceStat = await stat(source.detectedPath).catch(() => null);
  if (source.artifactKind === 'skill_package' || sourceStat?.isDirectory()) {
    const pkg = await loadSkillPackage(source.detectedPath);
    return `${pkg.skill.body}\n`;
  }

  const content = await readDetectedArtifactContent(source);
  if (content === null) {
    throw new Error(`Nao foi possivel ler o conteudo de ${source.detectedPath}`);
  }

  return content.endsWith('\n') ? content : `${content}\n`;
}

async function buildSkillForPackage(source: DetectedAppArtifact): Promise<Skill> {
  const sourceStat = await stat(source.detectedPath).catch(() => null);
  if (source.artifactKind === 'skill_package' || sourceStat?.isDirectory()) {
    const pkg = await loadSkillPackage(source.detectedPath);
    return pkg.skill;
  }

  const content = await readDetectedArtifactContent(source);
  if (content === null) {
    throw new Error(`Nao foi possivel ler o conteudo de ${source.detectedPath}`);
  }

  return {
    name: source.name,
    description: `Migrated from ${source.appLabel}. Review this generated description.`,
    body: content.trim(),
    ...(source.artifactKind === 'prompt_file'
      ? { type: 'prompt' as const }
      : source.artifactKind === 'subagent_file'
        ? { type: 'subagent' as const }
        : {}),
    metadata: {
      migratedFrom: source.appId,
      migratedFromPath: source.detectedPath,
    },
  };
}

function buildPackageToFilePlan(
  artifact: DetectedAppArtifact,
  workspaceDir: string,
  targetRoot: '.claude' | '.codex' | '.cursor',
  mapping: Partial<Record<ArtifactKind, { subdir: string; kind: ArtifactKind; lossiness: ArtifactLossiness; warning?: string }>>,
): MigrationPlanItem {
  const target = mapping[artifact.artifactKind];
  if (!target) {
    return blockedItem(artifact, artifact.detectedPath, artifact.artifactKind, [
      `O artefato ${artifact.artifactKind} nao possui mapeamento oficial para este destino.`,
    ]);
  }

  const targetPath = path.join(workspaceDir, targetRoot, target.subdir, `${artifact.name}.md`);
  return {
    name: artifact.name,
    sourcePath: artifact.detectedPath,
    sourceKind: artifact.artifactKind,
    targetPath,
    targetKind: target.kind,
    action: 'generate',
    migratable: true,
    lossiness: target.lossiness,
    warnings: target.warning ? [target.warning] : [],
    blockedReasons: [],
    generatedFiles: [targetPath],
    manualSteps: [],
  };
}

function buildFileToPackagePlan(
  artifact: DetectedAppArtifact,
  workspaceDir: string,
  targetRoot: '.claude' | '.codex' | '.cursor',
  mapping: Partial<Record<ArtifactKind, { subdir: string; kind: ArtifactKind; lossiness: ArtifactLossiness; warning?: string }>>,
): MigrationPlanItem {
  const target = mapping[artifact.artifactKind];
  if (!target) {
    return blockedItem(artifact, artifact.detectedPath, artifact.artifactKind, [
      `O artefato ${artifact.artifactKind} nao possui mapeamento oficial para este destino.`,
    ]);
  }

  const targetDir = path.join(workspaceDir, targetRoot, target.subdir, artifact.name);
  const marker = target.kind === 'prompt_file'
    ? 'PROMPT.md'
    : target.kind === 'subagent_file'
      ? 'AGENT.md'
      : 'SKILL.md';

  return {
    name: artifact.name,
    sourcePath: artifact.detectedPath,
    sourceKind: artifact.artifactKind,
    targetPath: targetDir,
    targetKind: target.kind,
    action: 'generate',
    migratable: true,
    lossiness: target.lossiness,
    warnings: target.warning ? [target.warning] : [],
    blockedReasons: [],
    generatedFiles: [path.join(targetDir, marker)],
    manualSteps: target.warning ? ['Revise o SKILL.md/PROMPT.md/AGENT.md gerado antes de publicar ou sincronizar.'] : [],
  };
}

function buildFileToFilePlan(
  artifact: DetectedAppArtifact,
  workspaceDir: string,
  targetRoot: '.claude' | '.codex' | '.cursor' | '.windsurf' | '.continue',
  mapping: Partial<Record<ArtifactKind, { subdir: string; kind: ArtifactKind; lossiness: ArtifactLossiness; warning?: string }>>,
): MigrationPlanItem {
  const target = mapping[artifact.artifactKind];
  if (!target) {
    return blockedItem(artifact, artifact.detectedPath, artifact.artifactKind, [
      `O artefato ${artifact.artifactKind} nao possui mapeamento oficial para este destino.`,
    ]);
  }

  const targetPath = path.join(workspaceDir, targetRoot, target.subdir, `${artifact.name}.md`);
  return {
    name: artifact.name,
    sourcePath: artifact.detectedPath,
    sourceKind: artifact.artifactKind,
    targetPath,
    targetKind: target.kind,
    action: 'copy',
    migratable: true,
    lossiness: target.lossiness,
    warnings: target.warning ? [target.warning] : [],
    blockedReasons: [],
    generatedFiles: [targetPath],
    manualSteps: [],
  };
}

function blockedItem(
  artifact: DetectedAppArtifact,
  targetPath: string,
  targetKind: ArtifactKind,
  blockedReasons: string[],
): MigrationPlanItem {
  return {
    name: artifact.name,
    sourcePath: artifact.detectedPath,
    sourceKind: artifact.artifactKind,
    targetPath,
    targetKind,
    action: 'manual',
    migratable: false,
    lossiness: 'not_migratable',
    warnings: [],
    blockedReasons,
    generatedFiles: [],
    manualSteps: [],
  };
}

function isSupportedExecutionPair(fromApp: AgentAppId, toApp: AgentAppId): boolean {
  return SUPPORTED_EXECUTION_PAIRS.has(`${fromApp}->${toApp}`);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
