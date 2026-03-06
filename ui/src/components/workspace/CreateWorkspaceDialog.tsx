import { useState } from 'react';
import { X, FolderPlus, ExternalLink, Loader2, FolderSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterWorkspace } from '../../hooks/useWorkspace';
import { pickNativeDirectory } from '../../api/client';
import { DirectoryBrowser } from './DirectoryBrowser';

interface CreateWorkspaceDialogProps {
  onClose: () => void;
  initialDirectory?: string;
  initialName?: string;
}

export function CreateWorkspaceDialog({
  onClose,
  initialDirectory = '',
  initialName = '',
}: CreateWorkspaceDialogProps) {
  const [directory, setDirectory] = useState(initialDirectory);
  const [name, setName] = useState(initialName);
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const registerMutation = useRegisterWorkspace();

  const openSystemPicker = async () => {
    setPickingDirectory(true);

    try {
      const { selectedDir } = await pickNativeDirectory(directory.trim() || undefined);
      if (selectedDir) {
        setDirectory(selectedDir);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nao foi possivel abrir o explorador do sistema');
    } finally {
      setPickingDirectory(false);
    }
  };

  const handleSubmit = () => {
    const trimmedDirectory = directory.trim();
    if (!trimmedDirectory) {
      toast.error('Selecione uma pasta para registrar o workspace');
      return;
    }

    registerMutation.mutate(
      {
        directory: trimmedDirectory,
        name: name.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Workspace adicionado');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Nao foi possivel adicionar o workspace');
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Novo workspace</h2>
            <p className="mt-1 text-sm text-gray-500">
              Qualquer pasta pode ser um workspace. Se o arquivo{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                ahub.workspace.json
              </code>{' '}
              ainda nao existir, o Agent Hub cria esse perfil automaticamente.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nome do workspace <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Projeto principal"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <p className="mt-1 text-xs text-gray-400">
              Esse nome facilita a busca quando voce tiver muitos workspaces na maquina.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Pasta do workspace</label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="/caminho/do/projeto"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                type="button"
                onClick={openSystemPicker}
                disabled={pickingDirectory}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pickingDirectory ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Explorador do sistema
              </button>
              <button
                type="button"
                onClick={() => setShowBrowser((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FolderSearch className="h-4 w-4" />
                {showBrowser ? 'Ocultar navegador' : 'Navegar aqui'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              O cadastro e sempre feito pela pasta. Skills so aparecem na tela depois que o workspace entra nesta lista.
            </p>
          </div>

          {directory.trim() && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Workspace selecionado</p>
              <p className="mt-1 break-all font-mono text-xs text-gray-700">{directory}</p>
            </div>
          )}

          {showBrowser && (
            <div className="rounded-xl border border-gray-200 p-4">
              <DirectoryBrowser
                onSelect={(dir) => {
                  setDirectory(dir);
                  setShowBrowser(false);
                }}
                onCancel={() => setShowBrowser(false)}
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={registerMutation.isPending || !directory.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {registerMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
            Adicionar workspace
          </button>
        </div>
      </div>
    </div>
  );
}
