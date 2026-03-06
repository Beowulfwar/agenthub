import { useState } from 'react';
import { BookOpen, Rocket } from 'lucide-react';
import { useSkillsDetailed } from '../hooks/useSkills';
import { SkillCard } from '../components/skills/SkillCard';
import { SearchBar } from '../components/skills/SearchBar';
import { DeployDialog } from '../components/deploy/DeployDialog';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { EmptyState } from '../components/shared/EmptyState';

export function SkillsPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showDeploy, setShowDeploy] = useState(false);
  const { data: skills, isLoading, error } = useSkillsDetailed(query || undefined);

  const toggleSelect = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Search + actions */}
      <div className="flex items-center gap-3">
        <SearchBar value={query} onChange={setQuery} className="flex-1" />
        {selected.length > 0 && (
          <button
            onClick={() => setShowDeploy(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Rocket className="h-4 w-4" />
            Deploy ({selected.length})
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && <LoadingSpinner className="py-16" size="lg" label="Loading skills..." />}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Failed to load skills'}
        </div>
      )}

      {/* Grid */}
      {skills && skills.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <div key={skill.name} className="relative">
              {/* Selection checkbox */}
              <input
                type="checkbox"
                checked={selected.includes(skill.name)}
                onChange={() => toggleSelect(skill.name)}
                className="absolute right-3 top-3 z-10 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <SkillCard skill={skill} />
            </div>
          ))}
        </div>
      ) : (
        !isLoading && (
          <EmptyState
            icon={<BookOpen className="h-12 w-12" />}
            title="No skills found"
            description={
              query
                ? `No skills matching "${query}". Try a different search.`
                : 'No skills in the repository yet.'
            }
          />
        )
      )}

      {/* Deploy dialog */}
      {showDeploy && (
        <DeployDialog
          skillNames={selected}
          onClose={() => {
            setShowDeploy(false);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}
