import { cn } from '../../lib/utils';

interface HoverHintProps {
  text: string;
  tone?: 'info' | 'warning';
  className?: string;
}

export function HoverHint({
  text,
  tone = 'info',
  className,
}: HoverHintProps) {
  const badgeLabel = tone === 'warning' ? '!' : '?';

  return (
    <span className={cn('group relative inline-flex align-middle', className)}>
      <span
        tabIndex={0}
        className={cn(
          'inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[10px] font-bold ring-1 ring-inset transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400/40',
          tone === 'warning'
            ? 'bg-amber-50 text-amber-700 ring-amber-200'
            : 'bg-gray-100 text-gray-600 ring-gray-200',
        )}
        aria-label={text}
      >
        {badgeLabel}
      </span>
      <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 w-64 -translate-y-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  );
}
