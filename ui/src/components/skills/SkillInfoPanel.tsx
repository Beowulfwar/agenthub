import { Hash, BarChart3, FileText, HardDrive } from 'lucide-react';
import { useContentInfo } from '../../hooks/useSkills';
import type { ContentRef } from '../../api/types';

interface SkillInfoPanelProps {
  ref: ContentRef;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SkillInfoPanel({ ref }: SkillInfoPanelProps) {
  const { data: info, isLoading } = useContentInfo(ref);

  if (isLoading || !info) return null;

  const stats = [
    { icon: Hash, label: 'Words', value: info.wordCount.toLocaleString() },
    { icon: BarChart3, label: 'Lines', value: info.lineCount.toLocaleString() },
    { icon: FileText, label: 'Files', value: info.fileCount.toString() },
    { icon: HardDrive, label: 'Size', value: formatBytes(info.totalBytes) },
  ];

  return (
    <div className="flex flex-wrap gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      {stats.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-gray-400" />
          <span className="text-gray-500">{label}:</span>
          <span className="font-medium text-gray-700">{value}</span>
        </div>
      ))}
    </div>
  );
}
