import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { SyncStatus } from '../../hooks/useSync';
import type { SyncProgressEvent, SyncResult } from '../../api/types';
import { cn } from '../../lib/utils';

interface SyncProgressProps {
  status: SyncStatus;
  progress: SyncProgressEvent | null;
  result: SyncResult | null;
  error: string | null;
}

export function SyncProgress({ status, progress, result, error }: SyncProgressProps) {
  if (status === 'idle') return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      {/* Progress bar */}
      {status === 'syncing' && progress && (
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-brand-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress.phase === 'fetch' ? 'Fetching' : 'Deploying'}{' '}
              <span className="font-medium">{progress.skill}</span>
              {progress.target && (
                <span className="text-gray-400">→ {progress.target}</span>
              )}
            </span>
            <span className="text-gray-400">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{
                width: `${Math.round((progress.current / progress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Complete */}
      {status === 'complete' && result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4.5 w-4.5" />
            Sync complete
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">
              {result.deployed.length} deployed
            </span>
            {result.skipped.length > 0 && (
              <span className="text-gray-500">{result.skipped.length} skipped</span>
            )}
            {result.failed.length > 0 && (
              <span className="text-red-600">{result.failed.length} failed</span>
            )}
          </div>
          {result.failed.length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {result.failed.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {f.skill} → {f.target}: {f.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className={cn('flex items-center gap-2 text-sm font-medium text-red-700')}>
          <AlertTriangle className="h-4.5 w-4.5" />
          {error ?? 'Sync failed'}
        </div>
      )}
    </div>
  );
}
