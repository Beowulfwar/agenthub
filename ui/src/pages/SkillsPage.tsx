import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightLeft,
  ChevronDown,
  Cloud,
  FilePenLine,
  FilePlus2,
  Download,
  FolderKanban,
  GitCompare,
  Layers3,
  MoveRight,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchBar } from '../components/skills/SearchBar';
import { EmptyState } from '../components/shared/EmptyState';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import {
  useSkillsHub,
  useSkillsHubDiff,
  useSkillsHubDownload,
  useSkillsHubTransfer,
  useSkillsHubUpload,
  useSkillsHubWorkspace,
  useDeleteWorkspaceRule,
  useSaveWorkspaceRule,
  useWorkspaceRuleContent,
} from '../hooks/useSkills';
import { cn } from '../lib/utils';
import type {
  AgentAppId,
  ContentRef,
  ContentType,
  DeployTarget,
  SkillsHubCloudItem,
  SkillsHubDiffResult,
  SkillsHubStatus,
  SkillsHubWorkspaceAgentDetail,
  SkillsHubWorkspaceRule,
  SkillsHubWorkspaceRulesSection,
  SkillsHubWorkspaceSkill,
  SkillsHubWorkspaceSummary,
} from '../api/types';

const TARGET_META: Record<DeployTarget, { label: string; className: string }> = {
  'claude-code': {
    label: 'Claude Code',
    className: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  codex: {
    label: 'Codex',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  cursor: {
    label: 'Cursor',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  },
};

const STATUS_META: Record<SkillsHubStatus, { label: string; className: string }> = {
  synced: {
    label: 'Sincronizada',
    className: 'bg-emerald-100 text-emerald-700',
  },
  cloud_only: {
    label: 'So na nuvem',
    className: 'bg-sky-100 text-sky-700',
  },
  local_only: {
    label: 'So local',
    className: 'bg-slate-100 text-slate-700',
  },
  diverged: {
    label: 'Divergente',
    className: 'bg-amber-100 text-amber-700',
  },
  missing_in_provider: {
    label: 'Ausente na nuvem',
    className: 'bg-red-100 text-red-700',
  },
};

type TransferDialogState =
  | {
      mode: 'copy' | 'move';
      contents: ContentRef[];
      sourceWorkspaceFilePath: string;
      sourceTarget: DeployTarget;
    }
  | null;

export function SkillsPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'skill' | 'prompt' | 'subagent' | ''>('');
  const [expandedCloud, setExpandedCloud] = useState(true);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());

  const hub = useSkillsHub({
    ...(query ? { q: query } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  });

  const toggleWorkspace = (filePath: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-gray-900">Hub de conteudos</h1>
            <p className="mt-1 text-sm text-gray-500">
              A nuvem continua sendo a base oficial, mas a operacao agora acontece aqui:
              veja workspaces por agente, compare divergencias, baixe, suba, copie e mova
              conteudos sem sair desta tela.
            </p>
          </div>
          {hub.data && (
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                title="Conteudos na nuvem"
                value={hub.data.cloud.total}
                hint="Inventario oficial do provider"
              />
              <SummaryCard
                title="Workspaces"
                value={hub.data.workspaces.length}
                hint="Projetos registrados no Agent Hub"
              />
              <SummaryCard
                title="Divergencias"
                value={hub.data.workspaces.reduce((sum, workspace) => sum + workspace.counts.diverged, 0)}
                hint="Conteudos que exigem comparacao antes de sobrescrever"
              />
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
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
              ...(hub.data?.cloud.availableFilters.types ?? []).map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
        </div>
      </section>

      {hub.isLoading && (
        <LoadingSpinner className="py-20" size="lg" label="Carregando hub de conteudos..." />
      )}

      {hub.error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {hub.error instanceof Error ? hub.error.message : 'Nao foi possivel carregar o hub de conteudos'}
        </div>
      )}

      {!hub.isLoading && !hub.error && hub.data && (
        <>
          <CloudAccordionSection
            cloudItems={hub.data.cloud.items}
            workspaces={hub.data.workspaces}
            expanded={expandedCloud}
            onToggle={() => setExpandedCloud((value) => !value)}
          />

          {hub.data.workspaces.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-12 w-12" />}
              title="Nenhum workspace registrado"
              description="Cadastre um workspace em /workspace para operar conteudos locais aqui."
            />
          ) : (
            <section className="space-y-4">
              {hub.data.workspaces.map((workspace) => (
                <WorkspaceAccordionSection
                  key={workspace.filePath}
                  summary={workspace}
                  allWorkspaces={hub.data.workspaces}
                  expanded={expandedWorkspaces.has(workspace.filePath)}
                  onToggle={() => toggleWorkspace(workspace.filePath)}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CloudAccordionSection({
  cloudItems,
  workspaces,
  expanded,
  onToggle,
}: {
  cloudItems: SkillsHubCloudItem[];
  workspaces: SkillsHubWorkspaceSummary[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);

  const selectedContents = useMemo(
    () => selected
      .map((contentId) => cloudItems.find((item) => item.contentId === contentId))
      .filter((item): item is SkillsHubCloudItem => Boolean(item))
      .map((item) => ({ type: item.type, name: item.name })),
    [cloudItems, selected],
  );

  const toggleSelection = (contentId: string) => {
    setSelected((prev) => (
      prev.includes(contentId)
        ? prev.filter((entry) => entry !== contentId)
        : [...prev, contentId]
    ));
  };

  const openSingleDownload = (contentId: string) => {
    setSelected([contentId]);
    setShowDownloadDialog(true);
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-2">
            <Cloud className="h-5 w-5 text-sky-700" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Nuvem</h2>
            <p className="text-sm text-gray-500">
              {cloudItems.length} conteudo{cloudItems.length === 1 ? '' : 's'} disponivel{cloudItems.length === 1 ? '' : 'eis'} no provider oficial
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
            {cloudItems.reduce((sum, item) => sum + item.workspaceUsageCount, 0)} instalada{cloudItems.reduce((sum, item) => sum + item.workspaceUsageCount, 0) === 1 ? '' : 's'}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-5 py-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-gray-500">
              Expanda a nuvem para descobrir novos conteudos e baixar para qualquer workspace/agente.
            </p>
            <button
              onClick={() => setShowDownloadDialog(true)}
              disabled={selectedContents.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Baixar para... ({selectedContents.length})
            </button>
          </div>

          {cloudItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-500">
              Nenhum conteudo encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="space-y-3">
              {cloudItems.map((item) => (
                <div
                  key={item.contentId}
                  className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.contentId)}
                          onChange={() => toggleSelection(item.contentId)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <Link
                          to={`/skills/${encodeURIComponent(item.type)}/${encodeURIComponent(item.name)}`}
                          className="truncate text-sm font-semibold text-gray-900 hover:text-brand-700"
                        >
                          {item.name}
                        </Link>
                        <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                          {item.type}
                        </span>
                        {item.category && (
                          <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                            {item.category}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-2 text-sm text-gray-500">{item.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {item.workspaceUsageCount} workspace{item.workspaceUsageCount === 1 ? '' : 's'}
                      </span>
                      {item.divergedWorkspaceCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          {item.divergedWorkspaceCount} divergente{item.divergedWorkspaceCount === 1 ? '' : 's'}
                        </span>
                      )}
                      <button
                        onClick={() => openSingleDownload(item.contentId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar para...
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showDownloadDialog && (
        <DownloadToWorkspaceDialog
          contents={selectedContents}
          workspaces={workspaces}
          onClose={() => setShowDownloadDialog(false)}
        />
      )}
    </section>
  );
}

function WorkspaceAccordionSection({
  summary,
  allWorkspaces,
  expanded,
  onToggle,
}: {
  summary: SkillsHubWorkspaceSummary;
  allWorkspaces: SkillsHubWorkspaceSummary[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const detail = useSkillsHubWorkspace(expanded ? summary.filePath : null);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-gray-900">{summary.workspaceName}</h2>
            {summary.isActive && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Ativo
              </span>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-gray-500">{summary.workspaceDir}</p>
        </div>

        <div className="flex items-center gap-2">
          <StatusCountBadge label="Sync" value={summary.counts.synced} tone="emerald" />
          <StatusCountBadge label="Nuvem" value={summary.counts.cloud_only} tone="sky" />
          <StatusCountBadge label="Local" value={summary.counts.local_only} tone="slate" />
          {summary.counts.diverged > 0 && (
            <StatusCountBadge label="Diff" value={summary.counts.diverged} tone="amber" />
          )}
          {summary.counts.missing_in_provider > 0 && (
            <StatusCountBadge label="Ausente" value={summary.counts.missing_in_provider} tone="red" />
          )}
          <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 px-5 py-4">
          {detail.isLoading ? (
            <LoadingSpinner className="py-12" size="md" label="Carregando workspace..." />
          ) : detail.error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {detail.error instanceof Error ? detail.error.message : 'Nao foi possivel carregar o workspace'}
            </div>
          ) : detail.data ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <SummaryCard title="Sincronizadas" value={detail.data.counts.synced} hint="Mesma versao local e nuvem" />
                <SummaryCard title="So na nuvem" value={detail.data.counts.cloud_only} hint="Pode baixar sem comparar" />
                <SummaryCard title="So local" value={detail.data.counts.local_only} hint="Candidatas a upload" />
                <SummaryCard title="Divergentes" value={detail.data.counts.diverged} hint="Exigem comparacao antes de sobrescrever" />
              </div>

              {detail.data.agents.map((agent) => (
                <AgentSection
                  key={`${detail.data!.filePath}-${agent.target}`}
                  workspace={summary}
                  agent={agent}
                  allWorkspaces={allWorkspaces}
                />
              ))}

              {detail.data.rules.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-700">Rules locais por app</h3>
                  </div>
                  {detail.data.rules.map((section) => (
                    <RulesSection
                      key={`${detail.data.filePath}-${section.appId}`}
                      workspace={summary}
                      section={section}
                    />
                  ))}
                </section>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function AgentSection({
  workspace,
  agent,
  allWorkspaces,
}: {
  workspace: SkillsHubWorkspaceSummary;
  agent: SkillsHubWorkspaceAgentDetail;
  allWorkspaces: SkillsHubWorkspaceSummary[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState<TransferDialogState>(null);
  const [compareContent, setCompareContent] = useState<ContentRef | null>(null);
  const uploadMutation = useSkillsHubUpload();

  const selectedSkills = useMemo(
    () => agent.skills.filter((skill) => selected.includes(skill.contentId)),
    [agent.skills, selected],
  );
  const hasDivergedSelection = selectedSkills.some((skill) => skill.status === 'diverged');

  const toggleSelection = (contentId: string) => {
    setSelected((prev) => (
      prev.includes(contentId)
        ? prev.filter((entry) => entry !== contentId)
        : [...prev, contentId]
    ));
  };

  const handleBatchUpload = () => {
    if (selectedSkills.length === 0) {
      return;
    }
    if (hasDivergedSelection) {
      toast.error('Compare cada conteudo divergente individualmente antes de subir para a nuvem.');
      return;
    }

    uploadMutation.mutate(
      {
        filePath: workspace.filePath,
        target: agent.target,
        contents: selectedSkills.map((skill) => ({ type: skill.type ?? 'skill', name: skill.name })),
        skills: selectedSkills.map((skill) => skill.contentId),
      },
      {
        onSuccess: (result) => {
          toastForActionResult(result, 'Upload concluido');
          setSelected([]);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel subir os conteudos');
        },
      },
    );
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', TARGET_META[agent.target].className)}>
              {agent.label}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200">
              {agent.skills.length} conteudo{agent.skills.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-gray-500">{agent.skillPath}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowDownloadDialog(true)}
            disabled={selectedSkills.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Baixar ({selectedSkills.length})
          </button>
          <button
            onClick={handleBatchUpload}
            disabled={selectedSkills.length === 0 || uploadMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Subir para nuvem
          </button>
          <button
            onClick={() => setTransferDialog({
              mode: 'copy',
              contents: selectedSkills.map((skill) => ({ type: skill.type ?? 'skill', name: skill.name })),
              sourceWorkspaceFilePath: workspace.filePath,
              sourceTarget: agent.target,
            })}
            disabled={selectedSkills.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Copiar para...
          </button>
          <button
            onClick={() => setTransferDialog({
              mode: 'move',
              contents: selectedSkills.map((skill) => ({ type: skill.type ?? 'skill', name: skill.name })),
              sourceWorkspaceFilePath: workspace.filePath,
              sourceTarget: agent.target,
            })}
            disabled={selectedSkills.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-50"
          >
            <MoveRight className="h-4 w-4" />
            Mover para...
          </button>
        </div>
      </div>

      {hasDivergedSelection && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          O upload em lote ignora sobrescrita automatica. Compare cada conteudo divergente individualmente antes de confirmar.
        </div>
      )}

      {agent.skills.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-500">
          Nenhum conteudo detectado para este agente.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {agent.skills.map((skill) => (
            <div key={`${workspace.filePath}-${agent.target}-${skill.contentId}`} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(skill.contentId)}
                      onChange={() => toggleSelection(skill.contentId)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="truncate text-sm font-semibold text-gray-900">{skill.name}</span>
                    <StatusBadge status={skill.status} />
                    {skill.type && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {skill.type}
                      </span>
                    )}
                    {skill.inManifest ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        no manifesto
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        fora do manifesto
                      </span>
                    )}
                  </div>

                  {skill.description && (
                    <p className="mt-2 text-sm text-gray-500">{skill.description}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {skill.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                      >
                        {tag}
                      </span>
                    ))}
                    {skill.warning && (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        sync com aviso
                      </span>
                    )}
                  </div>

                  {skill.localPaths.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {skill.localPaths.map((localPath) => (
                        <p key={localPath} className="break-all font-mono text-xs text-gray-500">
                          {localPath}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(skill.status === 'cloud_only') && (
                    <button
                      onClick={() => {
                        setSelected([skill.contentId]);
                        setShowDownloadDialog(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Baixar
                    </button>
                  )}

                  {skill.status === 'diverged' ? (
                    <button
                      onClick={() => setCompareContent({ type: skill.type ?? 'skill', name: skill.name })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                      Comparar
                    </button>
                  ) : skill.installedLocally ? (
                    <button
                      onClick={() => {
                        uploadMutation.mutate(
                          {
                            filePath: workspace.filePath,
                            target: agent.target,
                            contents: [{ type: skill.type ?? 'skill', name: skill.name }],
                            skills: [skill.contentId],
                          },
                          {
                            onSuccess: (result) => toastForActionResult(result, 'Upload concluido'),
                            onError: (err) => toast.error(err instanceof Error ? err.message : 'Nao foi possivel subir o conteudo'),
                          },
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Subir
                    </button>
                  ) : null}

                  {skill.installedLocally && (
                    <>
                      <button
                        onClick={() => setTransferDialog({
                          mode: 'copy',
                          contents: [{ type: skill.type ?? 'skill', name: skill.name }],
                          sourceWorkspaceFilePath: workspace.filePath,
                          sourceTarget: agent.target,
                        })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Copiar
                      </button>
                      <button
                        onClick={() => setTransferDialog({
                          mode: 'move',
                          contents: [{ type: skill.type ?? 'skill', name: skill.name }],
                          sourceWorkspaceFilePath: workspace.filePath,
                          sourceTarget: agent.target,
                        })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <MoveRight className="h-3.5 w-3.5" />
                        Mover
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDownloadDialog && (
        <DownloadToWorkspaceDialog
          contents={selectedSkills.length > 0 ? selectedSkills.map((skill) => ({ type: skill.type ?? 'skill', name: skill.name })) : []}
          workspaces={allWorkspaces}
          initialFilePath={workspace.filePath}
          initialTarget={agent.target}
          lockDestination
          onClose={() => setShowDownloadDialog(false)}
        />
      )}

      {transferDialog && (
        <TransferDialog
          state={transferDialog}
          workspaces={allWorkspaces}
          onClose={() => setTransferDialog(null)}
        />
      )}

      {compareContent && (
        <CompareDialog
          filePath={workspace.filePath}
          workspaceName={workspace.workspaceName}
          target={agent.target}
          contentRef={compareContent}
          onClose={() => setCompareContent(null)}
        />
      )}
    </section>
  );
}

function DownloadToWorkspaceDialog({
  contents,
  workspaces,
  initialFilePath,
  initialTarget,
  lockDestination = false,
  onClose,
}: {
  contents: ContentRef[];
  workspaces: SkillsHubWorkspaceSummary[];
  initialFilePath?: string;
  initialTarget?: DeployTarget;
  lockDestination?: boolean;
  onClose: () => void;
}) {
  const [filePath, setFilePath] = useState(initialFilePath ?? '');
  const [target, setTarget] = useState<DeployTarget | ''>(initialTarget ?? '');
  const mutation = useSkillsHubDownload();
  const selectedWorkspace = workspaces.find((workspace) => workspace.filePath === filePath) ?? null;

  const handleConfirm = () => {
    if (!filePath || !target || contents.length === 0) {
      toast.error('Selecione um workspace, um agente e pelo menos um conteudo.');
      return;
    }

    mutation.mutate(
      {
        filePath,
        target,
        contents,
        skills: contents.map((ref) => `${ref.type}/${ref.name}`),
      },
      {
        onSuccess: (result) => {
          toastForActionResult(result, 'Download concluido');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel baixar os conteudos');
        },
      },
    );
  };

  return (
    <ModalShell title="Baixar conteudos para workspace" onClose={onClose}>
      <p className="text-sm text-gray-500">
        A operacao adiciona o target ao manifesto e faz deploy imediato da versao da nuvem.
      </p>

      <SkillChipRow contents={contents} className="mt-4" />

      {lockDestination ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Destino</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{selectedWorkspace?.workspaceName}</p>
          <p className="mt-1 text-xs text-gray-500">{selectedWorkspace?.workspaceDir}</p>
          {target && (
            <span className={cn('mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', TARGET_META[target].className)}>
              {TARGET_META[target].label}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <SelectField
            label="Workspace"
            value={filePath}
            onChange={setFilePath}
            options={[
              { value: '', label: 'Selecione um workspace' },
              ...workspaces.map((workspace) => ({
                value: workspace.filePath,
                label: workspace.workspaceName,
              })),
            ]}
          />
          <TargetSelector target={target} onChange={setTarget} />
        </div>
      )}

      <ModalActions
        confirmLabel={mutation.isPending ? 'Baixando...' : 'Baixar agora'}
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmDisabled={mutation.isPending || !filePath || !target || contents.length === 0}
      />
    </ModalShell>
  );
}

function TransferDialog({
  state,
  workspaces,
  onClose,
}: {
  state: NonNullable<TransferDialogState>;
  workspaces: SkillsHubWorkspaceSummary[];
  onClose: () => void;
}) {
  const [destinationWorkspaceFilePath, setDestinationWorkspaceFilePath] = useState('');
  const [destinationTarget, setDestinationTarget] = useState<DeployTarget | ''>('');
  const mutation = useSkillsHubTransfer();

  const handleConfirm = () => {
    if (!destinationWorkspaceFilePath || !destinationTarget) {
      toast.error('Selecione o workspace e o agente de destino.');
      return;
    }

    mutation.mutate(
      {
        sourceWorkspaceFilePath: state.sourceWorkspaceFilePath,
        sourceTarget: state.sourceTarget,
        destinationWorkspaceFilePath,
        destinationTarget,
        contents: state.contents,
        skills: state.contents.map((ref) => `${ref.type}/${ref.name}`),
        mode: state.mode,
      },
      {
        onSuccess: (result) => {
          toastForActionResult(result, state.mode === 'move' ? 'Movimentacao concluida' : 'Copia concluida');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel transferir os conteudos');
        },
      },
    );
  };

  return (
    <ModalShell
      title={state.mode === 'move' ? 'Mover conteudos' : 'Copiar conteudos'}
      onClose={onClose}
    >
      <p className="text-sm text-gray-500">
        {state.mode === 'move'
          ? 'Mover copia para o destino, remove o target da origem e faz undeploy do agente original.'
          : 'Copiar preserva a origem e adiciona o target no destino.'}
      </p>

      <SkillChipRow contents={state.contents} className="mt-4" />

      <div className="mt-4 space-y-4">
        <SelectField
          label="Workspace de destino"
          value={destinationWorkspaceFilePath}
          onChange={setDestinationWorkspaceFilePath}
          options={[
            { value: '', label: 'Selecione um workspace' },
            ...workspaces.map((workspace) => ({
              value: workspace.filePath,
              label: workspace.workspaceName,
            })),
          ]}
        />
        <TargetSelector target={destinationTarget} onChange={setDestinationTarget} />
      </div>

      <ModalActions
        confirmLabel={mutation.isPending ? 'Enviando...' : state.mode === 'move' ? 'Mover agora' : 'Copiar agora'}
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmDisabled={mutation.isPending || !destinationWorkspaceFilePath || !destinationTarget}
      />
    </ModalShell>
  );
}

function RulesSection({
  workspace,
  section,
}: {
  workspace: SkillsHubWorkspaceSummary;
  section: SkillsHubWorkspaceRulesSection;
}) {
  const [editingRule, setEditingRule] = useState<SkillsHubWorkspaceRule | null>(null);
  const [creating, setCreating] = useState(false);
  const deleteRuleMutation = useDeleteWorkspaceRule();

  const handleDelete = (rule: SkillsHubWorkspaceRule) => {
    if (!rule.writable) {
      return;
    }
    if (!confirm(`Remover a regra local "${rule.name}" deste workspace?`)) {
      return;
    }

    deleteRuleMutation.mutate(
      {
        filePath: workspace.filePath,
        appId: rule.appId,
        name: rule.name,
        detectedPath: rule.detectedPath,
      },
      {
        onSuccess: () => toast.success(`Regra "${rule.name}" removida`),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Nao foi possivel remover a regra'),
      },
    );
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700">
              {section.label}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {section.rules.length} rule{section.rules.length === 1 ? '' : 's'}
            </span>
            {section.writable ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                edicao local suportada
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                detect-only
              </span>
            )}
          </div>
          {section.canonicalPaths[0] && (
            <p className="mt-2 break-all font-mono text-xs text-gray-500">{section.canonicalPaths[0]}</p>
          )}
        </div>

        {section.writable && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <FilePlus2 className="h-4 w-4" />
            Nova rule
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {section.rules.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">{rule.name}</span>
                  <span className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-medium',
                    rule.source === 'projected'
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-slate-100 text-slate-700',
                  )}>
                    {rule.source === 'projected' ? 'projected' : 'local'}
                  </span>
                  {rule.projectedFrom && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {rule.projectedFrom.type}/{rule.projectedFrom.name}
                    </span>
                  )}
                </div>
                <p className="mt-2 break-all font-mono text-xs text-gray-500">{rule.detectedPath}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {rule.writable && (
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                  >
                    <FilePenLine className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {rule.writable && (
                  <button
                    onClick={() => handleDelete(rule)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(editingRule || creating) && (
        <RuleEditorDialog
          workspaceFilePath={workspace.filePath}
          appId={section.appId}
          rule={editingRule}
          onClose={() => {
            setEditingRule(null);
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}

function RuleEditorDialog({
  workspaceFilePath,
  appId,
  rule,
  onClose,
}: {
  workspaceFilePath: string;
  appId: AgentAppId;
  rule: SkillsHubWorkspaceRule | null;
  onClose: () => void;
}) {
  const ruleContent = useWorkspaceRuleContent(rule
    ? {
        filePath: workspaceFilePath,
        appId,
        name: rule.name,
        detectedPath: rule.detectedPath,
      }
    : null);
  const saveRuleMutation = useSaveWorkspaceRule();
  const [name, setName] = useState(rule?.name ?? '');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (rule && typeof ruleContent.data?.content === 'string') {
      setContent(ruleContent.data.content);
    }
  }, [rule, ruleContent.data?.content]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Informe um nome para a rule.');
      return;
    }

    saveRuleMutation.mutate(
      {
        filePath: workspaceFilePath,
        appId,
        name: name.trim(),
        content,
        detectedPath: rule?.detectedPath,
      },
      {
        onSuccess: () => {
          toast.success(rule ? 'Rule atualizada' : 'Rule criada');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel salvar a rule');
        },
      },
    );
  };

  return (
    <ModalShell title={rule ? `Editar rule ${rule.name}` : 'Nova rule local'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Nome</label>
          <input
            type="text"
            value={name}
            disabled={Boolean(rule)}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-gray-50"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Conteudo</label>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={16}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>
      <ModalActions
        confirmLabel={saveRuleMutation.isPending ? 'Salvando...' : 'Salvar rule'}
        onClose={onClose}
        onConfirm={handleSave}
        confirmDisabled={saveRuleMutation.isPending || !name.trim() || !content.trim() || (rule ? ruleContent.isLoading : false)}
      />
    </ModalShell>
  );
}

function CompareDialog({
  filePath,
  workspaceName,
  target,
  contentRef,
  onClose,
}: {
  filePath: string;
  workspaceName: string;
  target: DeployTarget;
  contentRef: ContentRef;
  onClose: () => void;
}) {
  const diff = useSkillsHubDiff({ filePath, target, name: contentRef.name, type: contentRef.type });
  const uploadMutation = useSkillsHubUpload();
  const downloadMutation = useSkillsHubDownload();

  const result = diff.data;

  const handleUpload = () => {
    uploadMutation.mutate(
      {
        filePath,
        target,
        contents: [contentRef],
        skills: [`${contentRef.type}/${contentRef.name}`],
        force: true,
      },
      {
        onSuccess: (mutationResult) => {
          toastForActionResult(mutationResult, 'Upload concluido');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel subir o conteudo');
        },
      },
    );
  };

  const handleDownload = () => {
    downloadMutation.mutate(
      {
        filePath,
        target,
        contents: [contentRef],
        skills: [`${contentRef.type}/${contentRef.name}`],
      },
      {
        onSuccess: (mutationResult) => {
          toastForActionResult(mutationResult, 'Download concluido');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel baixar o conteudo');
        },
      },
    );
  };

  return (
    <ModalShell title={`Comparar ${contentRef.type}/${contentRef.name}`} onClose={onClose} size="6xl">
      {diff.isLoading ? (
        <LoadingSpinner className="py-14" size="md" label="Montando comparacao..." />
      ) : diff.error ? (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {diff.error instanceof Error ? diff.error.message : 'Nao foi possivel montar a comparacao'}
        </div>
      ) : result ? (
        <>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={result.status} />
              <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', TARGET_META[target].className)}>
                {workspaceName} · {TARGET_META[target].label}
              </span>
            </div>
            {result.warning && (
              <p className="mt-3 text-sm text-amber-700">{result.warning}</p>
            )}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ComparePane title="Local" side={result.local} emptyLabel="Nenhuma versao local encontrada." />
            <ComparePane title="Nuvem" side={result.cloud} emptyLabel="Nenhuma versao encontrada no provider." />
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {result.canDownload && (
              <button
                onClick={handleDownload}
                disabled={downloadMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {downloadMutation.isPending ? 'Baixando...' : 'Baixar da nuvem'}
              </button>
            )}
            {result.canUpload && (
              <button
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {uploadMutation.isPending ? 'Subindo...' : 'Subir para nuvem'}
              </button>
            )}
          </div>
        </>
      ) : null}
    </ModalShell>
  );
}

function ComparePane({
  title,
  side,
  emptyLabel,
}: {
  title: string;
  side: SkillsHubDiffResult['local'];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {side.detectedPath && (
          <p className="mt-1 break-all font-mono text-xs text-gray-500">{side.detectedPath}</p>
        )}
      </div>
      <div className="p-4">
        {!side.exists || !side.preview ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-sm text-gray-500">
            {emptyLabel}
          </div>
        ) : (
          <pre className="max-h-[24rem] overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">
            {side.preview}
          </pre>
        )}
      </div>
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  size = '2xl',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: '2xl' | '6xl';
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={cn('w-full rounded-2xl bg-white p-6 shadow-xl', size === '6xl' ? 'max-w-6xl' : 'max-w-2xl')}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-sm font-medium text-gray-500 hover:text-gray-700">
            Fechar
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({
  confirmLabel,
  onClose,
  onConfirm,
  confirmDisabled = false,
}: {
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-3">
      <button
        onClick={onClose}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancelar
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function TargetSelector({
  target,
  onChange,
}: {
  target: DeployTarget | '';
  onChange: (target: DeployTarget) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Agente</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(TARGET_META) as DeployTarget[]).map((value) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={cn(
              'rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
              target === value ? TARGET_META[value].className : 'border-gray-200 bg-white text-gray-400',
            )}
          >
            {TARGET_META[value].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkillChipRow({
  contents,
  className,
}: {
  contents: ContentRef[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {contents.map((content) => (
        <span
          key={`${content.type}/${content.name}`}
          className="rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
        >
          {content.type}/{content.name}
        </span>
      ))}
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

function StatusBadge({ status }: { status: SkillsHubStatus }) {
  const meta = STATUS_META[status];

  return (
    <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', meta.className)}>
      {meta.label}
    </span>
  );
}

function StatusCountBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'sky' | 'slate' | 'amber' | 'red';
}) {
  const className: Record<typeof tone, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', className[tone])}>
      {label}: {value}
    </span>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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

function toastForActionResult(result: {
  successful: Array<{ contentId?: string; skill: string; warning?: string }>;
  failed: Array<{ contentId?: string; skill: string; error: string }>;
}, successTitle: string) {
  if (result.failed.length === 0) {
    const warningCount = result.successful.filter((entry) => entry.warning).length;
    if (warningCount > 0) {
      toast.warning(`${successTitle}: ${result.successful.length} conteudo(s) processado(s), com ${warningCount} aviso(s).`);
    } else {
      toast.success(`${successTitle}: ${result.successful.length} conteudo(s) processado(s).`);
    }
    return;
  }

  const errorPreview = result.failed
    .slice(0, 2)
    .map((entry) => `${entry.contentId ?? entry.skill}: ${entry.error}`)
    .join(' | ');
  toast.warning(`${successTitle}: ${result.successful.length} sucesso(s), ${result.failed.length} falha(s). ${errorPreview}`);
}
