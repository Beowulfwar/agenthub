import { useEffect, useRef, useState } from 'react';
import { Github, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

import { useRefreshProviders, useStartGitHubOAuth } from '../../hooks/useProviders';
import type { GitHubRepoVisibility } from '../../api/types';

interface GitHubConnectDialogProps {
  open: boolean;
  onClose: () => void;
}

interface GitHubOAuthPopupMessage {
  source: 'agent-hub:github-oauth';
  ok: boolean;
  error?: string;
  accountLogin?: string;
  repo?: string;
  owner?: string;
}

export function GitHubConnectDialog({ open, onClose }: GitHubConnectDialogProps) {
  const [repoName, setRepoName] = useState('agent-hub');
  const [visibility, setVisibility] = useState<GitHubRepoVisibility>('private');
  const popupRef = useRef<Window | null>(null);
  const callbackOriginRef = useRef<string | null>(null);
  const refreshProviders = useRefreshProviders();
  const startOAuth = useStartGitHubOAuth();

  useEffect(() => {
    if (!open) return undefined;

    const onMessage = (event: MessageEvent<GitHubOAuthPopupMessage>) => {
      if (callbackOriginRef.current && event.origin !== callbackOriginRef.current) {
        return;
      }
      if (!event.data || event.data.source !== 'agent-hub:github-oauth') {
        return;
      }

      popupRef.current?.close();
      popupRef.current = null;
      callbackOriginRef.current = null;

      if (event.data.ok) {
        toast.success(
          event.data.repo && event.data.owner
            ? `GitHub conectado em ${event.data.owner}/${event.data.repo}`
            : 'GitHub conectado.',
        );
        refreshProviders();
        onClose();
        return;
      }

      toast.error(event.data.error ?? 'Falha ao conectar com o GitHub.');
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [open, onClose, refreshProviders]);

  if (!open) {
    return null;
  }

  async function handleConnect() {
    try {
      const result = await startOAuth.mutateAsync({ repoName, visibility });
      callbackOriginRef.current = result.callbackOrigin;
      popupRef.current = window.open(
        result.authorizationUrl,
        'agent-hub-github-oauth',
        'popup=yes,width=720,height=820,resizable=yes,scrollbars=yes',
      );

      if (!popupRef.current) {
        toast.error('O navegador bloqueou a janela de autenticacao.');
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao iniciar autenticacao GitHub.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Conectar GitHub</h3>
            <p className="mt-1 text-sm text-slate-500">
              Autorize o Agent Hub a criar um repositório remoto opcional para prompts e skills.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Nome do repositório
            </label>
            <input
              type="text"
              value={repoName}
              onChange={(event) => setRepoName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-950"
              placeholder="agent-hub"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Visibilidade
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <VisibilityOption
                label="Privado"
                description="Recomendado para uso pessoal."
                selected={visibility === 'private'}
                onClick={() => setVisibility('private')}
              />
              <VisibilityOption
                label="Publico"
                description="Apenas se quiser compartilhar o repo."
                selected={visibility === 'public'}
                onClick={() => setVisibility('public')}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={startOAuth.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {startOAuth.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
            {startOAuth.isPending ? 'Abrindo GitHub...' : 'Conectar com GitHub'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VisibilityOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-xl border px-3 py-3 text-left transition',
        selected
          ? 'border-slate-950 bg-slate-950 text-white'
          : 'border-slate-300 bg-white text-slate-900 hover:border-slate-500',
      ].join(' ')}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={`mt-1 text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{description}</div>
    </button>
  );
}
