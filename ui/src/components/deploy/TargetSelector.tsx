import { cn } from '../../lib/utils';
import type { DeployTarget } from '../../api/types';

interface TargetSelectorProps {
  selected: DeployTarget[];
  onChange: (targets: DeployTarget[]) => void;
  label?: string;
  description?: string;
}

const TARGETS: { value: DeployTarget; label: string; color: string }[] = [
  { value: 'claude-code', label: 'Claude Code', color: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'codex', label: 'Codex', color: 'border-purple-300 bg-purple-50 text-purple-700' },
  { value: 'cursor', label: 'Cursor', color: 'border-cyan-300 bg-cyan-50 text-cyan-700' },
];

export function TargetSelector({
  selected,
  onChange,
  label = 'Agent destinations',
  description,
}: TargetSelectorProps) {
  const toggle = (target: DeployTarget) => {
    if (selected.includes(target)) {
      onChange(selected.filter((t) => t !== target));
    } else {
      onChange([...selected, target]);
    }
  };

  return (
    <div>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      <div className="mt-2 flex gap-2">
        {TARGETS.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => toggle(value)}
            className={cn(
              'rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all',
              selected.includes(value) ? color : 'border-gray-200 bg-white text-gray-400',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
