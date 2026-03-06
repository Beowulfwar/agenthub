import { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterWorkspace } from '../../hooks/useWorkspace';
import { HoverHint } from '../shared/HoverHint';
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
  const registerMutation = useRegisterWorkspace();

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
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Novo workspace</h2>
            <p className="mt-1 text-sm text-gray-500">
              Escolha uma pasta e, se quiser, defina um nome facil de localizar depois.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                Nome de exibicao <span className="text-gray-400">(opcional)</span>
                <HoverHint text="Use um nome generico, como Projeto principal, para facilitar a busca quando houver muitos workspaces." />
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Projeto principal"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                Pasta selecionada
                <HoverHint text="O workspace sempre e cadastrado pela pasta do projeto. O arquivo interno ahub.workspace.json e criado automaticamente quando faltar." />
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Caminho escolhido
                </p>
                <p className="mt-1 break-all font-mono text-xs text-gray-700">
                  {directory || 'Nenhuma pasta selecionada ainda'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Como funciona
                <HoverHint text="Navegue pelas pastas ao lado, entre no projeto desejado e clique em Selecionar esta pasta. Nao e necessario digitar caminhos." />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                O cadastro e feito pela navegacao visual. As skills desse projeto so entram no
                gerenciamento depois que este workspace for salvo.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Selecionar pasta</h3>
              <HoverHint text="Este navegador mostra locais sugeridos primeiro. Depois voce pode navegar pelas subpastas ate chegar ao projeto." />
            </div>
            <DirectoryBrowser
              initialDir={initialDirectory}
              selectedDir={directory}
              onSelect={(dir) => setDirectory(dir)}
            />
          </section>
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
            <FolderPlus className="h-4 w-4" />
            {registerMutation.isPending ? 'Salvando...' : 'Adicionar workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
