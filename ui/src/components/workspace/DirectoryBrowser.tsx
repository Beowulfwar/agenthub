import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowUp,
  Loader2,
  Search,
  Sparkles,
  Check,
  Home,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { browseDirectory, scanSkillDirs, fetchSuggestions } from '../../api/client';
import type { DirEntry, DetectedSkillDir, SuggestionDir } from '../../api/types';

// ---------------------------------------------------------------------------
// Tool badge colors
// ---------------------------------------------------------------------------

const TOOL_COLORS: Record<string, string> = {
  'claude-code': 'bg-orange-100 text-orange-700',
  codex: 'bg-blue-100 text-blue-700',
  cursor: 'bg-purple-100 text-purple-700',
  windsurf: 'bg-cyan-100 text-cyan-700',
  aider: 'bg-green-100 text-green-700',
  cline: 'bg-pink-100 text-pink-700',
  continue: 'bg-yellow-100 text-yellow-800',
  generic: 'bg-gray-100 text-gray-700',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DirectoryBrowserProps {
  /** Called when user selects a directory. */
  onSelect: (dir: string, detected: DetectedSkillDir[]) => void;
  /** Called when user cancels browsing. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DirectoryBrowser({ onSelect, onCancel }: DirectoryBrowserProps) {
  const [currentDir, setCurrentDir] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [detected, setDetected] = useState<DetectedSkillDir[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionDir[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [phase, setPhase] = useState<'suggestions' | 'browsing'>('suggestions');
  const [error, setError] = useState('');

  // Load suggestions on mount
  useEffect(() => {
    fetchSuggestions()
      .then((data) => {
        setSuggestions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load suggestions');
        setLoading(false);
      });
  }, []);

  const navigateTo = useCallback(async (dir: string) => {
    setLoading(true);
    setDetected([]);
    setError('');
    setPhase('browsing');

    try {
      const result = await browseDirectory(dir);
      setCurrentDir(result.currentDir);
      setEntries(result.entries);

      // Auto-scan for skill dirs
      setScanning(true);
      const scanResult = await scanSkillDirs(result.currentDir);
      setDetected(scanResult.detected);
      setScanning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Cannot access: ${dir}`);
      setCurrentDir(dir);
      setEntries([]);
    }
    setLoading(false);
  }, []);

  const goUp = () => {
    const parts = currentDir.split('/').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      navigateTo('/' + parts.join('/'));
    }
  };

  const handleManualNav = () => {
    const trimmed = manualPath.trim();
    if (trimmed) {
      navigateTo(trimmed);
      setManualPath('');
    }
  };

  // -----------------------------------------------------------------------
  // Phase 1: Suggestions (starting points)
  // -----------------------------------------------------------------------

  if (phase === 'suggestions') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-500">
          Select a directory to browse, or type a path below.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            <span className="text-sm text-gray-400">Scanning directories...</span>
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            No directories found. Type a path manually below.
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200">
            {suggestions.map((s) => (
              <button
                key={s.path}
                onClick={() => navigateTo(s.path)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-brand-50 transition-colors"
              >
                <Folder className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{s.label}</span>
                    {s.skillCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                        <Sparkles className="h-3 w-3" />
                        {s.skillCount} skill{s.skillCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <span className="block truncate font-mono text-xs text-gray-400">
                    {s.path}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        )}

        {/* Manual path entry */}
        <div className="flex gap-2 border-t pt-3">
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualNav()}
            placeholder="/path/to/directory"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            onClick={handleManualNav}
            disabled={!manualPath.trim()}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Go
          </button>
        </div>

        <button
          onClick={onCancel}
          className="self-start text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Phase 2: Browsing (directory listing + detected skills)
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* Current path + navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setPhase('suggestions'); setError(''); }}
          title="Back to suggestions"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          onClick={goUp}
          title="Go to parent directory"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <div className="flex-1 truncate rounded-lg bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-600">
          {currentDir}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Detected skill directories */}
      {detected.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <Sparkles className="h-4 w-4" />
            {detected.length} skill director{detected.length > 1 ? 'ies' : 'y'} detected
          </div>
          <div className="mt-2 space-y-1.5">
            {detected.map((d) => (
              <div
                key={d.absolutePath}
                className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                      TOOL_COLORS[d.tool] ?? TOOL_COLORS.generic,
                    )}
                  >
                    {d.tool}
                  </span>
                  <span className="font-medium text-gray-800">{d.label}</span>
                  <span className="text-gray-400">({d.skillCount})</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => onSelect(currentDir, detected)}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Check className="h-4 w-4" />
            Use this directory
          </button>
        </div>
      )}

      {scanning && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Scanning for skill directories...
        </div>
      )}

      {/* Directory listing */}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="text-sm text-gray-400">Loading...</span>
          </div>
        ) : entries.length === 0 && !error ? (
          <p className="py-6 text-center text-sm text-gray-400">Empty directory</p>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.fullPath}
              onClick={() => navigateTo(entry.fullPath)}
              className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50 transition-colors"
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

      {/* Manual path input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleManualNav()}
          placeholder="Type a path..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 font-mono text-sm text-gray-900 outline-none focus:border-brand-500"
        />
        <button
          onClick={handleManualNav}
          disabled={!manualPath.trim()}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          Go
        </button>
      </div>

      {/* Bottom actions */}
      <div className="flex justify-between border-t pt-3">
        <button
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        {detected.length === 0 && !loading && (
          <button
            onClick={() => onSelect(currentDir, [])}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FolderOpen className="h-4 w-4" />
            Select this directory
          </button>
        )}
      </div>
    </div>
  );
}
