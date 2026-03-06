import { useState, useEffect, useCallback } from 'react';
import { Save, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useSaveWorkspace } from '../../hooks/useWorkspace';
import { TargetSelector } from '../deploy/TargetSelector';
import type { WorkspaceManifest, WorkspaceSkillEntry, DeployTarget } from '../../api/types';

interface WorkspaceFormProps {
  manifest: WorkspaceManifest;
  filePath: string;
}

export function WorkspaceForm({ manifest, filePath }: WorkspaceFormProps) {
  const [name, setName] = useState(manifest.name ?? '');
  const [description, setDescription] = useState(manifest.description ?? '');
  const [defaultTargets, setDefaultTargets] = useState<DeployTarget[]>(manifest.defaultTargets ?? ['claude-code']);
  const [skills, setSkills] = useState<WorkspaceSkillEntry[]>(manifest.skills ?? []);
  const [newSkillName, setNewSkillName] = useState('');
  const saveMutation = useSaveWorkspace();

  // Sync form when manifest prop changes (e.g. workspace switch)
  useEffect(() => {
    setName(manifest.name ?? '');
    setDescription(manifest.description ?? '');
    setDefaultTargets(manifest.defaultTargets ?? ['claude-code']);
    setSkills(manifest.skills ?? []);
  }, [manifest]);

  const handleSave = useCallback(() => {
    const updated: WorkspaceManifest = {
      version: 1,
      ...(name.trim() && { name: name.trim() }),
      ...(description.trim() && { description: description.trim() }),
      defaultTargets,
      skills: skills.length > 0 ? skills : undefined,
      // Preserve groups from original manifest (form doesn't edit groups yet)
      ...(manifest.groups && { groups: manifest.groups }),
      ...(manifest.profile && { profile: manifest.profile }),
    };

    saveMutation.mutate(
      { filePath, manifest: updated },
      {
        onSuccess: () => toast.success('Workspace saved'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
      },
    );
  }, [name, description, defaultTargets, skills, manifest.groups, manifest.profile, filePath, saveMutation]);

  // Ctrl+S shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const addSkill = () => {
    const trimmed = newSkillName.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.name === trimmed)) {
      toast.error(`Skill "${trimmed}" already in list`);
      return;
    }
    setSkills([...skills, { name: trimmed }]);
    setNewSkillName('');
  };

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  const updateSkillTargets = (index: number, targets: DeployTarget[]) => {
    const updated = [...skills];
    if (targets.length > 0) {
      updated[index] = { ...updated[index]!, targets };
    } else {
      // Remove per-skill override, falls back to defaultTargets
      const { targets: _, ...rest } = updated[index]!;
      updated[index] = rest;
    }
    setSkills(updated);
  };

  return (
    <div className="space-y-5">
      {/* Meta fields */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700">General</h3>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Skills for my project"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        <div className="mt-4">
          <TargetSelector selected={defaultTargets} onChange={setDefaultTargets} />
        </div>
      </div>

      {/* Skills list */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Skills ({skills.length})
          </h3>
          <span className="text-xs text-gray-400">Ctrl+S to save</span>
        </div>

        {skills.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100">
            {skills.map((skill, i) => (
              <div key={skill.name} className="flex items-center gap-3 py-3 first:pt-0">
                <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-gray-900">
                  {skill.name}
                </span>
                <div className="flex flex-shrink-0 gap-1">
                  {(['claude-code', 'codex', 'cursor'] as DeployTarget[]).map((t) => {
                    const active = skill.targets?.includes(t) ?? false;
                    const isDefault = !skill.targets && defaultTargets.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          const current = skill.targets ?? [...defaultTargets];
                          const next = current.includes(t)
                            ? current.filter((x) => x !== t)
                            : [...current, t];
                          updateSkillTargets(i, next);
                        }}
                        className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          active || isDefault
                            ? t === 'claude-code'
                              ? 'border border-orange-300 bg-orange-50 text-orange-700'
                              : t === 'codex'
                                ? 'border border-purple-300 bg-purple-50 text-purple-700'
                                : 'border border-cyan-300 bg-cyan-50 text-cyan-700'
                            : 'border border-gray-200 bg-white text-gray-400'
                        }`}
                        title={isDefault ? `Inherited from defaults` : `Toggle ${t}`}
                      >
                        {t === 'claude-code' ? 'CC' : t === 'codex' ? 'CX' : 'CR'}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => removeSkill(i)}
                  className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                  title="Remove skill"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add skill row */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSkill()}
            placeholder="skill-name"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            onClick={addSkill}
            disabled={!newSkillName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {/* Groups (read-only notice) */}
      {manifest.groups && manifest.groups.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-700">
            Groups ({manifest.groups.length})
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            Groups are preserved on save. Use the Raw JSON editor to modify groups.
          </p>
          <div className="mt-3 divide-y divide-gray-100">
            {manifest.groups.map((group, i) => (
              <div key={i} className="py-2 text-sm">
                <div className="flex gap-1">
                  {group.targets.map((t) => (
                    <span key={t} className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-1 font-mono text-xs text-gray-500">
                  {group.skills.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save Workspace'}
        </button>
      </div>
    </div>
  );
}
