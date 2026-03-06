/**
 * Aggregate storage provider — combines multiple named sources into a single
 * {@link StorageProvider} with qualified name support.
 *
 * When there is a single source, skill names are unqualified (e.g. "my-skill").
 * When there are multiple sources, names are qualified as "source:skill-name".
 * Unqualified names are resolved against the default source.
 *
 * The separator `:` is safe because skill names only allow `[a-zA-Z0-9._-]`.
 */

import type { HealthCheckResult, SkillPackage } from '../core/types.js';
import { SkillNotFoundError } from '../core/errors.js';
import type { ListOptions, StorageProvider } from './provider.js';

// ---------------------------------------------------------------------------
// Qualified name helpers
// ---------------------------------------------------------------------------

/** Separator between source ID and skill name. */
const SEPARATOR = ':';

/** Parse a potentially qualified name into source + skill components. */
export function parseQualifiedName(
  raw: string,
): { source: string | null; name: string } {
  const idx = raw.indexOf(SEPARATOR);
  if (idx < 0) {
    return { source: null, name: raw };
  }
  return { source: raw.slice(0, idx), name: raw.slice(idx + 1) };
}

/** Build a qualified name from source and skill name. */
export function formatQualifiedName(source: string, name: string): string {
  return `${source}${SEPARATOR}${name}`;
}

// ---------------------------------------------------------------------------
// AggregateProvider
// ---------------------------------------------------------------------------

export class AggregateProvider implements StorageProvider {
  readonly name = 'local' as const; // satisfies the type union; real names come from children

  private readonly sources: Map<string, StorageProvider>;
  private readonly defaultSourceId: string | undefined;

  /**
   * @param sources    Map of source ID → StorageProvider.
   * @param defaultId  Default source for unqualified operations.
   */
  constructor(
    sources: Map<string, StorageProvider>,
    defaultId?: string,
  ) {
    this.sources = sources;
    this.defaultSourceId =
      defaultId ?? (sources.size === 1 ? [...sources.keys()][0] : undefined);
  }

  /** Number of active sources. */
  get sourceCount(): number {
    return this.sources.size;
  }

  /** Whether qualified names are needed (more than one source). */
  get isMultiSource(): boolean {
    return this.sources.size > 1;
  }

  /** Get the list of source IDs. */
  get sourceIds(): string[] {
    return [...this.sources.keys()];
  }

  // -----------------------------------------------------------------------
  // Source resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve a (possibly qualified) name to a source provider + bare name.
   * @throws {SkillNotFoundError} if the source is unknown.
   */
  private resolve(raw: string): { provider: StorageProvider; sourceId: string; name: string } {
    const { source, name } = parseQualifiedName(raw);

    if (source) {
      const provider = this.sources.get(source);
      if (!provider) {
        throw new SkillNotFoundError(raw);
      }
      return { provider, sourceId: source, name };
    }

    // Unqualified: single source → use it directly
    if (this.sources.size === 1) {
      const [id, provider] = [...this.sources.entries()][0];
      return { provider, sourceId: id, name };
    }

    // Unqualified: use default source
    if (this.defaultSourceId) {
      const provider = this.sources.get(this.defaultSourceId);
      if (provider) {
        return { provider, sourceId: this.defaultSourceId, name };
      }
    }

    throw new SkillNotFoundError(raw);
  }

  // -----------------------------------------------------------------------
  // StorageProvider implementation
  // -----------------------------------------------------------------------

  async healthCheck(): Promise<HealthCheckResult> {
    if (this.sources.size === 0) {
      return { ok: false, message: 'No sources configured.' };
    }

    const results: Array<{ id: string; result: HealthCheckResult }> = [];

    for (const [id, provider] of this.sources) {
      const result = await provider.healthCheck();
      results.push({ id, result });
    }

    const allOk = results.every((r) => r.result.ok);
    const lines = results.map(
      (r) => `  ${r.result.ok ? 'ok' : 'FAIL'} [${r.id}] ${r.result.message}`,
    );

    return {
      ok: allOk,
      message: `${results.length} source(s):\n${lines.join('\n')}`,
    };
  }

  async list(options?: string | ListOptions): Promise<string[]> {
    const allNames: string[] = [];

    for (const [id, provider] of this.sources) {
      const names = await provider.list(options);
      if (this.isMultiSource) {
        allNames.push(...names.map((n) => formatQualifiedName(id, n)));
      } else {
        allNames.push(...names);
      }
    }

    return allNames.sort();
  }

  async exists(rawName: string): Promise<boolean> {
    const { provider, name } = this.resolve(rawName);
    return provider.exists(name);
  }

  async get(rawName: string): Promise<SkillPackage> {
    const { provider, name } = this.resolve(rawName);
    return provider.get(name);
  }

  async put(pkg: SkillPackage): Promise<void> {
    const { provider, name } = this.resolve(pkg.skill.name);
    // Ensure the bare name is used in the package
    const adjusted = { ...pkg, skill: { ...pkg.skill, name } };
    await provider.put(adjusted);
  }

  async delete(rawName: string): Promise<void> {
    const { provider, name } = this.resolve(rawName);
    await provider.delete(name);
  }

  async *exportAll(): AsyncIterable<SkillPackage> {
    for (const [id, provider] of this.sources) {
      for await (const pkg of provider.exportAll()) {
        if (this.isMultiSource) {
          yield {
            ...pkg,
            skill: {
              ...pkg.skill,
              name: formatQualifiedName(id, pkg.skill.name),
            },
          };
        } else {
          yield pkg;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Multi-source specific operations
  // -----------------------------------------------------------------------

  /**
   * List skills from a specific source only.
   */
  async listFromSource(sourceId: string, options?: string | ListOptions): Promise<string[]> {
    const provider = this.sources.get(sourceId);
    if (!provider) {
      throw new SkillNotFoundError(sourceId);
    }
    return provider.list(options);
  }

  /**
   * Get a provider for a specific source.
   */
  getSourceProvider(sourceId: string): StorageProvider | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Health check a specific source.
   */
  async healthCheckSource(sourceId: string): Promise<HealthCheckResult> {
    const provider = this.sources.get(sourceId);
    if (!provider) {
      return { ok: false, message: `Unknown source: ${sourceId}` };
    }
    return provider.healthCheck();
  }
}
