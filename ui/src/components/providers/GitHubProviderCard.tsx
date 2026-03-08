import { useState } from 'react';
import { AlertTriangle, Cloud, FolderSync, Github, Loader2, RefreshCcw, ShieldCheck, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import type { GitHubConnectionStatus, ProvidersOverview } from '../../api/types';
import {
  useBootstrapGitHubRepository,
  useDisconnectGitHub,
  useGitHubSyncPreview,
  useRunGitHubSync,
} from '../../hooks/useProviders';
import { GitHubConnectDialog } from './GitHubConnectDialog';

interface GitHubProviderCardProps {
  providers: ProvidersOverview;
}

export function GitHubProviderCard({ providers }: GitHubProviderCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const github = providers.github;
  const syncPreview = useGitHubSyncPreview(github.connected);
  const bootstrap = useBootstrapGitHubRepository();
  const disconnect = useDisconnectGitHub();
  const sync = useRunGitHubSync();

  async function handleBootstrap() {
    try {
      await bootstrap.mutateAsync();
      toast.success('Estrutura inicial do repositório validada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao bootstrapar o repositório GitHub.');
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success('GitHub desconectado.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao desconectar o GitHub.');
    }
  }

  async function handleSync() {
    try {
      const result = await sync.mutateAsync();
      const summary = [
        result.creates.length && `${result.creates.length} criados`,
        result.updates.length && `${result.updates.length} atualizados`,
        result.deletes.length && `${result.deletes.length} removidos`,
        result.conflicts.length && `${result.conflicts.length} conflitos`,
      ]
        .filter(Boolean)
        .join(', ');
      toast.success(summary ? `Sync concluido: ${summary}.` : 'Sync concluido sem alteracoes.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao sincronizar com o GitHub.');
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              <Github className="h-3.5 w-3.5" />
              GitHub Cloud
            </div>
            <h3 className="mt-3 text-lg font-semibold text-slate-950">
              Repositório remoto opcional para prompts e skills
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              O Agent Hub continua local. O GitHub entra apenas como armazenamento remoto sincronizado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!github.connected && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <Github className="h-4 w-4" />
                {github.reauthorizationRequired ? 'Reconectar' : 'Conectar'}
              </button>
            )}

            {github.connected && (
              <>
                <ActionButton
                  icon={<RefreshCcw className="h-4 w-4" />}
                  busy={bootstrap.isPending}
                  label="Bootstrap"
                  onClick={handleBootstrap}
                />
                <ActionButton
                  icon={<FolderSync className="h-4 w-4" />}
                  busy={sync.isPending}
                  label="Sincronizar agora"
                  onClick={handleSync}
                />
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Desconectar
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <StatusPanel github={github} />
          <SyncPanel
            github={github}
            preview={syncPreview.data}
            loading={syncPreview.isLoading}
            localDirectory={providers.local.directory}
          />
        </div>
      </div>

      <GitHubConnectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

function StatusPanel({ github }: { github: GitHubConnectionStatus }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        {github.connected ? (
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
        ) : github.reauthorizationRequired ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <Cloud className="h-4 w-4 text-slate-400" />
        )}
        Estado da conexão
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <StatusRow label="Status" value={github.connected ? 'Conectado' : github.reauthorizationRequired ? 'Reconexao necessaria' : 'Nao conectado'} />
        <StatusRow label="Conta" value={github.accountLogin ?? '-'} />
        <StatusRow
          label="Repositorio"
          value={github.repo ? `${github.repo.owner}/${github.repo.name}` : '-'}
        />
        <StatusRow label="Branch" value={github.repo?.branch ?? '-'} />
        <StatusRow label="Escopos" value={github.scopes?.join(', ') || '-'} />
      </div>
    </div>
  );
}

function SyncPanel({
  github,
  preview,
  loading,
  localDirectory,
}: {
  github: GitHubConnectionStatus;
  preview?: {
    creates: string[];
    updates: string[];
    deletes: string[];
    skipped: string[];
    conflicts: Array<{ path: string; reason: string }>;
    manifestPresent: boolean;
  };
  loading: boolean;
  localDirectory: string | null;
}) {
  if (!github.connected) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        Conecte o GitHub para habilitar bootstrap do repositório e sincronização do storage local.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando prévia de sincronização...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <FolderSync className="h-4 w-4 text-sky-600" />
        Sincronização local → GitHub
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Fonte local canônica: <span className="font-medium text-slate-700">{localDirectory ?? 'nao configurada'}</span>
      </p>

      {preview ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <CountChip label="Criar" value={preview.creates.length} tone="blue" />
            <CountChip label="Atualizar" value={preview.updates.length} tone="amber" />
            <CountChip label="Remover" value={preview.deletes.length} tone="rose" />
            <CountChip label="Ignorar" value={preview.skipped.length} tone="slate" />
            <CountChip label="Conflitos" value={preview.conflicts.length} tone="violet" />
          </div>

          {!preview.manifestPresent && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              O manifesto remoto ainda nao existe. O bootstrap vai criá-lo no primeiro sync.
            </p>
          )}

          {preview.conflicts.length > 0 && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <p className="font-medium">Arquivos em conflito</p>
              <ul className="mt-2 space-y-1">
                {preview.conflicts.slice(0, 5).map((conflict) => (
                  <li key={conflict.path}>
                    <span className="font-mono text-xs">{conflict.path}</span> — {conflict.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Nenhuma prévia disponível.</p>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'blue' | 'amber' | 'rose' | 'slate' | 'violet';
}) {
  const tones: Record<typeof tone, string> = {
    blue: 'border-sky-200 bg-sky-50 text-sky-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
  };

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
