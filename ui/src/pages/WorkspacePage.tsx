import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Code,
  FolderKanban,
  FolderSearch,
  HardDrive,
  LayoutList,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
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
import type {
  ArtifactVisibilityStatus,
  DeployTarget,
  WorkspaceAgentInventory,
  WorkspaceAgentSkillStatus,
  WorkspaceAppInventory,
  WorkspaceRegistryEntry,
  WorkspaceSuggestion,
} from '../api/types';

type EditorMode = 'form' | 'raw';
type LocalInventoryFilter = 'all' | WorkspaceAgentSkillStatus;

interface CreateDialogState {
  open: boolean;
  initialDirectory?: string;
  initialName?: string;
}

const LOCAL_FILTER_OPTIONS: Array<{
  value: LocalInventoryFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todas' },
  { value: 'manifest_and_installed', label: 'No manifesto + local' },
  { value: 'manifest_missing_local', label: 'No manifesto, ausente' },
  { value: 'local_outside_manifest', label: 'Local, fora do manifesto' },
  { value: 'missing_in_provider', label: 'Ausente no provider' },
];

const AGENT_BADGE_STYLES: Record<DeployTarget, string> = {
  'claude-code': 'border-orange-200 bg-orange-50 text-orange-700',
  codex: 'border-blue-200 bg-blue-50 text-blue-700',
  cursor: 'border-cyan-200 bg-cyan-50 text-cyan-700',
};

const APP_BADGE_STYLES: Record<string, string> = {
  'claude-code': 'border-orange-200 bg-orange-50 text-orange-700',
  codex: 'border-blue-200 bg-blue-50 text-blue-700',
  cursor: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  windsurf: 'border-sky-200 bg-sky-50 text-sky-700',
  cline: 'border-pink-200 bg-pink-50 text-pink-700',
  continue: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  'gemini-cli': 'border-lime-200 bg-lime-50 text-lime-700',
  amp: 'border-rose-200 bg-rose-50 text-rose-700',
  'github-copilot': 'border-slate-200 bg-slate-50 text-slate-700',
  antigravity: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

export function WorkspacePage() {
  const registry = useWorkspaceRegistry();
  const suggestions = useWorkspaceSuggestions();
  const removeWorkspace = useUnregisterWorkspace();
  const { status, progress, result, error, startSync, reset } = useSync();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [dialogState, setDialogState] = useState<CreateDialogState>({ open: false });
  const [selectedAgentTarget, setSelectedAgentTarget] = useState<DeployTarget | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<LocalInventoryFilter>('all');

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

  useEffect(() => {
    setInventoryFilter('all');
  }, [selectedPath]);

  const selectedEntry =
    registeredEntries.find((entry) => entry.filePath === selectedPath) ?? null;

  const workspace = useWorkspace(selectedPath, { enabled: Boolean(selectedPath) });

  useEffect(() => {
    const agents = workspace.data?.agents ?? [];

    if (agents.length === 0) {
      setSelectedAgentTarget(null);
      return;
    }

    if (selectedAgentTarget && agents.some((agent) => agent.target === selectedAgentTarget)) {
      return;
    }

    setSelectedAgentTarget(agents[0]?.target ?? null);
  }, [selectedAgentTarget, workspace.data?.agents]);

  const selectedAgent = useMemo(
    () => workspace.data?.agents.find((agent) => agent.target === selectedAgentTarget) ?? null,
    [selectedAgentTarget, workspace.data?.agents],
  );

  const filteredAgentSkills = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    if (inventoryFilter === 'all') {
      return selectedAgent.skills;
    }

    return selectedAgent.skills.filter((skill) => skill.status === inventoryFilter);
  }, [inventoryFilter, selectedAgent]);

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
              Cadastre projetos locais, revise cada agente separadamente e trate aqui o que esta
              no manifesto, o que existe no disco e o que saiu do provider oficial.
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
            hint="Lista usada para diagnosticar e sincronizar projetos locais"
          />
          <SummaryCard
            title="Prontos para uso"
            value={readyCount}
            hint="Workspaces sem erro de leitura e com inventario disponivel"
          />
          <SummaryCard
            title="Com erro"
            value={errorCount}
            hint="Projetos que precisam de ajuste de manifesto ou novo registro"
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
                  Escolha um item da lista para revisar agentes, drift local e o manifesto do projeto.
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
                        Use esta tela para diagnosticar o estado local por agente. O manifesto continua
                        sendo a referencia do que deveria existir, enquanto o disco mostra o que esta
                        instalado de fato.
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
                ) : (
                  <>
                    {workspace.data?.error && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                        {workspace.data.error}
                      </div>
                    )}

                    <WorkspaceAgentSection
                      agents={workspace.data?.agents ?? []}
                      selectedTarget={selectedAgentTarget}
                      onSelectTarget={setSelectedAgentTarget}
                      inventoryFilter={inventoryFilter}
                      onChangeInventoryFilter={setInventoryFilter}
                      selectedAgent={selectedAgent}
                      filteredAgentSkills={filteredAgentSkills}
                    />

                    <WorkspaceAppSection apps={workspace.data?.apps ?? []} />

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

                    {workspace.data?.manifest ? (
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
                  </>
                )}
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

function WorkspaceAgentSection({
  agents,
  selectedTarget,
  onSelectTarget,
  inventoryFilter,
  onChangeInventoryFilter,
  selectedAgent,
  filteredAgentSkills,
}: {
  agents: WorkspaceAgentInventory[];
  selectedTarget: DeployTarget | null;
  onSelectTarget: (target: DeployTarget) => void;
  inventoryFilter: LocalInventoryFilter;
  onChangeInventoryFilter: (value: LocalInventoryFilter) => void;
  selectedAgent: WorkspaceAgentInventory | null;
  filteredAgentSkills: WorkspaceAgentInventory['skills'];
}) {
  if (agents.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <HardDrive className="mx-auto h-8 w-8 text-gray-300" />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">Nenhum agente reconhecido</h3>
        <p className="mt-2 text-sm text-gray-500">
          O workspace ainda nao expoe diretorios de destino para Claude Code, Codex ou Cursor.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Inventario local por agente</h3>
            <p className="mt-1 text-xs text-gray-400">
              Cada aba mostra apenas o destino local daquele agente e os estados de drift relativos
              ao manifesto do workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {LOCAL_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onChangeInventoryFilter(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  inventoryFilter === option.value
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {agents.map((agent) => {
            const selected = agent.target === selectedTarget;
            const driftCount =
              agent.counts.manifest_missing_local
              + agent.counts.local_outside_manifest
              + agent.counts.missing_in_provider;

            return (
              <button
                key={agent.target}
                onClick={() => onSelectTarget(agent.target)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  selected
                    ? 'border-brand-300 bg-brand-50/50'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', AGENT_BADGE_STYLES[agent.target])}>
                    {agent.label}
                  </span>
                  <span className="text-xs text-gray-400">{agent.counts.total} skill{agent.counts.total === 1 ? '' : 's'}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{agent.skillPath}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {agent.counts.manifest_and_installed} ok
                  </span>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {driftCount} drift
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedAgent ? (
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Manifesto + instalado"
              value={selectedAgent.counts.manifest_and_installed}
              hint="Skills presentes no manifesto e no disco deste agente"
            />
            <SummaryCard
              title="No manifesto, ausente"
              value={selectedAgent.counts.manifest_missing_local}
              hint="Skills que deveriam existir localmente, mas ainda nao foram instaladas"
            />
            <SummaryCard
              title="Local, fora do manifesto"
              value={selectedAgent.counts.local_outside_manifest}
              hint="Conteudo local detectado que nao esta declarado no workspace"
            />
            <SummaryCard
              title="Ausente no provider"
              value={selectedAgent.counts.missing_in_provider}
              hint="Referencias do manifesto que nao existem mais no catalogo da nuvem"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', AGENT_BADGE_STYLES[selectedAgent.target])}>
                {selectedAgent.label}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                Origem: {selectedAgent.source}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                Pasta {selectedAgent.exists ? 'disponivel' : 'ainda nao criada'}
              </span>
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Root path</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-600">{selectedAgent.rootPath}</p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Pasta de skills</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-600">{selectedAgent.skillPath}</p>
          </div>

          {filteredAgentSkills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-gray-300" />
              <h3 className="mt-3 text-sm font-semibold text-gray-900">Nenhuma skill neste filtro</h3>
              <p className="mt-2 text-sm text-gray-500">
                Ajuste o filtro de inventario para revisar outros estados deste agente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAgentSkills.map((skill) => (
                <div key={`${selectedAgent.target}-${skill.name}`} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-900">{skill.name}</span>
                        <AgentSkillStatusBadge status={skill.status} />
                        {skill.type && (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            {skill.type}
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="mt-2 text-sm text-gray-500">{skill.description}</p>
                      )}
                      {skill.localPaths.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            Paths locais
                          </p>
                          {skill.localPaths.map((localPath) => (
                            <p key={localPath} className="break-all font-mono text-xs text-gray-500">
                              {localPath}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {skill.category && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {skill.category}
                        </span>
                      )}
                      {skill.tags.slice(0, 4).map((tag) => (
                        <span
                          key={`${skill.name}-${tag}`}
                          className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                        >
                          {tag}
                        </span>
                      ))}
                      {skill.fileCount > 0 && (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {skill.fileCount} arquivo{skill.fileCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceAppSection({ apps }: { apps: WorkspaceAppInventory[] }) {
  const relevantApps = apps.filter((app) => app.counts.total > 0 || app.supportLevel === 'official_app_unverified_layout');

  if (relevantApps.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-900">Diagnostico de repositorios por app</h3>
        <p className="mt-1 text-xs text-gray-400">
          Este bloco explica quando um artefato esta no lugar oficial, em um repositorio legado ou fora do diretorio que o app realmente le.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {relevantApps.map((app) => (
          <div key={app.appId} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', APP_BADGE_STYLES[app.appId] ?? 'border-gray-200 bg-gray-50 text-gray-700')}>
                    {app.label}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                    {app.supportLevel}
                  </span>
                  {app.deployTarget && (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                      deploy target {app.deployTarget}
                    </span>
                  )}
                </div>

                {app.canonicalPaths.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Paths oficiais</p>
                    {app.canonicalPaths.map((entry) => (
                      <p key={`${app.appId}-canonical-${entry}`} className="mt-1 break-all font-mono text-xs text-gray-500">
                        {entry}
                      </p>
                    ))}
                  </>
                )}

                {app.legacyPaths.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Paths legados</p>
                    {app.legacyPaths.map((entry) => (
                      <p key={`${app.appId}-legacy-${entry}`} className="mt-1 break-all font-mono text-xs text-gray-500">
                        {entry}
                      </p>
                    ))}
                  </>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <MiniCount label="Visiveis" value={app.counts.visible_in_app} tone="emerald" />
                <MiniCount label="Legado" value={app.counts.found_in_legacy_repository} tone="slate" />
                <MiniCount label="Fora do repo" value={app.counts.found_in_wrong_repository} tone="amber" />
                <MiniCount label="Nao carregado" value={app.counts.found_in_workspace_but_not_loaded_by_app} tone="orange" />
                <MiniCount label="Nao verificavel" value={app.counts.found_but_unverifiable_for_app} tone="indigo" />
                <MiniCount label="Ausente" value={app.counts.missing_from_expected_repository} tone="red" />
              </div>
            </div>

            {app.artifacts.length > 0 ? (
              <div className="mt-4 space-y-3">
                {app.artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-900">{artifact.name}</span>
                          <AppArtifactStatusBadge status={artifact.visibilityStatus} />
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            {artifact.artifactKind}
                          </span>
                          {artifact.migratable && (
                            <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                              migracao {artifact.lossiness}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 break-all font-mono text-xs text-gray-500">{artifact.detectedPath}</p>
                        <p className="mt-1 break-all font-mono text-xs text-gray-400">Esperado: {artifact.expectedPath}</p>
                      </div>

                      {artifact.visibilityStatus !== 'visible_in_app' && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          {artifact.visibilityStatus === 'found_in_wrong_repository'
                            ? 'Mover ou copiar para o path oficial.'
                            : artifact.visibilityStatus === 'found_in_legacy_repository'
                              ? 'Repositorio legado detectado; prefira o path oficial novo.'
                              : artifact.visibilityStatus === 'found_but_unverifiable_for_app'
                                ? 'Somente documentacao-base encontrada; sem recomendacao automatica de move.'
                                : 'Revise o path oficial antes de sincronizar.'}
                        </div>
                      )}
                    </div>
                    {artifact.migratable && (
                      <p className="mt-3 text-xs text-gray-500">
                        Planeje a migracao entre apps via CLI/MCP quando quiser converter este artefato para outro repositorio oficial.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500">
                Nenhum artefato local detectado para este app neste workspace.
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
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
          revisar os projetos cadastrados, separar o inventario por agente e controlar o drift local.
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

function MiniCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'slate' | 'amber' | 'orange' | 'indigo' | 'red';
}) {
  const tones: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-orange-50 text-orange-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    red: 'bg-red-50 text-red-700',
  };

  return (
    <div className={cn('rounded-lg border border-transparent px-3 py-2 text-xs font-medium', tones[tone])}>
      <p className="uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
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

function AgentSkillStatusBadge({ status }: { status: WorkspaceAgentSkillStatus }) {
  const meta: Record<WorkspaceAgentSkillStatus, { label: string; className: string }> = {
    manifest_and_installed: {
      label: 'Manifesto + instalado',
      className: 'bg-emerald-100 text-emerald-700',
    },
    manifest_missing_local: {
      label: 'No manifesto, ausente',
      className: 'bg-amber-100 text-amber-700',
    },
    local_outside_manifest: {
      label: 'Local, fora do manifesto',
      className: 'bg-slate-100 text-slate-700',
    },
    missing_in_provider: {
      label: 'Ausente no provider',
      className: 'bg-red-100 text-red-700',
    },
  };

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta[status].className)}>
      {meta[status].label}
    </span>
  );
}

function AppArtifactStatusBadge({ status }: { status: ArtifactVisibilityStatus }) {
  const meta: Record<ArtifactVisibilityStatus, { label: string; className: string }> = {
    visible_in_app: {
      label: 'Visivel no app',
      className: 'bg-emerald-100 text-emerald-700',
    },
    found_in_wrong_repository: {
      label: 'Fora do repo oficial',
      className: 'bg-amber-100 text-amber-700',
    },
    found_in_legacy_repository: {
      label: 'Repositorio legado',
      className: 'bg-slate-100 text-slate-700',
    },
    found_in_workspace_but_not_loaded_by_app: {
      label: 'Nao carregado',
      className: 'bg-orange-100 text-orange-700',
    },
    found_but_unverifiable_for_app: {
      label: 'Nao verificavel',
      className: 'bg-indigo-100 text-indigo-700',
    },
    missing_from_expected_repository: {
      label: 'Ausente no path oficial',
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
