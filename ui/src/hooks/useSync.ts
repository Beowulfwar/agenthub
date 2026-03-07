import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncStream } from '../api/client';
import type { SyncProgressEvent, SyncResult } from '../api/types';

export type SyncStatus = 'idle' | 'syncing' | 'complete' | 'error';

export function useSync() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [progress, setProgress] = useState<SyncProgressEvent | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startSync = useCallback(
    (params?: { force?: boolean; dryRun?: boolean; filter?: string[]; filePath?: string }) => {
      // Close any existing connection.
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setStatus('syncing');
      setProgress(null);
      setResult(null);
      setError(null);

      const es = syncStream(params);
      eventSourceRef.current = es;

      es.addEventListener('progress', (e) => {
        const event = JSON.parse((e as MessageEvent).data) as SyncProgressEvent;
        setProgress(event);
      });

      es.addEventListener('complete', (e) => {
        const data = JSON.parse((e as MessageEvent).data) as SyncResult;
        setResult(data);
        setStatus('complete');
        es.close();
        eventSourceRef.current = null;
        // Invalidate related queries.
        qc.invalidateQueries({ queryKey: ['skills'] });
        qc.invalidateQueries({ queryKey: ['skills', 'catalog'] });
        qc.invalidateQueries({ queryKey: ['workspace'] });
        qc.invalidateQueries({ queryKey: ['workspace-registry'] });
      });

      es.addEventListener('error', (e) => {
        // EventSource error vs server-sent error event.
        if (e instanceof MessageEvent) {
          const data = JSON.parse(e.data) as { code: string; message: string };
          setError(data.message);
        } else {
          setError('Connection lost');
        }
        setStatus('error');
        es.close();
        eventSourceRef.current = null;
      });
    },
    [qc],
  );

  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus('idle');
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { status, progress, result, error, startSync, reset };
}
