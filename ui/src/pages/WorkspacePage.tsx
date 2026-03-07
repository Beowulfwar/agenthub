import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Code,
  LayoutList,
  FolderKanban,
  Sparkles,
  FolderSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useUnregisterWorkspace,
  useWorkspace,
  useWorkspaceRegistry,
  useWorkspaceSuggestions,
} from '../hooks/useWorkspace';
import { useSync } from '../hooks/useSync';
import { ManifestEditor } from '../components/workspace/ManifestEditor';
import { WorkspaceForm } from '../components/workspace/WorkspaceForm';
import { SyncProgress } from '../components/workspace/SyncProgress';
import { CreateWorkspaceDialog } from '../components/workspace/CreateWorkspaceDialog';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { cn } from '../lib/utils';
import type { WorkspaceCatalogSkillStatus, WorkspaceRegistryEntry, WorkspaceSuggestion } from '../api/types';

type EditorMode = 'form' | 'raw';

interface CreateDialogState {
  open: boolean;
  initialDirectory?: string;
  initialName?: string;
}

export function WorkspacePage() {
  const registry = useWorkspaceRegistry();
  const suggestions = useWorkspaceSuggestions();
  const removeWorkspace = useUnregisterWorkspace();
  const { status, progress, result, error, startSync, reset } = useSync();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [dialogState, setDialogState] = useState<CreateDialogState>({ open: false });

  const registeredEntries = registry.data ?? [];

  useEffect(() => {
    if (registeredEntries.length === 0) {
      setSelectedPath(null);
      return;
    }

    if (selectedPath && registeredEntries.some((entry) => entry.filePath === selectedPath)) {
      return;
    }

    const nextSelection =
      registeredEntries.find((entry) => entry.isActive)?.filePath ?? registeredEntries[0]?.filePath ?? null;
    setSelectedPath(nextSelection);
  }, [registeredEntries, selectedPath]);

  const selectedEntry =
    registeredEntries.find((entry) => entry.filePath === selectedPath) ?? null;

  const workspace = useWorkspace(selectedPath, { enabled: Boolean(selectedPath) });

  const registeredDirs = useMemo(
    () => new Set(registeredEntries.map((entry) => entry.workspaceDir)),
    [registeredEntries],
  );

  const filteredSuggestions = useMemo(
    () => (suggestions.data ?? []).filter((suggestion) => !registeredDirs.has(suggestion.workspaceDir)),
    [registeredDirs, suggestions.data],
  );

  const readyCount = registeredEntries.filter((entry) => !entry.error).length;
  const errorCount = registeredEntries.filter((entry) => Boolean(entry.error)).length;

  const openCreateDialog = (initialDirectory?: string, initialName?: string) => {
    setDialogState({
      open: true,
      initialDirectory,
      initialName,
    });
  };

  const closeCreateDialog = () => {
    setDialogState({ open: false });
  };

  const handleRemoveWorkspace = async (entry: WorkspaceRegistryEntry) => {
    const confirmed = window.confirm(`Remover "${getWorkspaceName(entry)}" da lista de workspaces?`);
    if (!confirmed) {
      return;
    }

    try {
      await removeWorkspace.mutateAsync(entry.filePath);
      toast.success('Workspace removido da lista');
      if (selectedPath === entry.filePath) {
        setSelectedPath(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nao foi possivel remover o workspace');
    }
  };

  const handleAddSuggestion = (suggestion: WorkspaceSuggestion) => {
    openCreateDialog(suggestion.workspaceDir, lastPathSegment(suggestion.workspaceDir));
  };

  const handleSyncWorkspace = async (force = false) => {
    if (!selectedEntry) {
      return;
    }

    startSync({
      ...(force ? { force: true } : {}),
      filePath: selectedEntry.filePath,
    });
  };

  if (registry.isLoading && !registry.data) {
    return <LoadingSpinner className="py-24" size="lg" label="Carregando workspaces..." />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-gray-900">Gerenciar workspaces</h1>
            <p className="mt-2 text-sm text-gray-500">
              Cadastre, nomeie e organize varios workspaces locais. Qualquer pasta pode virar um
              workspace, mas skills e prompts so aparecem aqui quando a pasta entra nesta lista.
            </p>
          </div>
          <button
            onClick={() => openCreateDialog()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Novo workspace
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SummaryCard
            title="Workspaces cadastrados"
            value={registeredEntries.length}
            hint="Lista usada para gerenciar e consultar projetos locais"
          />
          <SummaryCard
            title="Prontos para uso"
            value={readyCount}
            hint="Workspaces sem erro de leitura e prontos para edicao ou sync"
          />
          <SummaryCard
            title="Com erro"
            value={errorCount}
            hint="Projetos que precisam ser revisados ou registrados novamente"
          />
        </div>
      </section>

      {registeredEntries.length === 0 ? (
        <EmptyWorkspaceState
          suggestions={filteredSuggestions}
          loadingSuggestions={suggestions.isLoading}
          onAddSuggestion={handleAddSuggestion}
          onOpenCreate={() => openCreateDialog()}
          onUseSuggestionAsTemplate={(suggestion) => openCreateDialog(suggestion.workspaceDir)}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Lista de workspaces</h2>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {registeredEntries.length} cadastrado{registeredEntries.length === 1 ? '' : 's'}
                  </p>
                </div>
                <FolderKanban className="h-4 w-4 text-gray-300" />
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
                {registeredEntries.map((entry) => {
                  const selected = entry.filePath === selectedPath;
                  const displayName = getWorkspaceName(entry);
                  const targets = entry.manifest?.defaultTargets ?? [];

                  return (
                    <div
                      key={entry.filePath}
                      className={cn(
                        'rounded-xl border p-4 transition-colors',
                        selected
                          ? 'border-brand-300 bg-brand-50/40'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <button
                        onClick={() => setSelectedPath(entry.filePath)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-gray-900">{displayName}</h3>
                            <p className="mt-1 truncate font-mono text-xs text-gray-500">
                              {entry.workspaceDir}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                              {entry.configuredSkillCount} configurada{entry.configuredSkillCount === 1 ? '' : 's'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                              {entry.detectedSkillCount} local
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {targets.length > 0 ? (
                            targets.map((target) => (
                              <span
                                key={target}
                                className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200"
                              >
                                {target}
                              </span>
                            ))
                          ) : (
                            <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
                              Sem destinos padrao
                            </span>
                          )}
                          {entry.driftCount > 0 && (
                            <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                              {entry.driftCount} drift
                            </span>
                          )}
                          {entry.missingInProviderCount > 0 && (
                            <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 ring-1 ring-inset ring-red-200">
                              {entry.missingInProviderCount} fora do provider
                            </span>
                          )}
                          {entry.error && (
                            <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 ring-1 ring-inset ring-red-200">
                              Perfil com erro
                            </span>
                          )}
                        </div>
                      </button>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleRemoveWorkspace(entry)}
                          disabled={removeWorkspace.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <SuggestionPanel
              title="Sugestoes encontradas"
              description="Pastas detectadas a partir de skills locais e estruturas conhecidas como .skills, .codex, .claude e .cursor."
              suggestions={filteredSuggestions}
              loading={suggestions.isLoading}
              onAdd={handleAddSuggestion}
              onOpenCreate={openCreateDialog}
              compact
            />
          </aside>

          <section className="space-y-4">
            {!selectedEntry ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
                <FolderSearch className="mx-auto h-10 w-10 text-gray-300" />
                <h2 className="mt-4 text-lg font-semibold text-gray-900">Selecione um workspace</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Escolha um item da lista para editar nome, skills e destinos reconhecidos pelos agentes.
                </p>
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-gray-900">
                        {getWorkspaceName(selectedEntry)}
                      </h2>
                      <p className="mt-1 break-all font-mono text-xs text-gray-500">
                        {selectedEntry.workspaceDir}
                      </p>
                      <p className="mt-3 max-w-2xl text-sm text-gray-500">
                        Este painel cruza manifesto, provider e disco local para mostrar quais
                        skills estao configuradas, quais ja existem na pasta e onde ainda ha drift.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleSyncWorkspace(false)}
                        disabled={status === 'syncing'}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Sync
                      </button>
                      <button
                        onClick={() => handleSyncWorkspace(true)}
                        disabled={status === 'syncing'}
                        className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                      >
                        <Zap className="h-4 w-4" />
                        Force sync
                      </button>
                      <button
                        onClick={() => handleRemoveWorkspace(selectedEntry)}
                        disabled={removeWorkspace.isPending}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    </div>
                  </div>
                </section>

                <SyncProgress status={status} progress={progress} result={result} error={error} />

                {status !== 'idle' && (
                  <div className="flex justify-end">
                    <button
                      onClick={reset}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Limpar status do sync
                    </button>
                  </div>
                )}

                <div className="flex w-fit items-center gap-1 rounded-lg bg-gray-100 p-1">
                  <button
                    onClick={() => setEditorMode('form')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      editorMode === 'form'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                    Formulario
                  </button>
                  <button
                    onClick={() => setEditorMode('raw')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      editorMode === 'raw'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    <Code className="h-3.5 w-3.5" />
                    JSON cru
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    title="Skills configuradas"
                    value={workspace.data?.catalog?.configuredSkillCount ?? selectedEntry.configuredSkillCount}
                    hint="Quantidade declarada no manifesto deste workspace"
                  />
                  <SummaryCard
                    title="Detectadas localmente"
                    value={workspace.data?.catalog?.detectedSkillCount ?? selectedEntry.detectedSkillCount}
                    hint="Skills que o scanner encontrou nas pastas locais reconhecidas"
                  />
                  <SummaryCard
                    title="Drift"
                    value={workspace.data?.catalog?.driftCount ?? selectedEntry.driftCount}
                    hint="Diferencas entre manifesto, provider e o que existe no disco"
                  />
                  <SummaryCard
                    title="Fora do provider"
                    value={workspace.data?.catalog?.missingInProviderCount ?? selectedEntry.missingInProviderCount}
                    hint="Referencias em manifesto que nao existem mais na fonte oficial"
                  />
                </div>

                {workspace.isLoading ? (
                  <LoadingSpinner className="py-24" size="lg" label="Carregando detalhes do workspace..." />
                ) : workspace.data?.manifest ? (
                  editorMode === 'form' ? (
                    <WorkspaceForm
                      manifest={workspace.data.manifest}
                      filePath={workspace.data.filePath ?? selectedEntry.filePath}
                      workspaceDir={workspace.data.workspaceDir ?? selectedEntry.workspaceDir}
                      targetDirectories={workspace.data.targetDirectories ?? []}
                    />
                  ) : (
                    <ManifestEditor
                      manifest={workspace.data.manifest}
                      filePath={workspace.data.filePath ?? selectedEntry.filePath}
                    />
                  )
                ) : (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                    {workspace.data?.error ??
                      'O arquivo do workspace nao pode ser carregado. Remova o item da lista ou registre a pasta novamente.'}
                  </div>
                )}

                {workspace.data?.catalog && workspace.data.catalog.skills.length > 0 ? (
                  <section className="rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-5 py-3">
                      <h3 className="text-sm font-semibold text-gray-700">
                        Estado das skills neste workspace ({workspace.data.catalog.skills.length})
                      </h3>
                      <p className="mt-1 text-xs text-gray-400">
                        O sync usa as skills configuradas no manifesto. As demais aparecem aqui para
                        deixar o drift explicito.
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {workspace.data.catalog.skills.map((catalogSkill) => (
                        <div
                          key={catalogSkill.name}
                          className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-start lg:justify-between"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-medium text-gray-900">
                                {catalogSkill.name}
                              </span>
                              <WorkspaceSkillStatusBadge status={catalogSkill.status} />
                              {!catalogSkill.existsInProvider && (
                                <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                                  Nao sincronizavel
                                </span>
                              )}
                            </div>
                            {catalogSkill.description && (
                              <p className="mt-1 text-sm text-gray-500">{catalogSkill.description}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {catalogSkill.configuredTargets.map((target) => (
                              <span
                                key={`${catalogSkill.name}-${target}`}
                                className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                              >
                                {target}
                              </span>
                            ))}
                            {catalogSkill.detectedTools.map((tool) => (
                              <span
                                key={`${catalogSkill.name}-${tool}`}
                                className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                              >
                                Local em {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : selectedEntry && workspace.data?.manifest ? (
                  <section className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-gray-300" />
                    <h3 className="mt-3 text-sm font-semibold text-gray-900">Workspace sem skills</h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Este projeto ainda nao tem skills configuradas nem detectadas localmente. O
                      manifesto pode continuar vazio por enquanto.
                    </p>
                  </section>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}

      {dialogState.open && (
        <CreateWorkspaceDialog
          onClose={closeCreateDialog}
          initialDirectory={dialogState.initialDirectory}
          initialName={dialogState.initialName}
        />
      )}
    </div>
  );
}

function EmptyWorkspaceState({
  suggestions,
  loadingSuggestions,
  onAddSuggestion,
  onOpenCreate,
  onUseSuggestionAsTemplate,
}: {
  suggestions: WorkspaceSuggestion[];
  loadingSuggestions: boolean;
  onAddSuggestion: (suggestion: WorkspaceSuggestion) => void;
  onOpenCreate: () => void;
  onUseSuggestionAsTemplate: (suggestion: WorkspaceSuggestion) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-14 text-center">
        <FolderKanban className="mx-auto h-12 w-12 text-gray-300" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Nenhum workspace cadastrado</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500">
          O gerenciamento comeca quando voce registra pastas nesta lista. Depois disso fica facil
          revisar os projetos cadastrados, escolher um workspace na lista e controlar quais skills cada
          um usa.
        </p>
        <button
          onClick={onOpenCreate}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Adicionar primeiro workspace
        </button>
      </section>

      <SuggestionPanel
        title="Workspaces sugeridos"
        description="Quando nao existe nenhum workspace cadastrado, o Agent Hub procura pastas que ja tenham skills locais para sugerir um ponto de partida."
        suggestions={suggestions}
        loading={loadingSuggestions}
        onAdd={onAddSuggestion}
        onOpenCreate={(directory) => {
          if (directory) {
            const suggestion = suggestions.find((item) => item.workspaceDir === directory);
            if (suggestion) {
              onUseSuggestionAsTemplate(suggestion);
              return;
            }
          }
          onOpenCreate();
        }}
      />
    </div>
  );
}

function SuggestionPanel({
  title,
  description,
  suggestions,
  loading,
  onAdd,
  onOpenCreate,
  compact = false,
}: {
  title: string;
  description: string;
  suggestions: WorkspaceSuggestion[];
  loading: boolean;
  onAdd: (suggestion: WorkspaceSuggestion) => void;
  onOpenCreate: (directory?: string, initialName?: string) => void;
  compact?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-xs text-gray-400">{description}</p>
      </div>

      <div className={cn('space-y-3 p-4', compact && 'max-h-[28rem] overflow-y-auto')}>
        {loading ? (
          <LoadingSpinner className="py-10" size="md" label="Procurando sugestoes..." />
        ) : suggestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            Nenhuma sugestao encontrada. Voce ainda pode cadastrar qualquer pasta manualmente.
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div key={suggestion.workspaceDir} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{suggestion.label}</p>
                  <p className="mt-1 truncate font-mono text-xs text-gray-500">
                    {suggestion.workspaceDir}
                  </p>
                </div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                  {suggestion.skillCount} skill{suggestion.skillCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestion.detected.map((item) => (
                  <span
                    key={`${suggestion.workspaceDir}-${item.absolutePath}`}
                    className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200"
                  >
                    {item.label}
                  </span>
                ))}
                <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-gray-200">
                  {suggestion.manifestExists ? 'Perfil ja existe' : 'Perfil sera criado'}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => onAdd(suggestion)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Registrar
                </button>
                <button
                  onClick={() => onOpenCreate()}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Escolher outra pasta
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

function WorkspaceSkillStatusBadge({ status }: { status: WorkspaceCatalogSkillStatus }) {
  const meta: Record<WorkspaceCatalogSkillStatus, { label: string; className: string }> = {
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

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta[status].className)}>
      {meta[status].label}
    </span>
  );
}

function getWorkspaceName(entry: WorkspaceRegistryEntry): string {
  return entry.manifest?.name?.trim() || lastPathSegment(entry.workspaceDir);
}

function lastPathSegment(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}
