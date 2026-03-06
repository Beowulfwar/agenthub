import { useState } from 'react';
import { X, FolderPlus, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterWorkspace } from '../../hooks/useWorkspace';
import { cn } from '../../lib/utils';

interface CreateWorkspaceDialogProps {
  onClose: () => void;
}

type Mode = 'register' | 'create';

export function CreateWorkspaceDialog({ onClose }: CreateWorkspaceDialogProps) {
  const [mode, setMode] = useState<Mode>('register');
  const [filePath, setFilePath] = useState('');
  const [name, setName] = useState('');
  const registerMutation = useRegisterWorkspace();

  const handleSubmit = () => {
    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      toast.error('Path cannot be empty');
      return;
    }

    const finalPath =
      mode === 'create'
        ? trimmedPath.endsWith('.json')
          ? trimmedPath
          : `${trimmedPath.replace(/\/+$/, '')}/ahub.workspace.json`
        : trimmedPath;

    registerMutation.mutate(
      { filePath: finalPath, create: mode === 'create' },
      {
        onSuccess: () => {
          toast.success(mode === 'create' ? 'Workspace created and registered' : 'Workspace registered');
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Operation failed');
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'register' ? 'Register Workspace' : 'Create Workspace'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setMode('register')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'register'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <FolderOpen className="h-4 w-4" />
            Register existing
          </button>
          <button
            onClick={() => setMode('create')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'create'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <FolderPlus className="h-4 w-4" />
            Create new
          </button>
        </div>

        {/* Form */}
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {mode === 'register' ? 'Manifest file path' : 'Project directory'}
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
              placeholder={
                mode === 'register'
                  ? '/path/to/project/ahub.workspace.json'
                  : '/path/to/project'
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <p className="mt-1 text-xs text-gray-400">
              {mode === 'register'
                ? 'Path to an existing ahub.workspace.json or .ahub.json'
                : 'A new ahub.workspace.json will be created in this directory'}
            </p>
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Workspace name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-project"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={registerMutation.isPending || !filePath.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {mode === 'register' ? (
              <>
                <FolderOpen className="h-4 w-4" />
                {registerMutation.isPending ? 'Registering...' : 'Register'}
              </>
            ) : (
              <>
                <FolderPlus className="h-4 w-4" />
                {registerMutation.isPending ? 'Creating...' : 'Create'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
