import { useState, useRef, useEffect } from 'react';
import { FolderSync, ChevronDown, Plus, Circle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspaceRegistry, useSetActiveWorkspace, useUnregisterWorkspace } from '../../hooks/useWorkspace';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { cn } from '../../lib/utils';

export function WorkspaceSelector() {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: entries, isLoading } = useWorkspaceRegistry();
  const setActive = useSetActiveWorkspace();
  const unregister = useUnregisterWorkspace();

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeEntry = entries?.find((e) => e.isActive);

  const displayName = activeEntry?.manifest?.name
    ?? (activeEntry?.workspaceDir
      ? basename(activeEntry.workspaceDir)
      : 'Nenhum workspace');

  const handleSwitch = (filePath: string) => {
    setActive.mutate(filePath, {
      onSuccess: () => toast.success('Workspace ativo atualizado'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Nao foi possivel trocar o workspace'),
    });
    setOpen(false);
  };

  const handleUnregister = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    unregister.mutate(filePath, {
      onSuccess: () => toast.success('Workspace removido da lista'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Nao foi possivel remover o workspace'),
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          open
            ? 'border-brand-300 bg-brand-50 text-brand-700'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
        )}
      >
        <FolderSync className="h-4 w-4 text-gray-400" />
        <span className="max-w-[160px] truncate">{isLoading ? '...' : displayName}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {entries && entries.length > 0 ? (
            <div className="max-h-64 overflow-auto">
              {entries.map((entry) => {
                const name = entry.manifest?.name ?? basename(entry.workspaceDir);
                return (
                  <div
                    key={entry.filePath}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSwitch(entry.filePath)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSwitch(entry.filePath)}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                      entry.isActive ? 'bg-brand-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <Circle
                      className={cn(
                        'h-2 w-2 flex-shrink-0',
                        entry.isActive ? 'fill-brand-500 text-brand-500' : 'fill-gray-300 text-gray-300',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('truncate font-medium', entry.isActive ? 'text-brand-700' : 'text-gray-900')}>
                          {name}
                        </span>
                        {entry.error && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                            erro
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-xs text-gray-400">{entry.workspaceDir}</p>
                      {!entry.error && (
                        <p className="text-xs text-gray-500">{entry.skillCount} skill{entry.skillCount !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleUnregister(e, entry.filePath)}
                      className="rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      title="Remover workspace"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-3 text-center text-sm text-gray-500">
              Nenhum workspace cadastrado
            </div>
          )}

          <div className="border-t border-gray-100 px-1 py-1">
            <button
              onClick={() => {
                setShowCreate(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              <Plus className="h-4 w-4" />
              Novo workspace...
            </button>
          </div>
        </div>
      )}

      {showCreate && <CreateWorkspaceDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// Minimal path helpers (browser-safe, no node:path)
function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? p;
}
