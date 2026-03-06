import { useState } from 'react';
import { X, FolderPlus, FolderOpen, FolderSearch, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterWorkspace } from '../../hooks/useWorkspace';
import { pickNativeDirectory } from '../../api/client';
import { cn } from '../../lib/utils';
import { DirectoryBrowser } from './DirectoryBrowser';
import type { DetectedSkillDir } from '../../api/types';

interface CreateWorkspaceDialogProps {
  onClose: () => void;
}

type Mode = 'browse' | 'register' | 'create';

export function CreateWorkspaceDialog({ onClose }: CreateWorkspaceDialogProps) {
  const [mode, setMode] = useState<Mode>('browse');
  const [pathValue, setPathValue] = useState('');
  const [name, setName] = useState('');
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const registerMutation = useRegisterWorkspace();

  const handleBrowseSelect = (dir: string, detected: DetectedSkillDir[]) => {
    setPathValue(dir);
    setMode(detected.length > 0 ? 'create' : 'register');

    toast.info(
      detected.length > 0
        ? 'Project folder selected. Review it and confirm to register this workspace.'
        : 'Project folder selected. Confirm it or create a new workspace file for this project.',
    );
  };

  const openSystemPicker = async () => {
    setPickingDirectory(true);

    try {
      const { selectedDir } = await pickNativeDirectory(pathValue.trim() || undefined);
      if (selectedDir) {
        setPathValue(selectedDir);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the system folder picker');
    } finally {
      setPickingDirectory(false);
    }
  };

  const handleRegister = () => {
    const rawPath = pathValue.trim();
    if (!rawPath) {
      toast.error('Choose a project folder first');
      return;
    }

    const payload = rawPath.endsWith('.json')
      ? {
          filePath: rawPath,
          create: mode === 'create',
          name: name.trim() || undefined,
        }
      : {
          directory: rawPath,
          create: mode === 'create',
          name: name.trim() || undefined,
        };

    registerMutation.mutate(payload, {
      onSuccess: ({ created }) => {
        toast.success(
          created
            ? 'Workspace file created for this project'
            : 'Project workspace added',
        );
        onClose();
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Could not prepare the workspace');
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Project Workspace</h2>
            <p className="mt-1 text-sm text-gray-500">
              Pick a project folder. Agent Hub will reuse the existing{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                ahub.workspace.json
              </code>{' '}
              when it exists, or create one so this project can keep its own sync profile.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setMode('browse')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === 'browse'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <FolderSearch className="h-4 w-4" />
            Explore folders
          </button>
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
            Use project
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
            Create profile
          </button>
        </div>

        <div className="mt-4">
          {mode === 'browse' ? (
            <DirectoryBrowser onSelect={handleBrowseSelect} onCancel={onClose} />
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Project folder</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={pathValue}
                    onChange={(e) => setPathValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    autoFocus
                    placeholder="/path/to/project"
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <button
                    type="button"
                    onClick={openSystemPicker}
                    disabled={pickingDirectory}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pickingDirectory ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Browse...
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {mode === 'register'
                    ? 'Choose the project folder that already has a workspace file. You can also paste the full path to ahub.workspace.json.'
                    : 'Choose the project folder to register. If a workspace file already exists there, Agent Hub will reuse it.'}
                </p>
              </div>

              {mode === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Project name <span className="text-gray-400">(optional)</span>
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

              {pathValue.trim() && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Selected folder
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-gray-700">{pathValue}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegister}
                  disabled={registerMutation.isPending || !pathValue.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === 'register' ? (
                    <FolderOpen className="h-4 w-4" />
                  ) : (
                    <FolderPlus className="h-4 w-4" />
                  )}
                  {mode === 'register' ? 'Register project' : 'Create workspace profile'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
