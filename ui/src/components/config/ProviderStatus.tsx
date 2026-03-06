import { CheckCircle2, XCircle, AlertTriangle, Wifi } from 'lucide-react';
import type { HealthData } from '../../api/types';
import { cn } from '../../lib/utils';

interface ProviderStatusProps {
  health: HealthData;
}

export function ProviderStatus({ health }: ProviderStatusProps) {
  const { configured, provider, providerHealth, cacheCount } = health;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Wifi className="h-4 w-4 text-brand-500" />
        Provider Status
      </h3>

      <div className="mt-4 space-y-3">
        {/* Configured */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Configured</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 font-medium',
              configured ? 'text-green-600' : 'text-gray-400',
            )}
          >
            {configured ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Yes
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5" /> No
              </>
            )}
          </span>
        </div>

        {/* Provider */}
        {provider && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Provider</span>
            <span className="font-medium text-gray-900">{provider}</span>
          </div>
        )}

        {/* Health */}
        {providerHealth && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Connection</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                providerHealth.ok ? 'text-green-600' : 'text-red-600',
              )}
            >
              {providerHealth.ok ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" /> {providerHealth.message ?? 'Unhealthy'}
                </>
              )}
            </span>
          </div>
        )}

        {/* Cache */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Cached skills</span>
          <span className="font-medium text-gray-900">{cacheCount}</span>
        </div>
      </div>
    </div>
  );
}
