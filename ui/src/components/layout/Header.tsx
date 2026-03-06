import { useLocation } from 'react-router-dom';
import { useHealth } from '../../hooks/useHealth';
import { WorkspaceSelector } from '../workspace/WorkspaceSelector';
import { cn } from '../../lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/skills': 'Skills',
  '/workspace': 'Workspace',
  '/config': 'Configuration',
};

export function Header() {
  const location = useLocation();
  const { data: health } = useHealth();

  // Match page title — also handles /skills/:name
  const title =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.startsWith('/skills/') ? 'Skill Detail' : 'Agent Hub');

  const isConnected = health?.configured && health.providerHealth?.ok;

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Workspace selector */}
        <WorkspaceSelector />

        {/* Provider status badge */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              isConnected === true
                ? 'bg-green-500'
                : isConnected === false
                  ? 'bg-red-500'
                  : 'bg-gray-300',
            )}
          />
          <span className="text-sm text-gray-500">
            {health?.configured
              ? `${health.provider ?? 'unknown'}`
              : 'Not configured'}
          </span>
        </div>
      </div>
    </header>
  );
}
