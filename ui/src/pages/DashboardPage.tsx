import { Link } from 'react-router-dom';
import {
  BookOpen,
  FolderSync,
  Rocket,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useHealth } from '../hooks/useHealth';
import { useSkillsList } from '../hooks/useSkills';
import { useWorkspace } from '../hooks/useWorkspace';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ProviderStatus } from '../components/config/ProviderStatus';

export function DashboardPage() {
  const health = useHealth();
  const skills = useSkillsList();
  const workspace = useWorkspace();

  if (health.isLoading) {
    return <LoadingSpinner className="py-24" size="lg" label="Loading dashboard..." />;
  }

  const skillCount = skills.data?.length ?? 0;
  const resolvedCount = workspace.data?.resolved?.length ?? 0;
  const manifestName = workspace.data?.manifest?.name;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<BookOpen className="h-5 w-5 text-brand-500" />}
          label="Total Skills"
          value={skillCount}
          href="/skills"
        />
        <StatCard
          icon={<FolderSync className="h-5 w-5 text-indigo-500" />}
          label="Workspace Skills"
          value={resolvedCount}
          href="/workspace"
        />
        <StatCard
          icon={<Rocket className="h-5 w-5 text-green-500" />}
          label="Cached"
          value={health.data?.cacheCount ?? 0}
        />
        <StatCard
          icon={<Activity className="h-5 w-5 text-amber-500" />}
          label="Provider"
          value={health.data?.provider ?? 'none'}
          href="/config"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Provider status */}
        {health.data && <ProviderStatus health={health.data} />}

        {/* Workspace quick info */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">Workspace</h3>
          {manifestName ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium">{manifestName}</span> &mdash;{' '}
                {resolvedCount} skill{resolvedCount !== 1 ? 's' : ''} configured
              </p>
              <Link
                to="/workspace"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Open workspace <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              No workspace manifest found. Create one to sync skills across
              environments.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-200">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
}
