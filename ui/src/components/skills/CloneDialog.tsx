import { useState } from 'react';
import axios from 'axios';
import { X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useCloneSkill } from '../../hooks/useSkills';

interface CloneDialogProps {
  skillName: string;
  onClose: () => void;
  onSuccess: (newName: string) => void;
}

export function CloneDialog({ skillName, onClose, onSuccess }: CloneDialogProps) {
  const [newName, setNewName] = useState(`${skillName}-copy`);
  const cloneMutation = useCloneSkill();

  const handleClone = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }

    cloneMutation.mutate(
      { name: skillName, newName: trimmed },
      {
        onSuccess: (result) => {
          toast.success(`Cloned "${skillName}" as "${result.name}"`);
          onSuccess(result.name);
        },
        onError: (err) => {
          if (axios.isAxiosError(err) && err.response?.status === 409) {
            toast.error(`Skill "${trimmed}" already exists`);
          } else {
            toast.error(err instanceof Error ? err.message : 'Clone failed');
          }
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Clone Skill</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-500">
          Create a copy of <span className="font-medium text-gray-700">{skillName}</span>
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">New name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleClone()}
            autoFocus
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={cloneMutation.isPending || !newName.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            {cloneMutation.isPending ? 'Cloning...' : 'Clone'}
          </button>
        </div>
      </div>
    </div>
  );
}
