import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowUp,
  Loader2,
  Sparkles,
  Home,
  Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { browseDirectory, scanSkillDirs, fetchSuggestions } from '../../api/client';
import type {
  ArtifactVisibilityStatus,
  DirEntry,
  DetectedSkillDir,
  SuggestionDir,
  WorkspaceAppInventory,
} from '../../api/types';

const TOOL_COLORS: Record<string, string> = {
  'claude-code': 'bg-orange-100 text-orange-700',
  codex: 'bg-blue-100 text-blue-700',
  cursor: 'bg-purple-100 text-purple-700',
  windsurf: 'bg-cyan-100 text-cyan-700',
  cline: 'bg-pink-100 text-pink-700',
  continue: 'bg-yellow-100 text-yellow-800',
  'gemini-cli': 'bg-lime-100 text-lime-700',
  amp: 'bg-rose-100 text-rose-700',
  'github-copilot': 'bg-slate-100 text-slate-700',
  antigravity: 'bg-indigo-100 text-indigo-700',
  generic: 'bg-gray-100 text-gray-700',
};

interface DirectoryBrowserProps {
  onSelect: (dir: string, detected: DetectedSkillDir[]) => void;
  initialDir?: string;
  selectedDir?: string;
}

function visibilityLabel(status: ArtifactVisibilityStatus): string {
  switch (status) {
    case 'visible_in_app':
      return 'Visivel no app';
    case 'found_in_wrong_repository':
      return 'Fora do diretorio oficial';
    case 'found_in_legacy_repository':
      return 'Repositorio legado';
    case 'found_in_workspace_but_not_loaded_by_app':
      return 'Nao carregado pelo app';
    case 'found_but_unverifiable_for_app':
      return 'Layout nao verificavel';
    case 'missing_from_expected_repository':
      return 'Ausente no repositorio esperado';
  }
}

function visibilityBadge(status: ArtifactVisibilityStatus): string {
  switch (status) {
    case 'visible_in_app':
      return 'bg-emerald-100 text-emerald-700';
    case 'found_in_wrong_repository':
      return 'bg-amber-100 text-amber-700';
    case 'found_in_legacy_repository':
      return 'bg-slate-100 text-slate-700';
    case 'found_in_workspace_but_not_loaded_by_app':
      return 'bg-orange-100 text-orange-700';
    case 'found_but_unverifiable_for_app':
      return 'bg-indigo-100 text-indigo-700';
    case 'missing_from_expected_repository':
      return 'bg-red-100 text-red-700';
  }
}

export function DirectoryBrowser({
  onSelect,
  initialDir,
  selectedDir,
}: DirectoryBrowserProps) {
  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [detected, setDetected] = useState<DetectedSkillDir[]>([]);
  const [apps, setApps] = useState<WorkspaceAppInventory[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionDir[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<'suggestions' | 'browsing'>(initialDir ? 'browsing' : 'suggestions');
  const [error, setError] = useState('');
  const initialNavigationDone = useRef(false);

  useEffect(() => {
    fetchSuggestions()
      .then((data) => {
        setSuggestions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? 'Nao foi possivel carregar os locais sugeridos');
        setLoading(false);
      });
  }, []);

  const navigateTo = useCallback(async (dir: string) => {
    setLoading(true);
    setDetected([]);
    setApps([]);
    setError('');
    setPhase('browsing');

    try {
      const result = await browseDirectory(dir);
      setCurrentDir(result.currentDir);
      setEntries(result.entries);

      setScanning(true);
      const scanResult = await scanSkillDirs(result.currentDir);
      setDetected(scanResult.detected);
      setApps(scanResult.apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Nao foi possivel abrir ${dir}`);
      setCurrentDir(dir);
      setEntries([]);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialDir || initialNavigationDone.current) {
      return;
    }

    initialNavigationDone.current = true;
    void navigateTo(initialDir);
  }, [initialDir, navigateTo]);

  const goUp = () => {
    const parts = currentDir.split('/').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      void navigateTo('/' + parts.join('/'));
    }
  };

  if (phase === 'suggestions') {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm font-medium text-gray-700">Locais sugeridos</p>
          <p className="mt-1 text-xs text-gray-500">
            Comece por uma pasta comum da maquina e navegue ate o projeto desejado.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            <span className="text-sm text-gray-400">Carregando locais...</span>
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            Nenhuma sugestao inicial foi encontrada.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.path}
                onClick={() => void navigateTo(suggestion.path)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-brand-50"
              >
                <Folder className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{suggestion.label}</span>
                    {suggestion.skillCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                        <Sparkles className="h-3 w-3" />
                        {suggestion.skillCount} skill{suggestion.skillCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <span className="block truncate font-mono text-xs text-gray-400">
                    {suggestion.path}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isCurrentSelection = Boolean(selectedDir && selectedDir === currentDir);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setPhase('suggestions');
            setError('');
          }}
          title="Voltar para os locais sugeridos"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          onClick={goUp}
          title="Subir um nivel"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <div className="flex-1 truncate rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
          {currentDir}
        </div>
        {isCurrentSelection && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
            <Check className="h-3 w-3" />
            selecionada
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {detected.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <Sparkles className="h-4 w-4" />
            Skills encontradas nesta pasta
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {detected.map((item) => (
              <span
                key={item.absolutePath}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-green-200"
              >
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    TOOL_COLORS[item.tool] ?? TOOL_COLORS.generic,
                  )}
                >
                  {item.tool}
                </span>
                {item.label} ({item.skillCount})
              </span>
            ))}
          </div>
        </div>
      )}

      {apps.some((app) => app.counts.found_in_wrong_repository > 0 || app.counts.found_in_legacy_repository > 0 || app.counts.found_but_unverifiable_for_app > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Sparkles className="h-4 w-4" />
            Diagnostico de repositorios
          </div>
          <div className="mt-3 space-y-3">
            {apps
              .filter((app) => app.artifacts.some((artifact) => artifact.visibilityStatus !== 'visible_in_app'))
              .map((app) => (
                <div key={app.appId} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', TOOL_COLORS[app.appId] ?? TOOL_COLORS.generic)}>
                      {app.appId}
                    </span>
                    <span className="text-xs font-semibold text-gray-800">{app.label}</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {app.artifacts
                      .filter((artifact) => artifact.visibilityStatus !== 'visible_in_app')
                      .slice(0, 3)
                      .map((artifact) => (
                        <div key={artifact.id} className="text-xs text-gray-600">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('rounded-full px-2 py-0.5 font-semibold', visibilityBadge(artifact.visibilityStatus))}>
                              {visibilityLabel(artifact.visibilityStatus)}
                            </span>
                            <span className="font-mono text-[11px] text-gray-700">{artifact.name}</span>
                          </div>
                          <p className="mt-1 break-all font-mono text-[11px] text-gray-500">{artifact.detectedPath}</p>
                          <p className="mt-1 break-all font-mono text-[11px] text-gray-400">Esperado: {artifact.expectedPath}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {scanning && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Verificando skills nesta pasta...
        </div>
      )}

      <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="text-sm text-gray-400">Carregando pastas...</span>
          </div>
        ) : entries.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">Nenhuma subpasta disponivel aqui.</p>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.fullPath}
              onClick={() => void navigateTo(entry.fullPath)}
              className="flex w-full items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-gray-50"
            >
              {entry.skillMatch ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-green-500" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-gray-400" />
              )}
              <span
                className={cn(
                  'truncate',
                  entry.skillMatch ? 'font-medium text-green-700' : 'text-gray-700',
                )}
              >
                {entry.name}
              </span>
              {entry.skillMatch && (
                <span
                  className={cn(
                    'ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    TOOL_COLORS[entry.skillMatch.tool] ?? TOOL_COLORS.generic,
                  )}
                >
                  {entry.skillMatch.tool} ({entry.skillMatch.count})
                </span>
              )}
              <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" />
            </button>
          ))
        )}
      </div>

      <div className="flex justify-end border-t pt-3">
        <button
          onClick={() => onSelect(currentDir, detected)}
          disabled={!currentDir || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Selecionar esta pasta
        </button>
      </div>
    </div>
  );
}
