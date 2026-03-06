import { useState, useEffect, useCallback } from 'react';
import { Save, X } from 'lucide-react';
import type { Skill } from '../../api/types';

interface EditSkillFormProps {
  skill: Skill;
  onSave: (patch: {
    description?: string;
    body?: string;
    tags?: string[];
    category?: string;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function EditSkillForm({ skill, onSave, onCancel, isSaving }: EditSkillFormProps) {
  const [description, setDescription] = useState((skill.metadata.description as string) ?? '');
  const [body, setBody] = useState(skill.body);
  const [tagsInput, setTagsInput] = useState(
    Array.isArray(skill.metadata.tags) ? (skill.metadata.tags as string[]).join(', ') : '',
  );
  const [category, setCategory] = useState((skill.metadata.category as string) ?? '');

  useEffect(() => {
    setDescription((skill.metadata.description as string) ?? '');
    setBody(skill.body);
    setTagsInput(
      Array.isArray(skill.metadata.tags) ? (skill.metadata.tags as string[]).join(', ') : '',
    );
    setCategory((skill.metadata.category as string) ?? '');
  }, [skill]);

  const handleSave = useCallback(() => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      description: description || undefined,
      body,
      tags: tags.length > 0 ? tags : undefined,
      category: category || undefined,
    });
  }, [description, body, tagsInput, category, onSave]);

  // Ctrl+S keyboard shortcut
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

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line description"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Tags</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Comma-separated tags"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category name"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Body (Markdown)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={20}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-sm text-gray-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-gray-400">Ctrl+S to save</p>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
