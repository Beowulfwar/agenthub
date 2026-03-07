import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Download,
  Filter,
  FolderKanban,
  Layers3,
} from 'lucide-react';
import { useSkillsCatalog } from '../hooks/useSkills';
import { useWorkspaceRegistry } from '../hooks/useWorkspace';
import { SearchBar } from '../components/skills/SearchBar';
import { DeployDialog } from '../components/deploy/DeployDialog';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';
import { cn } from '../lib/utils';
import type {
  CloudSkillCatalogItem,
  CloudSkillInstallState,
  DeployTarget,
} from '../api/types';

const TARGETS: Array<{ value: DeployTarget; label: string; className: string }> = [
  { value: 'claude-code', label: 'Claude Code', className: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'codex', label: 'Codex', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: 'cursor', label: 'Cursor', className: 'border-cyan-300 bg-cyan-50 text-cyan-700' },
];

const INSTALL_STATE_META: Record<CloudSkillInstallState, { label: string; className: string }> = {
  installed: { label: 'Instalada', className: 'bg-emerald-100 text-emerald-700' },
  not_installed: { label: 'Nao instalada', className: 'bg-slate-100 text-slate-700' },
  unknown: { label: 'Sem destino', className: 'bg-gray-100 text-gray-600' },
};

export function SkillsPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'skill' | 'prompt' | 'subagent' | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [workspaceFilePath, setWorkspaceFilePath] = useState('');
  const [target, setTarget] = useState<DeployTarget | ''>('');
  const [installState, setInstallState] = useState<CloudSkillInstallState | ''>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  const workspaceRegistry = useWorkspaceRegistry();
  const catalog = useSkillsCatalog({
    ...(query ? { q: query } : {}),
    ...(workspaceFilePath ? { workspaceFilePath } : {}),
    ...(target ? { target } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(tagFilter ? { tag: tagFilter } : {}),
    ...(installState ? { installState } : {}),
  });

  const readyForInstall = Boolean(workspaceFilePath && target);
  const selectedWorkspace = useMemo(
    () => workspaceRegistry.data?.find((entry) => entry.filePath === workspaceFilePath) ?? null,
    [workspaceRegistry.data, workspaceFilePath],
  );
  const selectedVisible = useMemo(
    () => selected.filter((name) => catalog.data?.items.some((item) => item.name === name)),
    [catalog.data?.items, selected],
  );

  const handleWorkspaceChange = (value: string) => {
    setWorkspaceFilePath(value);
    setTarget('');
    setInstallState('');
    setSelected([]);
  };

  const handleTargetChange = (value: DeployTarget) => {
    setTarget(value);
    setInstallState('');
    setSelected([]);
  };

  const toggleSelect = (name: string) => {
    if (!readyForInstall) {
      return;
    }

    setSelected((prev) =>
      prev.includes(name) ? prev.filter((entry) => entry !== name) : [...prev, name],
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-gray-900">Catalogo de skills</h1>
            <p className="mt-1 text-sm text-gray-500">
              Explore a base unica de skills da nuvem, escolha um workspace e um agente, e instale
              apenas o que fizer sentido naquele destino.
            </p>
          </div>
          <button
            onClick={() => setShowInstallDialog(true)}
            disabled={!readyForInstall || selected.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Instalar ({selected.length})
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Buscar por nome, categoria ou tag"
          />
          <SelectField
            label="Tipo"
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as typeof typeFilter)}
            options={[
              { value: '', label: 'Todos os tipos' },
              ...(catalog.data?.availableFilters.types ?? []).map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
          <SelectField
            label="Categoria"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: '', label: 'Todas as categorias' },
              ...(catalog.data?.availableFilters.categories ?? []).map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
          <SelectField
            label="Tag"
            value={tagFilter}
            onChange={setTagFilter}
            options={[
              { value: '', label: 'Todas as tags' },
              ...(catalog.data?.availableFilters.tags ?? []).map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Destino da instalacao</h2>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_180px]">
            <SelectField
              label="Workspace"
              value={workspaceFilePath}
              onChange={handleWorkspaceChange}
              options={[
                { value: '', label: 'Selecione um workspace' },
                ...(workspaceRegistry.data ?? []).map((entry) => ({
                  value: entry.filePath,
                  label: entry.manifest?.name?.trim() || lastPathSegment(entry.workspaceDir),
                })),
              ]}
            />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Agente</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TARGETS.map((entry) => (
                  <button
                    key={entry.value}
                    onClick={() => handleTargetChange(entry.value)}
                    disabled={!workspaceFilePath}
                    className={cn(
                      'rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50',
                      target === entry.value ? entry.className : 'border-gray-200 bg-white text-gray-400',
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>

            <SelectField
              label="Estado no destino"
              value={installState}
              onChange={(value) => setInstallState(value as typeof installState)}
              disabled={!readyForInstall}
              options={[
                { value: '', label: 'Todos os estados' },
                { value: 'installed', label: 'Instalada' },
                { value: 'not_installed', label: 'Nao instalada' },
              ]}
            />
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm">
            {readyForInstall ? (
              <>
                <p className="font-medium text-gray-900">
                  Destino atual: {selectedWorkspace?.manifest?.name?.trim() || lastPathSegment(selectedWorkspace?.workspaceDir ?? '')}
                </p>
                <p className="mt-1 text-gray-500">
                  Agente selecionado: {TARGETS.find((entry) => entry.value === target)?.label}
                </p>
              </>
            ) : (
              <p className="text-gray-500">
                Escolha primeiro um workspace e depois um agente. So depois disso a selecao em lote
                e a instalacao ficam habilitadas.
              </p>
            )}
          </div>
        </div>

        {catalog.data && (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <SummaryCard
              title="Skills no catalogo"
              value={catalog.data.total}
              hint="Resultado apos os filtros globais da nuvem"
            />
            <SummaryCard
              title="Categorias"
              value={catalog.data.availableFilters.categories.length}
              hint="Categorias disponiveis no catalogo atual"
            />
            <SummaryCard
              title={readyForInstall ? 'Instaladas no destino' : 'Selecao em lote'}
              value={readyForInstall ? catalog.data.counts.installed : selected.length}
              hint={
                readyForInstall
                  ? 'Quantidade ja presente no workspace/agente escolhidos'
                  : 'Selecione um destino para liberar a instalacao'
              }
            />
          </div>
        )}
      </section>

      {catalog.isLoading && (
        <LoadingSpinner className="py-16" size="lg" label="Carregando catalogo..." />
      )}

      {catalog.error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {catalog.error instanceof Error ? catalog.error.message : 'Nao foi possivel carregar o catalogo'}
        </div>
      )}

      {!catalog.isLoading && !catalog.error && catalog.data && catalog.data.items.length === 0 && (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title="Nenhuma skill encontrada"
          description="Ajuste os filtros ou escolha outro destino para continuar."
        />
      )}

      {!catalog.isLoading && !catalog.error && catalog.data && catalog.data.items.length > 0 && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {catalog.data.items.map((item) => (
            <SkillCatalogCard
              key={item.name}
              item={item}
              readyForInstall={readyForInstall}
              selected={selected.includes(item.name)}
              onToggleSelect={() => toggleSelect(item.name)}
            />
          ))}
        </section>
      )}

      {showInstallDialog && (
        <DeployDialog
          skillNames={selectedVisible.length > 0 ? selectedVisible : selected}
          initialWorkspaceFilePath={workspaceFilePath || undefined}
          initialTarget={target || undefined}
          lockDestination
          onClose={() => setShowInstallDialog(false)}
        />
      )}
    </div>
  );
}

function SkillCatalogCard({
  item,
  readyForInstall,
  selected,
  onToggleSelect,
}: {
  item: CloudSkillCatalogItem;
  readyForInstall: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const installStateMeta = INSTALL_STATE_META[item.installState];

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300 hover:shadow-md">
      <input
        type="checkbox"
        checked={selected}
        disabled={!readyForInstall}
        onChange={onToggleSelect}
        className="absolute right-3 top-3 z-10 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
      />

      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1 pr-7">
          <Link
            to={`/skills/${encodeURIComponent(item.name)}`}
            className="truncate text-sm font-semibold text-gray-900 hover:text-brand-700"
          >
            {item.name}
          </Link>
          {item.description && (
            <p className="mt-2 line-clamp-3 text-sm text-gray-500">{item.description}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          {item.type}
        </span>
        {item.category && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            {item.category}
          </span>
        )}
        {item.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">{item.fileCount} arquivo{item.fileCount === 1 ? '' : 's'}</span>
        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', installStateMeta.className)}>
          {installStateMeta.label}
        </span>
      </div>
    </div>
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

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
        <Filter className="h-3.5 w-3.5 text-gray-300" />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function lastPathSegment(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}
