import { useState, useEffect } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useSaveWorkspace } from '../../hooks/useWorkspace';
import type { WorkspaceManifest } from '../../api/types';

interface ManifestEditorProps {
  manifest: WorkspaceManifest | null;
  filePath: string | null;
}

export function ManifestEditor({ manifest, filePath }: ManifestEditorProps) {
  const [raw, setRaw] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const saveMutation = useSaveWorkspace();

  useEffect(() => {
    setRaw(manifest ? JSON.stringify(manifest, null, 2) : '');
    setParseError(null);
  }, [manifest]);

  const handleSave = () => {
    if (!filePath) {
      toast.error('No workspace file path');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as WorkspaceManifest;
      setParseError(null);
      saveMutation.mutate(
        { filePath, manifest: parsed },
        {
          onSuccess: () => toast.success('Workspace file saved'),
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : 'Save failed'),
        },
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  if (!manifest) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        No workspace file found. Create an <code className="font-mono text-brand-600">ahub.workspace.json</code>{' '}
        in your project root or run <code className="font-mono text-brand-600">ahub workspace init</code>.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700">Workspace File</h3>
          {filePath && (
            <p className="text-xs text-gray-400 font-mono">{filePath}</p>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {parseError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {parseError}
        </div>
      )}

      <textarea
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setParseError(null);
        }}
        rows={20}
        className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-sm text-gray-800 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        spellCheck={false}
      />
    </div>
  );
}
