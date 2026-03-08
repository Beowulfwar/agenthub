import { createHash } from 'node:crypto';
import path from 'node:path';

import { formatContentRef, parseContentRef } from './content-ref.js';
import { detectLocalSkills } from './explorer.js';
import { buildWorkspaceAppInventories, readDetectedArtifactContent } from './app-artifacts.js';
import { getMarkerFile, loadSkillPackage, serializeSkill } from './skill.js';
import { addContentTargetToManifest, loadWorkspaceManifest, removeContentTargetFromManifest, saveWorkspaceManifest, setSkillTargetsInManifest, resolveManifestSkills } from './workspace.js';
import { inspectDeployTargets, resolveDeployTargetRoot } from './config.js';
import { buildCloudSkillsCatalog, loadProviderSkillIndex } from './workspace-catalog.js';
import { createDeployer } from '../deploy/deployer.js';
import type { StorageProvider } from '../storage/provider.js';
import type {
  AhubConfig,
  ArtifactLossiness,
  ContentRef,
  ContentType,
  DeployTarget,
  DetectedLocalSkill,
  Skill,
  SkillPackage,
  SkillsHubActionFailure,
  SkillsHubActionResult,
  SkillsHubActionSuccess,
  SkillsHubCloudItem,
  SkillsHubDiffResult,
  SkillsHubDiffSide,
  SkillsHubShell,
  SkillsHubStatus,
  SkillsHubWorkspaceAgentDetail,
  SkillsHubWorkspaceDetail,
  SkillsHubWorkspaceRule,
  SkillsHubWorkspaceRulesSection,
  SkillsHubWorkspaceSkill,
  SkillsHubWorkspaceSummary,
  WorkspaceManifest,
} from './types.js';

interface ProviderPackageLoader {
  get(ref: ContentRef): Promise<SkillPackage | null>;
}

interface ProviderIndexEntry {
  name: string;
  type: ContentType;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
}

interface LocalSkillSnapshot {
  entry: DetectedLocalSkill;
  pkg: SkillPackage;
  preview: string;
  compareHash: string;
  lossiness: ArtifactLossiness;
  warning?: string;
}

interface CloudSkillSnapshot {
  pkg: SkillPackage;
  preview: string;
  compareHash: string;
}

export async function buildSkillsHubShell(params: {
  config: AhubConfig;
  provider: StorageProvider;
  registry: { active?: string; paths: string[] };
  query?: string;
  type?: ContentType;
  category?: string;
  tag?: string;
}): Promise<SkillsHubShell> {
  const providerIndex = await loadProviderSkillIndex(params.provider);
  const packageLoader = createProviderPackageLoader(params.provider);
  const cloudCatalog = await buildCloudSkillsCatalog({
    provider: params.provider,
    loadManifest: loadWorkspaceManifest,
    query: params.query,
    type: params.type,
    category: params.category,
    tag: params.tag,
  });

  const workspaceSummaries: SkillsHubWorkspaceSummary[] = [];
  const usageBySkill = new Map<string, { workspaces: Set<string>; diverged: Set<string> }>();

  for (const filePath of params.registry.paths) {
    const detail = await buildSkillsHubWorkspaceDetail({
      config: params.config,
      filePath,
      isActive: params.registry.active === filePath,
      providerIndex,
      packageLoader,
    });

    workspaceSummaries.push(toWorkspaceSummary(detail));

    for (const agent of detail.agents) {
      for (const skill of agent.skills) {
        if (!skill.installedLocally) {
          continue;
        }

        const usageKey = formatContentRef({ type: skill.type ?? 'skill', name: skill.name });
        const usage = usageBySkill.get(usageKey) ?? {
          workspaces: new Set<string>(),
          diverged: new Set<string>(),
        };
        usage.workspaces.add(detail.filePath);
        if (skill.status === 'diverged') {
          usage.diverged.add(detail.filePath);
        }
        usageBySkill.set(usageKey, usage);
      }
    }
  }

  const cloudItems: SkillsHubCloudItem[] = cloudCatalog.items.map((item) => {
    const usage = usageBySkill.get(formatContentRef({ type: item.type, name: item.name }));
    return {
      contentId: formatContentRef({ type: item.type, name: item.name }),
      name: item.name,
      type: item.type,
      description: item.description,
      category: item.category,
      tags: item.tags,
      fileCount: item.fileCount,
      workspaceUsageCount: usage?.workspaces.size ?? 0,
      divergedWorkspaceCount: usage?.diverged.size ?? 0,
    };
  });

  return {
    cloud: {
      total: cloudCatalog.total,
      items: cloudItems,
      availableFilters: cloudCatalog.availableFilters,
    },
    workspaces: workspaceSummaries,
  };
}

export async function buildSkillsHubWorkspaceDetail(params: {
  config: AhubConfig;
  filePath: string;
  isActive: boolean;
  providerIndex?: Map<string, ProviderIndexEntry>;
  packageLoader: ProviderPackageLoader;
}): Promise<SkillsHubWorkspaceDetail> {
  const workspaceDir = path.dirname(params.filePath);
  const manifest = await loadWorkspaceManifest(params.filePath).catch(() => null);
  const workspaceName = manifest?.name?.trim() || lastPathSegment(workspaceDir);
  const targetDirectories = await inspectDeployTargets(params.config, workspaceDir);
  const providerIndex = params.providerIndex ?? await loadProviderSkillIndexFromLoader(params.packageLoader);
  const localSkills = dedupeDetectedLocalSkills(await detectLocalSkills(workspaceDir));
  const resolved = manifest ? resolveManifestSkills(manifest) : [];
  const rules = await buildWorkspaceRulesSections({
    workspaceDir,
    providerIndex,
    resolved,
  });

  const agents = await Promise.all(
    targetDirectories.map(async (targetDirectory): Promise<SkillsHubWorkspaceAgentDetail> => {
      const configuredRefs = resolved.filter((skill) => skill.targets.includes(targetDirectory.target));
      const configuredKeys = new Set(
        configuredRefs.map((skill) => formatContentRef({ type: skill.type, name: skill.name })),
      );
      const detected = localSkills.filter((entry) => entry.target === targetDirectory.target);
      const detectedByKey = groupDetectedLocalSkills(detected);
      const skillKeys = new Set<string>([
        ...configuredKeys,
        ...detectedByKey.keys(),
      ]);

      const skills: SkillsHubWorkspaceSkill[] = [];

      for (const key of [...skillKeys].sort((a, b) => a.localeCompare(b))) {
        const ref = parseContentRef(key, 'skill');
        const localEntry = detectedByKey.get(key)?.[0] ?? null;
        const localSnapshot = localEntry
          ? await buildLocalSkillSnapshot(localEntry, targetDirectory.target)
          : null;
        const providerPkg = await getPackageFromLoader(params.packageLoader, ref);
        const cloudSnapshot = providerPkg
          ? buildCloudSkillSnapshot(providerPkg, targetDirectory.target)
          : null;
        const providerMeta = providerIndex.get(key) ?? providerIndex.get(ref.name) ?? null;
        const inManifest = configuredKeys.has(key);
        const installedLocally = Boolean(localSnapshot);
        const existsInProvider = Boolean(cloudSnapshot);
        const hashesMatch = localSnapshot !== null
          && cloudSnapshot !== null
          && localSnapshot.compareHash === cloudSnapshot.compareHash;
        const status = resolveSkillsHubStatus({
          inManifest,
          installedLocally,
          existsInProvider,
          hashesMatch,
        });
        const pkg = providerPkg ?? localSnapshot?.pkg ?? null;
        const type = providerMeta?.type ?? pkg?.skill.type ?? ref.type;

        skills.push({
          contentId: formatContentRef({ type, name: ref.name }),
          name: ref.name,
          type,
          description: providerMeta?.description ?? pkg?.skill.description ?? null,
          category: providerMeta?.category ?? null,
          tags: providerMeta?.tags ?? [],
          fileCount: providerMeta?.fileCount ?? pkg?.files.length ?? 0,
          status,
          inManifest,
          installedLocally,
          existsInProvider,
          lossiness: localSnapshot?.lossiness ?? 'lossless',
          ...(localSnapshot?.warning ? { warning: localSnapshot.warning } : {}),
          localPaths: localEntry ? [localEntry.absolutePath] : [],
          availableActions: resolveAvailableActions({
            installedLocally,
            existsInProvider,
          }),
        });
      }

      const counts = buildStatusCounts(skills.map((skill) => skill.status));

      return {
        target: targetDirectory.target,
        label: targetDirectory.label,
        source: targetDirectory.source,
        rootPath: targetDirectory.rootPath,
        skillPath: targetDirectory.directories.skill,
        exists: targetDirectory.exists,
        counts,
        skills,
      };
    }),
  );

  const counts = buildStatusCounts(agents.flatMap((agent) => agent.skills.map((skill) => skill.status)));

  return {
    filePath: params.filePath,
    workspaceDir,
    workspaceName,
    isActive: params.isActive,
    counts,
    agents,
    rules,
  };
}

export async function buildSkillsHubDiff(params: {
  provider: StorageProvider;
  filePath: string;
  target: DeployTarget;
  name: string;
  type?: ContentType;
}): Promise<SkillsHubDiffResult> {
  const manifest = await loadWorkspaceManifest(params.filePath).catch(() => null);
  const workspaceDir = path.dirname(params.filePath);
  const workspaceName = manifest?.name?.trim() || lastPathSegment(workspaceDir);
  const localEntry = (await detectLocalSkills(workspaceDir))
    .filter((entry) =>
      entry.target === params.target
      && entry.name === params.name
      && (!params.type || resolveLocalArtifactType(entry) === params.type),
    )
    .sort((a, b) => a.absolutePath.localeCompare(b.absolutePath))[0] ?? null;
  const localSnapshot = localEntry
    ? await buildLocalSkillSnapshot(localEntry, params.target)
    : null;
  const providerPkg = await getPackageFromProvider(params.provider, {
    type: params.type ?? 'skill',
    name: params.name,
  });
  const cloudSnapshot = providerPkg
    ? buildCloudSkillSnapshot(providerPkg, params.target)
    : null;
  const inManifest = manifest
    ? resolveManifestSkills(manifest).some((entry) =>
      entry.name === params.name
      && (!params.type || entry.type === params.type)
      && entry.targets.includes(params.target),
    )
    : false;
  const hashesMatch = localSnapshot !== null
    && cloudSnapshot !== null
    && localSnapshot.compareHash === cloudSnapshot.compareHash;
  const status = resolveSkillsHubStatus({
    inManifest,
    installedLocally: Boolean(localSnapshot),
    existsInProvider: Boolean(cloudSnapshot),
    hashesMatch,
  });

  return {
    contentId: formatContentRef({ type: params.type ?? 'skill', name: params.name }),
    name: params.name,
    type: params.type ?? providerPkg?.skill.type ?? localSnapshot?.pkg.skill.type ?? 'skill',
    workspaceFilePath: params.filePath,
    workspaceName,
    target: params.target,
    status,
    lossiness: localSnapshot?.lossiness ?? 'lossless',
    ...(localSnapshot?.warning ? { warning: localSnapshot.warning } : {}),
    local: buildDiffSide(localSnapshot, localEntry?.absolutePath),
    cloud: buildCloudDiffSide(cloudSnapshot, providerPkg),
    canUpload: Boolean(localSnapshot),
    canDownload: Boolean(cloudSnapshot),
  };
}

export async function performSkillsHubDownload(params: {
  config: AhubConfig;
  provider: StorageProvider;
  filePath: string;
  target: DeployTarget;
  contents?: ContentRef[];
  skills?: string[];
}): Promise<SkillsHubActionResult> {
  const manifest = await loadWorkspaceManifest(params.filePath);
  const workspaceDir = path.dirname(params.filePath);
  const deployRoot = resolveDeployTargetRoot(params.target, params.config, workspaceDir);
  const deployer = await createDeployer(params.target, deployRoot);

  let nextManifest = manifest;
  let manifestChanged = false;
  const successful: SkillsHubActionSuccess[] = [];
  const failed: SkillsHubActionFailure[] = [];

  for (const ref of uniqueContents(params.contents ?? legacySkillsToContents(params.skills))) {
    const pkg = await getPackageFromProvider(params.provider, ref);
    if (!pkg) {
      failed.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.target,
        error: `Content "${formatContentRef(ref)}" nao encontrado na nuvem.`,
        code: 'SKILL_NOT_FOUND',
      });
      continue;
    }

    try {
      const deployedPath = await deployer.deploy(pkg);
      nextManifest = addContentTargetToManifest(nextManifest, ref, params.target);
      manifestChanged = true;
      successful.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.target,
        path: deployedPath,
        message: 'Baixada da nuvem e instalada no workspace.',
      });
    } catch (err) {
      failed.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.target,
        error: err instanceof Error ? err.message : String(err),
        code: 'DEPLOY_FAILED',
      });
    }
  }

  if (manifestChanged) {
    await saveWorkspaceManifest(params.filePath, nextManifest);
  }

  return { successful, failed };
}

export async function performSkillsHubUpload(params: {
  provider: StorageProvider;
  filePath: string;
  target: DeployTarget;
  contents?: ContentRef[];
  skills?: string[];
  force?: boolean;
}): Promise<SkillsHubActionResult> {
  const workspaceDir = path.dirname(params.filePath);
  const localEntries = dedupeDetectedLocalSkills(await detectLocalSkills(workspaceDir))
    .filter((entry) => entry.target === params.target);
  const byName = new Map(
    localEntries.map((entry) => [formatContentRef({ type: resolveLocalArtifactType(entry), name: entry.name }), entry] as const),
  );
  const successful: SkillsHubActionSuccess[] = [];
  const failed: SkillsHubActionFailure[] = [];

  for (const ref of uniqueContents(params.contents ?? legacySkillsToContents(params.skills))) {
    const localEntry = byName.get(formatContentRef(ref));
    if (!localEntry) {
      failed.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.target,
        error: `Content "${formatContentRef(ref)}" nao foi encontrado localmente neste agente.`,
        code: 'LOCAL_SKILL_NOT_FOUND',
      });
      continue;
    }

    const localSnapshot = await buildLocalSkillSnapshot(localEntry, params.target);
    const cloudPkg = await getPackageFromProvider(params.provider, ref);
    if (cloudPkg && !params.force) {
      const cloudSnapshot = buildCloudSkillSnapshot(cloudPkg, params.target);
      if (localSnapshot.compareHash !== cloudSnapshot.compareHash) {
        failed.push({
          contentId: formatContentRef(ref),
          name: ref.name,
          type: ref.type,
          skill: ref.name,
          target: params.target,
          error: `Content "${formatContentRef(ref)}" diverge da nuvem. Abra a comparacao antes de subir.`,
          code: 'DIFF_CONFIRMATION_REQUIRED',
        });
        continue;
      }
    }

    try {
      await params.provider.put(localSnapshot.pkg);
      successful.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.target,
        message: 'Versao local enviada para a nuvem.',
        ...(localSnapshot.warning ? { warning: localSnapshot.warning } : {}),
        lossiness: localSnapshot.lossiness,
      });
    } catch (err) {
      failed.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.target,
        error: err instanceof Error ? err.message : String(err),
        code: 'UPLOAD_FAILED',
      });
    }
  }

  return { successful, failed };
}

export async function performSkillsHubTransfer(params: {
  config: AhubConfig;
  sourceWorkspaceFilePath: string;
  sourceTarget: DeployTarget;
  destinationWorkspaceFilePath: string;
  destinationTarget: DeployTarget;
  contents?: ContentRef[];
  skills?: string[];
  mode: 'copy' | 'move';
}): Promise<SkillsHubActionResult> {
  const sourceWorkspaceDir = path.dirname(params.sourceWorkspaceFilePath);
  const destinationWorkspaceDir = path.dirname(params.destinationWorkspaceFilePath);
  const sourceManifest = await loadWorkspaceManifest(params.sourceWorkspaceFilePath);
  const destinationManifest = await loadWorkspaceManifest(params.destinationWorkspaceFilePath);
  const localEntries = dedupeDetectedLocalSkills(await detectLocalSkills(sourceWorkspaceDir))
    .filter((entry) => entry.target === params.sourceTarget);
  const byName = new Map(
    localEntries.map((entry) => [formatContentRef({ type: resolveLocalArtifactType(entry), name: entry.name }), entry] as const),
  );

  let nextSourceManifest = sourceManifest;
  let nextDestinationManifest = destinationManifest;
  let sourceChanged = false;
  let destinationChanged = false;

  const destinationDeployer = await createDeployer(
    params.destinationTarget,
    resolveDeployTargetRoot(params.destinationTarget, params.config, destinationWorkspaceDir),
  );
  const sourceDeployer = await createDeployer(
    params.sourceTarget,
    resolveDeployTargetRoot(params.sourceTarget, params.config, sourceWorkspaceDir),
  );

  const successful: SkillsHubActionSuccess[] = [];
  const failed: SkillsHubActionFailure[] = [];

  for (const ref of uniqueContents(params.contents ?? legacySkillsToContents(params.skills))) {
    const localEntry = byName.get(formatContentRef(ref));
    if (!localEntry) {
      failed.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.sourceTarget,
        error: `Content "${formatContentRef(ref)}" nao foi encontrado localmente no agente de origem.`,
        code: 'LOCAL_SKILL_NOT_FOUND',
      });
      continue;
    }

    try {
      const localSnapshot = await buildLocalSkillSnapshot(localEntry, params.sourceTarget);
      const deployedPath = await destinationDeployer.deploy(localSnapshot.pkg);
      nextDestinationManifest = addContentTargetToManifest(
        nextDestinationManifest,
        ref,
        params.destinationTarget,
      );
      destinationChanged = true;

      if (params.mode === 'move') {
        try {
          await sourceDeployer.undeploy(ref.name);
          nextSourceManifest = removeContentTargetFromManifest(nextSourceManifest, ref, params.sourceTarget);
          sourceChanged = true;
        } catch (err) {
          successful.push({
            contentId: formatContentRef(ref),
            name: ref.name,
            type: ref.type,
            skill: ref.name,
            target: params.destinationTarget,
            path: deployedPath,
            message: 'Copiada para o destino, mas a remocao da origem falhou; a operacao virou copia.',
            warning: err instanceof Error ? err.message : String(err),
            lossiness: localSnapshot.lossiness,
          });
          continue;
        }
      }

      successful.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.destinationTarget,
        path: deployedPath,
        message:
          params.mode === 'move'
            ? 'Movida para o novo workspace/agente.'
            : 'Copiada para o novo workspace/agente.',
        ...(localSnapshot.warning ? { warning: localSnapshot.warning } : {}),
        lossiness: localSnapshot.lossiness,
      });
    } catch (err) {
      failed.push({
        contentId: formatContentRef(ref),
        name: ref.name,
        type: ref.type,
        skill: ref.name,
        target: params.destinationTarget,
        error: err instanceof Error ? err.message : String(err),
        code: 'TRANSFER_FAILED',
      });
    }
  }

  if (destinationChanged) {
    await saveWorkspaceManifest(params.destinationWorkspaceFilePath, nextDestinationManifest);
  }
  if (sourceChanged) {
    await saveWorkspaceManifest(params.sourceWorkspaceFilePath, nextSourceManifest);
  }

  return { successful, failed };
}

function createProviderPackageLoader(provider: StorageProvider): ProviderPackageLoader {
  const cache = new Map<string, Promise<SkillPackage | null>>();

  return {
    async get(ref: ContentRef): Promise<SkillPackage | null> {
      const key = formatContentRef(ref);
      if (!cache.has(key)) {
        cache.set(key, provider.get(ref).catch(() => null));
      }
      return cache.get(key)!;
    },
  };
}

async function getPackageFromLoader(
  loader: ProviderPackageLoader,
  ref: ContentRef,
): Promise<SkillPackage | null> {
  const pkg = await loader.get(ref).catch(() => null);
  if (pkg || ref.type !== 'skill') {
    return pkg;
  }

  return loader.get(ref.name as unknown as ContentRef).catch(() => null);
}

async function getPackageFromProvider(
  provider: StorageProvider,
  ref: ContentRef,
): Promise<SkillPackage | null> {
  const pkg = await provider.get(ref).catch(() => null);
  if (pkg || ref.type !== 'skill') {
    return pkg;
  }

  return provider.get(ref.name).catch(() => null);
}

async function loadProviderSkillIndexFromLoader(
  packageLoader: ProviderPackageLoader,
): Promise<Map<string, ProviderIndexEntry>> {
  void packageLoader;
  return new Map<string, ProviderIndexEntry>();
}

async function buildLocalSkillSnapshot(
  entry: DetectedLocalSkill,
  target: DeployTarget,
): Promise<LocalSkillSnapshot> {
  if (entry.artifactKind === 'skill_package') {
    const pkg = await loadSkillPackage(entry.absolutePath);
    return {
      entry,
      pkg,
      preview: serializePackagePreview(pkg),
      compareHash: hashPackage(pkg),
      lossiness: 'lossless',
    };
  }

  const rawContent = await readDetectedArtifactContent(entry);
  if (rawContent === null) {
    throw new Error(`Nao foi possivel ler o conteudo local de "${entry.name}".`);
  }

  const normalizedContent = normalizeComparableText(rawContent);
  const type = resolveLocalArtifactType(entry);
  const skill: Skill = {
    name: entry.name,
    description: `Imported from ${entry.appLabel ?? entry.tool}. Review before publishing.`,
    body: normalizedContent,
    metadata: {
      importedFrom: entry.appId,
      importedFromPath: entry.absolutePath,
    },
    ...(type !== 'skill' ? { type } : {}),
  };
  const pkg: SkillPackage = {
    skill,
    files: [
      {
        relativePath: getMarkerFile(type),
        content: serializeSkill(skill),
      },
    ],
  };

  return {
    entry,
    pkg,
    preview: normalizedContent,
    compareHash: hashText(renderPackageForTarget(pkg, target)),
    lossiness: 'lossy_with_explicit_warning',
    warning: 'O artefato local deste agente nao preserva frontmatter nem arquivos auxiliares; o upload para a nuvem gera um pacote canonicalizado.',
  };
}

function buildCloudSkillSnapshot(
  pkg: SkillPackage,
  target: DeployTarget,
): CloudSkillSnapshot {
  if (target === 'codex') {
    return {
      pkg,
      preview: serializePackagePreview(pkg),
      compareHash: hashPackage(pkg),
    };
  }

  const rendered = renderPackageForTarget(pkg, target);
  return {
    pkg,
    preview: normalizeComparableText(rendered),
    compareHash: hashText(rendered),
  };
}

function resolveSkillsHubStatus(params: {
  inManifest: boolean;
  installedLocally: boolean;
  existsInProvider: boolean;
  hashesMatch: boolean;
}): SkillsHubStatus {
  const { inManifest, installedLocally, existsInProvider, hashesMatch } = params;

  if (!existsInProvider) {
    return inManifest ? 'missing_in_provider' : 'local_only';
  }
  if (!installedLocally) {
    return 'cloud_only';
  }
  return hashesMatch ? 'synced' : 'diverged';
}

function resolveAvailableActions(params: {
  installedLocally: boolean;
  existsInProvider: boolean;
}): Array<'download' | 'upload' | 'copy' | 'move' | 'compare'> {
  const actions: Array<'download' | 'upload' | 'copy' | 'move' | 'compare'> = [];

  if (params.existsInProvider) {
    actions.push('download');
  }
  if (params.installedLocally) {
    actions.push('upload', 'copy', 'move');
  }
  if (params.installedLocally && params.existsInProvider) {
    actions.push('compare');
  }

  return actions;
}

function buildDiffSide(snapshot: LocalSkillSnapshot | null, detectedPath?: string): SkillsHubDiffSide {
  return {
    exists: Boolean(snapshot),
    hash: snapshot?.compareHash ?? null,
    preview: snapshot?.preview ?? null,
    ...(detectedPath ? { detectedPath } : {}),
    ...(snapshot ? { fileCount: snapshot.pkg.files.length, type: snapshot.pkg.skill.type ?? 'skill' } : {}),
  };
}

function buildCloudDiffSide(snapshot: CloudSkillSnapshot | null, pkg: SkillPackage | null): SkillsHubDiffSide {
  return {
    exists: Boolean(snapshot),
    hash: snapshot?.compareHash ?? null,
    preview: snapshot?.preview ?? null,
    ...(pkg ? { fileCount: pkg.files.length, type: pkg.skill.type ?? 'skill' } : {}),
  };
}

async function buildWorkspaceRulesSections(params: {
  workspaceDir: string;
  providerIndex: Map<string, ProviderIndexEntry>;
  resolved: Array<{ type: ContentType; name: string; targets: DeployTarget[] }>;
}): Promise<SkillsHubWorkspaceRulesSection[]> {
  const appInventories = await buildWorkspaceAppInventories(params.workspaceDir);
  const cursorManifestRules = new Set<string>(
    params.resolved
      .filter((entry) => entry.type === 'skill' && entry.targets.includes('cursor'))
      .map((entry) => formatContentRef({ type: entry.type, name: entry.name })),
  );

  return appInventories
    .map((app): SkillsHubWorkspaceRulesSection | null => {
      const rules = app.artifacts
        .filter((artifact) => artifact.artifactKind === 'rule_file')
        .map((artifact): SkillsHubWorkspaceRule => {
          const projectedFrom = { type: 'skill' as const, name: artifact.name };
          const projected = app.appId === 'cursor'
            && (
              cursorManifestRules.has(formatContentRef(projectedFrom))
              || params.providerIndex.has(formatContentRef(projectedFrom))
              || params.providerIndex.has(artifact.name)
            );

          return {
            id: artifact.id,
            name: artifact.name,
            appId: app.appId,
            appLabel: app.label,
            source: projected ? 'projected' : 'local',
            writable: app.appId === 'cursor',
            detectedPath: artifact.detectedPath,
            expectedPath: artifact.expectedPath,
            repositoryPath: artifact.repositoryPath,
            visibilityStatus: artifact.visibilityStatus,
            legacyStatus: artifact.legacyStatus,
            lossiness: artifact.lossiness,
            sourceDocs: artifact.sourceDocs,
            projectedFrom: projected ? projectedFrom : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name) || a.detectedPath.localeCompare(b.detectedPath));

      if (rules.length === 0) {
        return null;
      }

      return {
        appId: app.appId,
        label: app.label,
        supportLevel: app.supportLevel,
        writable: app.appId === 'cursor',
        canonicalPaths: app.canonicalPaths,
        legacyPaths: app.legacyPaths,
        docUrls: app.docUrls,
        rules,
      };
    })
    .filter((section): section is SkillsHubWorkspaceRulesSection => section !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function toWorkspaceSummary(detail: SkillsHubWorkspaceDetail): SkillsHubWorkspaceSummary {
  return {
    filePath: detail.filePath,
    workspaceDir: detail.workspaceDir,
    workspaceName: detail.workspaceName,
    isActive: detail.isActive,
    counts: detail.counts,
    agents: detail.agents.map((agent) => ({
      target: agent.target,
      label: agent.label,
      counts: agent.counts,
    })),
    driftCount:
      detail.counts.diverged
      + detail.counts.local_only
      + detail.counts.missing_in_provider,
  };
}

function renderPackageForTarget(pkg: SkillPackage, target: DeployTarget): string {
  if (target === 'codex') {
    return serializePackagePreview(pkg);
  }

  return `${normalizeComparableText(pkg.skill.body)}\n`;
}

function serializePackagePreview(pkg: SkillPackage): string {
  return [...pkg.files]
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((file) => `# ${file.relativePath}\n${normalizeComparableText(file.content)}`)
    .join('\n\n');
}

function hashPackage(pkg: SkillPackage): string {
  const normalized = [...pkg.files]
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((file) => ({
      relativePath: file.relativePath,
      content: normalizeComparableText(file.content),
    }));

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function hashText(content: string): string {
  return createHash('sha256').update(normalizeComparableText(content)).digest('hex');
}

function normalizeComparableText(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd();
}

function resolveLocalArtifactType(entry: DetectedLocalSkill): ContentType {
  switch (entry.artifactKind) {
    case 'prompt_file':
      return 'prompt';
    case 'subagent_file':
      return 'subagent';
    default:
      return 'skill';
  }
}

function buildStatusCounts(statuses: SkillsHubStatus[]): Record<SkillsHubStatus, number> & { total: number } {
  return {
    total: statuses.length,
    synced: statuses.filter((status) => status === 'synced').length,
    cloud_only: statuses.filter((status) => status === 'cloud_only').length,
    local_only: statuses.filter((status) => status === 'local_only').length,
    diverged: statuses.filter((status) => status === 'diverged').length,
    missing_in_provider: statuses.filter((status) => status === 'missing_in_provider').length,
  };
}

function dedupeDetectedLocalSkills(entries: DetectedLocalSkill[]): DetectedLocalSkill[] {
  const map = new Map<string, DetectedLocalSkill>();

  for (const entry of entries) {
    const key = `${resolveLocalArtifactType(entry)}::${entry.name}::${entry.tool}::${entry.absolutePath}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.tool.localeCompare(b.tool));
}

function groupDetectedLocalSkills(entries: DetectedLocalSkill[]): Map<string, DetectedLocalSkill[]> {
  const grouped = new Map<string, DetectedLocalSkill[]>();

  for (const entry of entries) {
    const key = formatContentRef({ type: resolveLocalArtifactType(entry), name: entry.name });
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }

  return grouped;
}

function uniqueContents(contents: ContentRef[]): ContentRef[] {
  const unique = new Map<string, ContentRef>();
  for (const content of contents) {
    unique.set(formatContentRef(content), content);
  }
  return [...unique.values()].sort((a, b) =>
    formatContentRef(a).localeCompare(formatContentRef(b)),
  );
}

function legacySkillsToContents(skills?: string[]): ContentRef[] {
  return (skills ?? []).map((name) => parseContentRef(name, 'skill'));
}

function lastPathSegment(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}
