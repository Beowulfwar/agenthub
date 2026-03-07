import { access, readdir, stat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getAllAgentAppDefinitions, type AgentAppDefinition, type RepositoryLocationDefinition, listAgentApps } from './app-registry.js';
import { ALL_MARKER_FILES, MARKER_TO_TYPE } from './types.js';
import type {
  ArtifactKind,
  ArtifactLegacyStatus,
  ArtifactLossiness,
  ArtifactScope,
  ArtifactVisibilityStatus,
  DetectedAppArtifact,
  WorkspaceAppInventory,
} from './types.js';

interface DetectArtifactsOptions {
  includeUser?: boolean;
}

export async function detectAppArtifacts(
  workspaceDir: string,
  options?: DetectArtifactsOptions,
): Promise<DetectedAppArtifact[]> {
  const normalizedWorkspace = path.resolve(workspaceDir);
  const includeUser = options?.includeUser ?? false;
  const results: DetectedAppArtifact[] = [];

  for (const app of getAllAgentAppDefinitions()) {
    const locations = [
      ...app.canonicalLocations,
      ...app.legacyLocations,
    ].filter((location) => location.scope === 'workspace' || includeUser);

    for (const location of locations) {
      const detected = await detectArtifactsForLocation(normalizedWorkspace, app, location);
      results.push(...detected);
    }
  }

  const deduped = new Map<string, DetectedAppArtifact>();
  for (const artifact of results) {
    const key = `${artifact.appId}::${artifact.detectedPath}`;
    if (!deduped.has(key)) {
      deduped.set(key, artifact);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.appId !== b.appId) return a.appId.localeCompare(b.appId);
    return a.detectedPath.localeCompare(b.detectedPath);
  });
}

export async function buildWorkspaceAppInventories(
  workspaceDir: string,
): Promise<WorkspaceAppInventory[]> {
  const normalizedWorkspace = path.resolve(workspaceDir);
  const artifacts = await detectAppArtifacts(normalizedWorkspace);
  const catalog = listAgentApps();

  return catalog.map((app) => {
    const appArtifacts = artifacts
      .filter((artifact) => artifact.appId === app.appId)
      .map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
        label: artifact.label,
        artifactKind: artifact.artifactKind,
        detectedPath: artifact.detectedPath,
        expectedPath: artifact.expectedPath,
        repositoryPath: artifact.repositoryPath,
        visibilityStatus: artifact.visibilityStatus,
        legacyStatus: artifact.legacyStatus,
        migratable: artifact.migratable,
        lossiness: artifact.lossiness,
        sourceDocs: artifact.sourceDocs,
        ...(artifact.target ? { target: artifact.target } : {}),
      }));

    const counts = {
      total: appArtifacts.length,
      visible_in_app: appArtifacts.filter((artifact) => artifact.visibilityStatus === 'visible_in_app').length,
      found_in_wrong_repository: appArtifacts.filter((artifact) => artifact.visibilityStatus === 'found_in_wrong_repository').length,
      found_in_legacy_repository: appArtifacts.filter((artifact) => artifact.visibilityStatus === 'found_in_legacy_repository').length,
      found_in_workspace_but_not_loaded_by_app: appArtifacts.filter((artifact) => artifact.visibilityStatus === 'found_in_workspace_but_not_loaded_by_app').length,
      found_but_unverifiable_for_app: appArtifacts.filter((artifact) => artifact.visibilityStatus === 'found_but_unverifiable_for_app').length,
      missing_from_expected_repository: appArtifacts.filter((artifact) => artifact.visibilityStatus === 'missing_from_expected_repository').length,
    };

    return {
      appId: app.appId,
      label: app.label,
      supportLevel: app.supportLevel,
      ...(app.deployTarget ? { deployTarget: app.deployTarget } : {}),
      canonicalPaths: resolveCatalogPaths(normalizedWorkspace, app.canonicalLocations),
      legacyPaths: resolveCatalogPaths(normalizedWorkspace, app.legacyLocations),
      docUrls: app.docUrls,
      counts,
      artifacts: appArtifacts,
    } satisfies WorkspaceAppInventory;
  });
}

export async function readDetectedArtifactContent(artifact: DetectedAppArtifact): Promise<string | null> {
  if (artifact.artifactKind === 'skill_package') {
    return null;
  }

  try {
    return await readFile(artifact.detectedPath, 'utf-8');
  } catch {
    return null;
  }
}

function resolveCatalogPaths(
  workspaceDir: string,
  locations: Array<{ scope: ArtifactScope; relativePath: string }>,
): string[] {
  return [...new Set(locations.map((location) => resolveLocationPath(workspaceDir, location.scope, location.relativePath)))].sort();
}

async function detectArtifactsForLocation(
  workspaceDir: string,
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
): Promise<DetectedAppArtifact[]> {
  const absolutePath = resolveLocationPath(workspaceDir, location.scope, location.relativePath);

  switch (location.detectionMode) {
    case 'single_file':
      return detectSingleFileArtifact(absolutePath, workspaceDir, app, location);
    case 'content_entries':
      return detectContentEntries(absolutePath, workspaceDir, app, location);
    case 'pattern_files':
      return detectPatternFiles(absolutePath, workspaceDir, app, location);
  }
}

async function detectSingleFileArtifact(
  absolutePath: string,
  workspaceDir: string,
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
): Promise<DetectedAppArtifact[]> {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) return [];
  } catch {
    return [];
  }

  return [
    buildArtifact({
      workspaceDir,
      app,
      location,
      name: deriveArtifactName(absolutePath, workspaceDir),
      detectedPath: absolutePath,
      repositoryPath: absolutePath,
      artifactKind: location.artifactKind,
    }),
  ];
}

async function detectContentEntries(
  absolutePath: string,
  workspaceDir: string,
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
): Promise<DetectedAppArtifact[]> {
  try {
    await access(absolutePath);
  } catch {
    return [];
  }

  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => []);
  const results: DetectedAppArtifact[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const marker = await findMarkerFile(path.join(absolutePath, entry.name));
      if (!marker) continue;

      results.push(
        buildArtifact({
          workspaceDir,
          app,
          location,
          name: entry.name,
          detectedPath: path.join(absolutePath, entry.name),
          repositoryPath: absolutePath,
          artifactKind: markerToArtifactKind(marker),
        }),
      );
      continue;
    }

    if (!entry.isFile()) continue;
    if (!matchesFileName(entry.name, location.extensions, location.suffixes)) continue;

    results.push(
      buildArtifact({
        workspaceDir,
        app,
        location,
        name: deriveArtifactName(path.join(absolutePath, entry.name), workspaceDir),
        detectedPath: path.join(absolutePath, entry.name),
        repositoryPath: absolutePath,
        artifactKind: location.artifactKind,
      }),
    );
  }

  return results;
}

async function detectPatternFiles(
  absolutePath: string,
  workspaceDir: string,
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
): Promise<DetectedAppArtifact[]> {
  try {
    await access(absolutePath);
  } catch {
    return [];
  }

  const files = await walkMatchingFiles(absolutePath, {
    recursive: location.recursive ?? false,
    extensions: location.extensions,
    suffixes: location.suffixes,
  });

  return files.map((filePath) =>
    buildArtifact({
      workspaceDir,
      app,
      location,
      name: deriveArtifactName(filePath, workspaceDir),
      detectedPath: filePath,
      repositoryPath: absolutePath,
      artifactKind: location.artifactKind,
    }),
  );
}

function buildArtifact(params: {
  workspaceDir: string;
  app: AgentAppDefinition;
  location: RepositoryLocationDefinition;
  name: string;
  detectedPath: string;
  repositoryPath: string;
  artifactKind: ArtifactKind;
}): DetectedAppArtifact {
  const { workspaceDir, app, location, name, detectedPath, repositoryPath, artifactKind } = params;
  const visibilityStatus = resolveVisibilityStatus(app, location);
  const legacyStatus = resolveLegacyStatus(app, location);
  const lossiness = resolveLossiness(app.appId, artifactKind, location.defaultLossiness);
  const migratable = lossiness !== 'not_migratable';

  return {
    id: `${app.appId}:${detectedPath}`,
    name,
    label: location.label,
    appId: app.appId,
    appLabel: app.label,
    artifactKind,
    scope: location.scope,
    supportLevel: app.supportLevel,
    detectedPath,
    expectedPath: resolveCanonicalExpectedPath(workspaceDir, app, location, name, artifactKind),
    repositoryPath,
    visibilityStatus,
    legacyStatus,
    migratable,
    lossiness,
    sourceDocs: app.docUrls,
    ...(app.deployTarget ? { target: app.deployTarget } : {}),
  };
}

function resolveCanonicalExpectedPath(
  workspaceDir: string,
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
  name: string,
  artifactKind: ArtifactKind,
): string {
  if (location.canonical) {
    return buildArtifactPath(resolveLocationPath(workspaceDir, location.scope, location.relativePath), name, artifactKind, location.detectionMode);
  }

  const desiredKind = resolveCanonicalArtifactKind(app.appId, artifactKind);
  const canonical = app.canonicalLocations.find((candidate) => candidate.artifactKind === desiredKind && candidate.scope === location.scope)
    ?? app.canonicalLocations.find((candidate) => candidate.artifactKind === desiredKind)
    ?? app.canonicalLocations[0];

  if (!canonical) {
    return resolveLocationPath(workspaceDir, location.scope, location.relativePath);
  }

  return buildArtifactPath(resolveLocationPath(workspaceDir, canonical.scope, canonical.relativePath), name, desiredKind, canonical.detectionMode);
}

function resolveCanonicalArtifactKind(appId: AgentAppDefinition['appId'], artifactKind: ArtifactKind): ArtifactKind {
  if (artifactKind !== 'skill_package') {
    return artifactKind;
  }

  switch (appId) {
    case 'claude-code':
      return 'command_file';
    case 'cursor':
    case 'windsurf':
    case 'cline':
    case 'continue':
      return 'rule_file';
    default:
      return artifactKind;
  }
}

function buildArtifactPath(
  repositoryRoot: string,
  name: string,
  artifactKind: ArtifactKind,
  detectionMode: 'single_file' | 'content_entries' | 'pattern_files',
): string {
  if (detectionMode === 'single_file') {
    return repositoryRoot;
  }

  if (detectionMode === 'content_entries' || artifactKind === 'skill_package') {
    return path.join(repositoryRoot, name);
  }

  return path.join(repositoryRoot, `${name}.md`);
}

function resolveVisibilityStatus(
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
): ArtifactVisibilityStatus {
  if (app.supportLevel === 'official_app_unverified_layout') {
    return 'found_but_unverifiable_for_app';
  }

  if (location.defaultVisibilityStatus) {
    return location.defaultVisibilityStatus;
  }

  return location.canonical ? 'visible_in_app' : 'found_in_legacy_repository';
}

function resolveLegacyStatus(
  app: AgentAppDefinition,
  location: RepositoryLocationDefinition,
): ArtifactLegacyStatus {
  if (app.supportLevel === 'official_app_unverified_layout') {
    return 'unverifiable';
  }
  if (location.canonical) return 'canonical';
  if (location.defaultVisibilityStatus === 'found_in_wrong_repository') return 'wrong_repository';
  return 'legacy';
}

function resolveLossiness(
  appId: AgentAppDefinition['appId'],
  artifactKind: ArtifactKind,
  defaultLossiness?: ArtifactLossiness,
): ArtifactLossiness {
  if (defaultLossiness) {
    return defaultLossiness;
  }

  if (appId === 'codex' && artifactKind === 'skill_package') {
    return 'lossy_with_explicit_warning';
  }

  if (artifactKind === 'command_file' || artifactKind === 'rule_file' || artifactKind === 'prompt_file' || artifactKind === 'subagent_file') {
    return 'lossless';
  }

  return 'not_migratable';
}

function resolveLocationPath(workspaceDir: string, scope: ArtifactScope, relativePath: string): string {
  switch (scope) {
    case 'workspace':
      return path.join(workspaceDir, relativePath);
    case 'user':
      return path.join(os.homedir(), relativePath);
    case 'global':
      return path.resolve(relativePath);
  }
}

function markerToArtifactKind(marker: string): ArtifactKind {
  switch (MARKER_TO_TYPE[marker]) {
    case 'skill':
      return 'skill_package';
    case 'prompt':
      return 'prompt_file';
    case 'subagent':
      return 'subagent_file';
    default:
      return 'unknown';
  }
}

async function findMarkerFile(dirPath: string): Promise<string | null> {
  for (const marker of ALL_MARKER_FILES) {
    try {
      const markerStat = await stat(path.join(dirPath, marker));
      if (markerStat.isFile()) {
        return marker;
      }
    } catch {
      // Try next marker.
    }
  }

  return null;
}

async function walkMatchingFiles(
  rootDir: string,
  options: { recursive: boolean; extensions?: string[]; suffixes?: string[] },
): Promise<string[]> {
  const results: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (options.recursive) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;
      if (!matchesFileName(entry.name, options.extensions, options.suffixes)) continue;
      results.push(fullPath);
    }
  }

  return results.sort();
}

function matchesFileName(name: string, extensions?: string[], suffixes?: string[]): boolean {
  const hasExtension = !extensions || extensions.some((extension) => name.endsWith(extension));
  const hasSuffix = !suffixes || suffixes.some((suffix) => name.endsWith(suffix));
  return hasExtension && hasSuffix;
}

function stripKnownSuffix(name: string, suffixes: string[]): string {
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length) || name;
    }
  }

  return name;
}

function deriveArtifactName(filePath: string, workspaceDir: string): string {
  const stripped = stripKnownSuffix(path.basename(filePath), ['.instructions.md', '.md', '.mdc']);
  if (stripped.startsWith('.') || /^[A-Z0-9_-]+$/.test(stripped)) {
    return path.basename(workspaceDir) || stripped.replace(/^\./, '') || 'artifact';
  }
  return stripped || path.basename(workspaceDir) || 'artifact';
}
