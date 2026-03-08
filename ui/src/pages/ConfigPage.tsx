import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfig, useSetConfig } from '../hooks/useConfig';
import { useHealth } from '../hooks/useHealth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clearCache } from '../api/client';
import { ProviderStatus } from '../components/config/ProviderStatus';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { GitHubProviderCard } from '../components/providers/GitHubProviderCard';
import { useProviders } from '../hooks/useProviders';

export function ConfigPage() {
  const { data: config, isLoading } = useConfig();
  const health = useHealth();
  const providers = useProviders();
  const setConfig = useSetConfig();
  const qc = useQueryClient();

  const clearCacheMutation = useMutation({
    mutationFn: clearCache,
    onSuccess: () => {
      toast.success('Cache cleared');
      qc.invalidateQueries({ queryKey: ['health'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to clear cache');
    },
  });

  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');

  if (isLoading) {
    return <LoadingSpinner className="py-24" size="lg" label="Loading config..." />;
  }

  const handleSetConfig = () => {
    if (!editKey.trim()) {
      toast.error('Enter a config key');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      parsed = editValue;
    }
    setConfig.mutate(
      { key: editKey.trim(), value: parsed },
      {
        onSuccess: () => {
          toast.success(`Config "${editKey}" updated`);
          setEditKey('');
          setEditValue('');
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to update config');
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Provider status */}
      {health.data && <ProviderStatus health={health.data} />}

      {providers.data && <GitHubProviderCard providers={providers.data} />}

      {/* Current config */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Current Configuration</h3>
        <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-4 text-sm text-gray-700 font-mono">
          {config ? JSON.stringify(config, null, 2) : 'Not configured'}
        </pre>
      </div>

      {/* Edit config */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Set Config Value</h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Key (dot-path)</label>
            <input
              type="text"
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="e.g. git.repoUrl"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Value (JSON or string)</label>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder='e.g. "https://github.com/..."'
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <button
            onClick={handleSetConfig}
            disabled={setConfig.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {setConfig.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Cache management */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Cache Management</h3>
        <p className="mt-1 text-sm text-gray-500">
          {health.data?.cacheCount ?? 0} skill{(health.data?.cacheCount ?? 0) !== 1 ? 's' : ''} cached locally.
        </p>
        <button
          onClick={() => clearCacheMutation.mutate()}
          disabled={clearCacheMutation.isPending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {clearCacheMutation.isPending ? 'Clearing...' : 'Clear Cache'}
        </button>
      </div>
    </div>
  );
}
