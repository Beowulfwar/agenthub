import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, FolderSync, Settings, Boxes } from 'lucide-react';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/skills', label: 'Skills', icon: BookOpen },
  { to: '/workspace', label: 'Workspace', icon: FolderSync },
  { to: '/config', label: 'Config', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-5">
        <Boxes className="h-6 w-6 text-brand-600" />
        <span className="text-lg font-semibold text-gray-900">Agent Hub</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )
            }
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-5 py-3">
        <p className="text-xs text-gray-400">agent-hub v0.1.0</p>
      </div>
    </aside>
  );
}
