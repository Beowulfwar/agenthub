import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  FolderKanban,
  HardDriveDownload,
  Layers3,
  Monitor,
  Rocket,
} from 'lucide-react';
import { useSkillsCatalog } from '../hooks/useSkills';
import { SearchBar } from '../components/skills/SearchBar';
import { DeployDialog } from '../components/deploy/DeployDialog';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { cn } from '../lib/utils';
import type {
  DeployTarget,
  SkillsCatalog,
  WorkspaceCatalogEntry,
  WorkspaceCatalogSkill,
  WorkspaceCatalogSkillStatus,
} from '../api/types';

const WORKSPACE_FILTER_ALL = '__all__';
const WORKSPACE_FILTER_UNASSIGNED = '__unassigned__';

const TARGET_COLORS: Record<DeployTarget, string> = {
  'claude-code': 'bg-orange-100 text-orange-700',
  codex: 'bg-blue-100 text-blue-700',
  cursor: 'bg-cyan-100 text-cyan-700',
};

const STATUS_META: Record<
  WorkspaceCatalogSkillStatus,
  { label: string; className: string }
> = {
  configured_and_detected: {
    label: 'Manifesto + local',
    className: 'bg-emerald-100 text-emerald-700',
  },
  configured_only: {
    label: 'So manifesto',
    className: 'bg-amber-100 text-amber-700',
  },
  detected_only: {
    label: 'So local',
    className: 'bg-slate-100 text-slate-700',
  },
  missing_in_provider: {
    label: 'Fora do provider',
    className: 'bg-red-100 text-red-700',
  },
};

export function SkillsPage() {
  const [query, setQuery] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState(WORKSPACE_FILTER_ALL);
  const [selected, setSelected] = useState<string[]>([]);
  const [showDeploy, setShowDeploy] = useState(false);
  const { data: catalog, isLoading, error } = useSkillsCatalog(query || undefined);

  const filteredWorkspaces = useMemo(() => {
    if (!catalog) return [];
    if (workspaceFilter === WORKSPACE_FILTER_ALL) return catalog.workspaces;
    if (workspaceFilter === WORKSPACE_FILTER_UNASSIGNED) return [];
    return catalog.workspaces.filter((workspace) => workspace.filePath === workspaceFilter);
  }, [catalog, workspaceFilter]);

  const showUnassignedSection = useMemo(() => {
    if (!catalog) return false;
    return (
      (workspaceFilter === WORKSPACE_FILTER_ALL || workspaceFilter === WORKSPACE_FILTER_UNASSIGNED)
      && catalog.unassigned.length > 0
    );
  }, [catalog, workspaceFilter]);

  const visibleSkillNames = useMemo(() => {
    if (!catalog) return new Set<string>();

    const names = new Set<string>();
    filteredWorkspaces.forEach((workspace) => {
      workspace.skills.forEach((skill) => {
        if (skill.existsInProvider) {
          names.add(skill.name);
        }
      });
    });
    if (showUnassignedSection) {
      catalog.unassigned.forEach((skill) => names.add(skill.name));
    }
    return names;
  }, [catalog, filteredWorkspaces, showUnassignedSection]);

  const filteredSelected = useMemo(
    () => selected.filter((name) => visibleSkillNames.has(name)),
    [selected, visibleSkillNames],
  );

  const hasVisibleContent = filteredWorkspaces.length > 0 || showUnassignedSection;

  const toggleSelect = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-gray-900">Catalogo de skills</h1>
            <p className="mt-1 text-sm text-gray-500">
              O catalogo cruza provider, manifests e deteccao local para mostrar o que esta
              configurado, o que ja existe no disco e onde ha drift por workspace.
            </p>
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => setShowDeploy(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Rocket className="h-4 w-4" />
              Deploy ({selected.length})
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Buscar por skill, categoria ou tag"
          />
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
              Workspace
            </span>
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value={WORKSPACE_FILTER_ALL}>Todos os workspaces</option>
              {catalog?.workspaces.map((workspace) => (
                <option key={workspace.filePath} value={workspace.filePath}>
                  {workspace.workspaceName}
                </option>
              ))}
              {catalog && catalog.unassigned.length > 0 && (
                <option value={WORKSPACE_FILTER_UNASSIGNED}>Sem workspace</option>
              )}
            </select>
          </label>
        </div>

        {catalog && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SummaryCard
              title="Skills no provider"
              value={catalog.providerSkillCount}
              hint="Inventario total disponivel para vincular em manifests"
            />
            <SummaryCard
              title="Workspaces com drift"
              value={catalog.workspaces.filter((workspace) => workspace.driftCount > 0).length}
              hint="Projetos com manifesto fora do provider ou disco fora do manifesto"
            />
            <SummaryCard
              title="Sem workspace"
              value={catalog.unassigned.length}
              hint="Skills existentes no provider, mas ainda nao vinculadas a nenhum projeto"
            />
          </div>
        )}
      </section>

      {isLoading && <LoadingSpinner className="py-16" size="lg" label="Carregando catalogo..." />}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Nao foi possivel carregar o catalogo'}
        </div>
      )}

      {catalog?.invalidWorkspaces.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Alguns workspaces nao entraram no catalogo completo
          </div>
          <div className="mt-3 space-y-2">
            {catalog.invalidWorkspaces.map((workspace) => (
              <div
                key={workspace.filePath}
                className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{workspace.workspaceName}</span>
                  {workspace.detectedSkillCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      {workspace.detectedSkillCount} detectada
                      {workspace.detectedSkillCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs text-gray-500">{workspace.workspaceDir}</p>
                <p className="mt-2 text-sm text-amber-800">{workspace.error}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!isLoading && !error && catalog && !hasVisibleContent && (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title="Nenhuma skill encontrada"
          description={
            query
              ? `Nenhuma skill corresponde a "${query}".`
              : 'Nao ha skills ou workspaces compativeis com o filtro atual.'
          }
        />
      )}

      {!isLoading && !error && catalog && hasVisibleContent && (
        <div className="space-y-5">
          {filteredWorkspaces.map((workspace) => (
            <WorkspaceSection
              key={workspace.filePath}
              workspace={workspace}
              selected={selected}
              onToggleSelect={toggleSelect}
            />
          ))}

          {showUnassignedSection && (
            <section className="rounded-2xl border border-gray-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">Sem workspace</h2>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                      Provider
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Skills presentes no provider, mas ainda nao vinculadas a nenhum manifesto.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <MetricPill label="skills" value={catalog.unassigned.length} />
                </div>
              </div>

              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                {catalog.unassigned.map((skill) => (
                  <CatalogSkillCard
                    key={skill.name}
                    name={skill.name}
                    description={skill.description}
                    category={skill.category}
                    tags={skill.tags}
                    fileCount={skill.fileCount}
                    selected={selected.includes(skill.name)}
                    selectable
                    onToggleSelect={() => toggleSelect(skill.name)}
                    statusLabel="Sem workspace"
                    statusClassName="bg-gray-100 text-gray-700"
                    footerLabel="Ainda nao vinculado"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showDeploy && (
        <DeployDialog
          skillNames={filteredSelected.length > 0 ? filteredSelected : selected}
          onClose={() => setShowDeploy(false)}
        />
      )}
    </div>
  );
}

function WorkspaceSection({
  workspace,
  selected,
  onToggleSelect,
}: {
  workspace: WorkspaceCatalogEntry;
  selected: string[];
  onToggleSelect: (name: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{workspace.workspaceName}</h2>
            {workspace.isActive && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                Ativo
              </span>
            )}
            {workspace.driftCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                {workspace.driftCount} drift
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-gray-500">{workspace.workspaceDir}</p>
          {workspace.error && <p className="mt-2 text-sm text-red-600">{workspace.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <MetricPill label="configuradas" value={workspace.configuredSkillCount} />
          <MetricPill label="detectadas localmente" value={workspace.detectedSkillCount} />
          <MetricPill label="fora do provider" value={workspace.missingInProviderCount} tone="danger" />
        </div>
      </div>

      {workspace.skills.length > 0 ? (
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {workspace.skills.map((skill) => {
            const status = STATUS_META[skill.status];
            const selectable = skill.existsInProvider;

            return (
              <CatalogSkillCard
                key={`${workspace.filePath}:${skill.name}`}
                name={skill.name}
                description={skill.description}
                category={skill.category}
                tags={skill.tags}
                fileCount={skill.fileCount}
                configuredTargets={skill.configuredTargets}
                detectedTools={skill.detectedTools}
                selected={selected.includes(skill.name)}
                selectable={selectable}
                onToggleSelect={selectable ? () => onToggleSelect(skill.name) : undefined}
                statusLabel={status.label}
                statusClassName={status.className}
                footerLabel={skill.existsInProvider ? undefined : 'Nao pode ser sincronizada ate existir no provider'}
              />
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          Nenhuma skill visivel neste workspace com os filtros atuais.
        </div>
      )}
    </section>
  );
}

function CatalogSkillCard({
  name,
  description,
  category,
  tags,
  fileCount,
  configuredTargets = [],
  detectedTools = [],
  selected,
  selectable,
  onToggleSelect,
  statusLabel,
  statusClassName,
  footerLabel,
}: {
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  fileCount: number;
  configuredTargets?: DeployTarget[];
  detectedTools?: string[];
  selected: boolean;
  selectable: boolean;
  onToggleSelect?: () => void;
  statusLabel: string;
  statusClassName: string;
  footerLabel?: string;
}) {
  const cardClassName = cn(
    'flex h-full flex-col rounded-xl border p-4 transition-colors',
    selectable
      ? 'border-gray-200 bg-white hover:border-brand-300 hover:shadow-md'
      : 'border-gray-200 bg-gray-50',
  );

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900">{name}</h3>
            <p className="mt-1 text-xs text-gray-400">{fileCount} arquivo{fileCount === 1 ? '' : 's'}</p>
          </div>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', statusClassName)}>
          {statusLabel}
        </span>
      </div>

      {description && (
        <p className="mt-3 line-clamp-3 text-sm text-gray-500">{description}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {category && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {category}
          </span>
        )}
        {configuredTargets.map((target) => (
          <span
            key={target}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium',
              TARGET_COLORS[target],
            )}
          >
            <Monitor className="h-3 w-3" />
            {target}
          </span>
        ))}
        {detectedTools.map((tool) => (
          <span
            key={tool}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
          >
            <HardDriveDownload className="h-3 w-3" />
            {tool}
          </span>
        ))}
        {tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
          >
            {tag}
          </span>
        ))}
      </div>

      {footerLabel && (
        <p className="mt-auto pt-4 text-xs font-medium text-red-600">{footerLabel}</p>
      )}
    </>
  );

  return (
    <div className="relative">
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="absolute right-3 top-3 z-10 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
      )}
      {selectable ? (
        <Link to={`/skills/${encodeURIComponent(name)}`} className={cardClassName}>
          {content}
        </Link>
      ) : (
        <div className={cardClassName}>{content}</div>
      )}
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
        tone === 'danger' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600',
      )}
    >
      {value} {label}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-gray-400" />
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
    </div>
  );
}
