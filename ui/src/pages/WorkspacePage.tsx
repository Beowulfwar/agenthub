import { useState } from 'react';
import { RefreshCw, Zap, Code, LayoutList, FolderPlus, FolderSearch, FolderOpen } from 'lucide-react';
import { useWorkspace } from '../hooks/useWorkspace';
import { useSync } from '../hooks/useSync';
import { ManifestEditor } from '../components/workspace/ManifestEditor';
import { WorkspaceForm } from '../components/workspace/WorkspaceForm';
import { SyncProgress } from '../components/workspace/SyncProgress';
import { CreateWorkspaceDialog } from '../components/workspace/CreateWorkspaceDialog';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { cn } from '../lib/utils';
import type { ResolvedSkill } from '../api/types';

export function WorkspacePage() {
  const { data, isLoading } = useWorkspace();
  const { status, progress, result, error, startSync, reset } = useSync();
  const [editorMode, setEditorMode] = useState<'form' | 'raw'>('form');
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) {
    return <LoadingSpinner className="py-24" size="lg" label="Loading workspace..." />;
  }
  if (!data?.manifest) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16">
          <FolderPlus className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-700">No project workspace selected</h3>
          <p className="mt-1 text-sm text-gray-500">
            Register a project folder first. Agent Hub will keep a small workspace file there so
            each project can sync its own skills into Codex, Claude Code or Cursor.
          </p>
          {data?.error && (
            <p className="mt-2 max-w-md text-center text-xs text-red-500">{data.error}</p>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <FolderSearch className="h-4 w-4" />
            Add Project Workspace
          </button>
          {showCreate && <CreateWorkspaceDialog onClose={() => setShowCreate(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Project Workspace</h2>
            <p className="mt-1 text-sm text-gray-500">
              You can register multiple project folders and switch the active one from the
              workspace selector. This page edits the sync profile stored in{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                ahub.workspace.json
              </code>{' '}
              for the active project.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <FolderOpen className="h-4 w-4" />
            Change Project
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Project folder</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-700">{data.workspaceDir}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Workspace file</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-700">{data.filePath}</p>
          </div>
        </div>
      </div>

      {showCreate && <CreateWorkspaceDialog onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Workspace Sync</h2>
          {data.filePath && (
            <p className="mt-0.5 truncate text-xs text-gray-400">
              Sync downloads the selected project's skills from cloud storage and deploys them into
              the recognized agent folders below.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {status !== 'idle' && (
            <button
              onClick={reset}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => startSync()}
            disabled={status === 'syncing'}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Sync
          </button>
          <button
            onClick={() => startSync({ force: true })}
            disabled={status === 'syncing'}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            Force Sync
          </button>
        </div>
      </div>

      {/* Progress */}
      <SyncProgress status={status} progress={progress} result={result} error={error} />

      {/* Editor mode toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 self-start w-fit">
        <button
          onClick={() => setEditorMode('form')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            editorMode === 'form'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutList className="h-3.5 w-3.5" />
          Form
        </button>
        <button
          onClick={() => setEditorMode('raw')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            editorMode === 'raw'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <Code className="h-3.5 w-3.5" />
          Raw JSON
        </button>
      </div>

      {/* Editor */}
      {editorMode === 'form' ? (
        <WorkspaceForm
          manifest={data.manifest}
          filePath={data.filePath!}
          workspaceDir={data.workspaceDir ?? ''}
          targetDirectories={data.targetDirectories ?? []}
        />
      ) : (
        <ManifestEditor manifest={data.manifest} filePath={data.filePath} />
      )}

      {/* Resolved skills table */}
      {data.resolved && data.resolved.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-700">
              Skills queued for sync ({data.resolved.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {data.resolved.map((rs: ResolvedSkill) => (
              <div key={rs.name} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-medium text-gray-900">{rs.name}</span>
                <div className="flex gap-1.5">
                  {rs.targets.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
