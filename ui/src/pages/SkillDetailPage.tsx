import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Rocket,
  Trash2,
  FileText,
  Folder,
  Pencil,
  ClipboardCopy,
  Copy,
  PenLine,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useSkill, useDeleteSkill, usePatchSkill } from '../hooks/useSkills';
import { DeployDialog } from '../components/deploy/DeployDialog';
import { EditSkillForm } from '../components/skills/EditSkillForm';
import { CloneDialog } from '../components/skills/CloneDialog';
import { RenameDialog } from '../components/skills/RenameDialog';
import { SkillInfoPanel } from '../components/skills/SkillInfoPanel';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';

export function SkillDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: pkg, isLoading, error } = useSkill(name ?? '');
  const deleteMutation = useDeleteSkill();
  const patchMutation = usePatchSkill();

  const [showDeploy, setShowDeploy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const handleDelete = () => {
    if (!name) return;
    if (!confirm(`Delete skill "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(name, {
      onSuccess: () => {
        toast.success(`Deleted "${name}"`);
        navigate('/skills');
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      },
    });
  };

  const handleCopyBody = useCallback(() => {
    if (!pkg?.skill.body) return;
    navigator.clipboard.writeText(pkg.skill.body).then(() => {
      toast.success('Body copied to clipboard');
    });
  }, [pkg?.skill.body]);

  const handleSave = useCallback(
    (patch: { description?: string; body?: string; tags?: string[]; category?: string }) => {
      if (!name) return;
      patchMutation.mutate(
        { name, patch },
        {
          onSuccess: () => {
            toast.success('Skill saved');
            setIsEditing(false);
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Save failed');
          },
        },
      );
    },
    [name, patchMutation],
  );

  const handleCloneSuccess = (newName: string) => {
    setShowClone(false);
    navigate(`/skills/${encodeURIComponent(newName)}`);
  };

  const handleRenameSuccess = (newName: string) => {
    setShowRename(false);
    navigate(`/skills/${encodeURIComponent(newName)}`, { replace: true });
  };

  if (isLoading) {
    return <LoadingSpinner className="py-24" size="lg" label="Loading skill..." />;
  }

  if (error || !pkg) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Skill not found'}
        </div>
      </div>
    );
  }

  const { skill, files } = pkg;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Navigation */}
      <button
        onClick={() => navigate('/skills')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to skills
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{skill.name}</h2>
          {!isEditing && skill.metadata.description && (
            <p className="mt-1 text-sm text-gray-500">
              {skill.metadata.description as string}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Copy body */}
          <button
            onClick={handleCopyBody}
            title="Copy body to clipboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
          </button>

          {/* Edit toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium',
              isEditing
                ? 'border-brand-300 bg-brand-50 text-brand-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            )}
          >
            <Pencil className="h-3.5 w-3.5" /> {isEditing ? 'Editing' : 'Edit'}
          </button>

          {/* Clone */}
          <button
            onClick={() => setShowClone(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Copy className="h-3.5 w-3.5" /> Clone
          </button>

          {/* Rename */}
          <button
            onClick={() => setShowRename(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <PenLine className="h-3.5 w-3.5" /> Rename
          </button>

          {/* Deploy */}
          <button
            onClick={() => setShowDeploy(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Rocket className="h-3.5 w-3.5" /> Deploy
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {name && <SkillInfoPanel name={name} />}

      {/* Edit mode vs View mode */}
      {isEditing ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <EditSkillForm
            skill={skill}
            onSave={handleSave}
            onCancel={() => setIsEditing(false)}
            isSaving={patchMutation.isPending}
          />
        </div>
      ) : (
        <>
          {/* Metadata */}
          {Object.keys(skill.metadata).length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-700">Metadata</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(skill.metadata).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-gray-400">{key}</dt>
                    <dd className="font-medium text-gray-700">
                      {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Body (Markdown) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <FileText className="h-4 w-4" /> Content
            </h3>
            <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-600 prose-code:text-brand-700 prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown>{skill.body}</ReactMarkdown>
            </div>
          </div>

          {/* Files */}
          {files.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Folder className="h-4 w-4" /> Files ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((file) => (
                  <details key={file.path} className="group">
                    <summary className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-mono text-gray-600 hover:bg-gray-50">
                      {file.path}
                    </summary>
                    <pre className="mt-1 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                      {file.content}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      {showDeploy && name && (
        <DeployDialog skillNames={[name]} onClose={() => setShowDeploy(false)} />
      )}
      {showClone && name && (
        <CloneDialog
          skillName={name}
          onClose={() => setShowClone(false)}
          onSuccess={handleCloneSuccess}
        />
      )}
      {showRename && name && (
        <RenameDialog
          skillName={name}
          onClose={() => setShowRename(false)}
          onSuccess={handleRenameSuccess}
        />
      )}
    </div>
  );
}
