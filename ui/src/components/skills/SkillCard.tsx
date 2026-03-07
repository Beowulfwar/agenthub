import { Link } from 'react-router-dom';
import { FileText, FolderKanban, Tag, Monitor, ClipboardCopy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import type { SkillSummary } from '../../api/types';

interface SkillCardProps {
  skill: SkillSummary;
  /** Workspace name this skill belongs to, if any. */
  workspaceName?: string;
}

const TARGET_COLORS: Record<string, string> = {
  'claude-code': 'bg-orange-100 text-orange-700',
  codex: 'bg-purple-100 text-purple-700',
  cursor: 'bg-cyan-100 text-cyan-700',
};

export function SkillCard({ skill, workspaceName }: SkillCardProps) {
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(skill.name).then(() => {
      toast.success(`Copied "${skill.name}"`);
    });
  };

  return (
    <Link
      to={`/skills/${encodeURIComponent(skill.name)}`}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-md"
    >
      {/* Name */}
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4.5 w-4.5 flex-shrink-0 text-brand-500" />
        <h3 className="flex-1 text-sm font-semibold text-gray-900 group-hover:text-brand-700">
          {skill.name}
        </h3>
        <button
          onClick={handleCopy}
          title="Copy name"
          className="opacity-0 transition-opacity group-hover:opacity-100 text-gray-400 hover:text-gray-600"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Description */}
      {skill.description && (
        <p className="mt-2 line-clamp-2 text-xs text-gray-500">{skill.description}</p>
      )}

      {/* Footer: workspace + tags + targets */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {workspaceName && (
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            <FolderKanban className="h-3 w-3" />
            {workspaceName}
          </span>
        )}
        {skill.category && (
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            <Tag className="h-3 w-3" />
            {skill.category}
          </span>
        )}
        {skill.targets?.map((t) => (
          <span
            key={t}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
              TARGET_COLORS[t] ?? 'bg-gray-100 text-gray-600',
            )}
          >
            <Monitor className="h-3 w-3" />
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
