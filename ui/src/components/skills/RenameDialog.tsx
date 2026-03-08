import { useState } from 'react';
import axios from 'axios';
import { X, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { useRenameContent } from '../../hooks/useSkills';
import type { ContentRef } from '../../api/types';

interface RenameDialogProps {
  contentRef: ContentRef;
  onClose: () => void;
  onSuccess: (newName: string) => void;
}

export function RenameDialog({ contentRef, onClose, onSuccess }: RenameDialogProps) {
  const [newName, setNewName] = useState(contentRef.name);
  const renameMutation = useRenameContent();

  const handleRename = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }
    if (trimmed === contentRef.name) {
      toast.error('New name must be different');
      return;
    }

    renameMutation.mutate(
      { ref: contentRef, newName: trimmed },
      {
        onSuccess: (result) => {
          toast.success(`Renomeado "${result.oldName}" para "${result.newName}"`);
          onSuccess(result.newName);
        },
        onError: (err) => {
          if (axios.isAxiosError(err) && err.response?.status === 409) {
            toast.error(`Ja existe um conteudo "${trimmed}"`);
          } else {
            toast.error(err instanceof Error ? err.message : 'Falha ao renomear');
          }
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Renomear conteudo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          Renomear <span className="font-medium text-gray-700">{contentRef.type}/{contentRef.name}</span>
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Novo nome</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleRename}
            disabled={renameMutation.isPending || !newName.trim() || newName.trim() === contentRef.name}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <PenLine className="h-4 w-4" />
            {renameMutation.isPending ? 'Renomeando...' : 'Renomear'}
          </button>
        </div>
      </div>
    </div>
  );
}
