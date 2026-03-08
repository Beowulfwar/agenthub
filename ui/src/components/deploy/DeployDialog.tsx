import { useMemo, useState } from 'react';
import { X, Download, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useSkillsHubDownload } from '../../hooks/useSkills';
import { useWorkspaceRegistry } from '../../hooks/useWorkspace';
import { cn } from '../../lib/utils';
import type { ContentRef, DeployTarget } from '../../api/types';

interface DeployDialogProps {
  contentRefs: ContentRef[];
  onClose: () => void;
  initialWorkspaceFilePath?: string;
  initialTarget?: DeployTarget;
  lockDestination?: boolean;
}

const TARGETS: Array<{ value: DeployTarget; label: string; className: string }> = [
  { value: 'claude-code', label: 'Claude Code', className: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'codex', label: 'Codex', className: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: 'cursor', label: 'Cursor', className: 'border-cyan-300 bg-cyan-50 text-cyan-700' },
];

export function DeployDialog({
  contentRefs,
  onClose,
  initialWorkspaceFilePath,
  initialTarget,
  lockDestination = false,
}: DeployDialogProps) {
  const [workspaceFilePath, setWorkspaceFilePath] = useState(initialWorkspaceFilePath ?? '');
  const [target, setTarget] = useState<DeployTarget | ''>(initialTarget ?? '');
  const downloadMutation = useSkillsHubDownload();
  const workspaceRegistry = useWorkspaceRegistry();

  const selectedWorkspace = useMemo(
    () => workspaceRegistry.data?.find((entry) => entry.filePath === workspaceFilePath) ?? null,
    [workspaceRegistry.data, workspaceFilePath],
  );

  const ready = Boolean(workspaceFilePath && target);

    const handleDeploy = () => {
    if (!workspaceFilePath || !target) {
      toast.error('Selecione um workspace e um agente para baixar os conteudos');
      return;
    }

    downloadMutation.mutate(
      {
        filePath: workspaceFilePath,
        target,
        contents: contentRefs,
        skills: contentRefs.map((ref) => `${ref.type}/${ref.name}`),
      },
      {
        onSuccess: (result) => {
          if (result.failed.length === 0) {
            toast.success(`${result.successful.length} conteudo(s) baixado(s) com sucesso`);
          } else {
            toast.warning(`Baixados ${result.successful.length}, com ${result.failed.length} falha(s)`);
          }
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel baixar os conteudos');
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Baixar conteudos para workspace</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <p className="text-sm text-gray-500">
            {contentRefs.length} conteudo{contentRefs.length !== 1 ? 's' : ''} selecionado{contentRefs.length !== 1 ? 's' : ''}:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {contentRefs.map((ref) => (
              <span
                key={`${ref.type}/${ref.name}`}
                className="rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
              >
                {ref.type}/{ref.name}
              </span>
            ))}
          </div>
        </div>

        {lockDestination ? (
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Destino</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {selectedWorkspace?.manifest?.name?.trim()
                || lastPathSegment(selectedWorkspace?.workspaceDir ?? '')
                || 'Workspace'}
            </p>
            <p className="mt-1 text-xs text-gray-500">{selectedWorkspace?.workspaceDir ?? 'Workspace nao encontrado'}</p>
            <div className="mt-3">
              {target && (
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', targetBadgeClass(target))}>
                  {targetLabel(target)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Workspace</span>
              <select
                value={workspaceFilePath}
                onChange={(e) => {
                  setWorkspaceFilePath(e.target.value);
                  setTarget('');
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Selecione um workspace</option>
                {workspaceRegistry.data?.map((entry) => (
                  <option key={entry.filePath} value={entry.filePath}>
                    {entry.manifest?.name?.trim() || entry.workspaceDir.split('/').pop() || entry.workspaceDir}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-sm font-medium text-gray-700">Agente</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TARGETS.map((entry) => (
                  <button
                    key={entry.value}
                    onClick={() => setTarget(entry.value)}
                    className={cn(
                      'rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
                      target === entry.value ? entry.className : 'border-gray-200 bg-white text-gray-400',
                    )}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {downloadMutation.data && (
          <div className="mt-4 space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
            {downloadMutation.data.successful.map((entry, index) => (
              <div key={`${entry.contentId}-${entry.target}-${index}`} className="flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {entry.contentId} → {entry.target}
              </div>
            ))}
            {downloadMutation.data.failed.map((entry, index) => (
              <div key={`${entry.contentId}-${entry.target}-${index}`} className="flex items-center gap-1.5 text-red-700">
                <XCircle className="h-3.5 w-3.5" />
                {entry.contentId} → {entry.target}: {entry.error}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDeploy}
            disabled={downloadMutation.isPending || !ready}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {downloadMutation.isPending ? 'Baixando...' : 'Baixar no destino'}
          </button>
        </div>
      </div>
    </div>
  );
}

function targetLabel(target: DeployTarget) {
  return TARGETS.find((entry) => entry.value === target)?.label ?? target;
}

function targetBadgeClass(target: DeployTarget) {
  return TARGETS.find((entry) => entry.value === target)?.className ?? 'border-gray-200 bg-white text-gray-700';
}

function lastPathSegment(fullPath: string) {
  const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.at(-1) ?? normalized;
}
