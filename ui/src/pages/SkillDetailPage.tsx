import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardCopy,
  Copy,
  FileText,
  Folder,
  PenLine,
  Pencil,
  Rocket,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useContent, useDeleteContent, usePatchContent } from '../hooks/useSkills';
import { DeployDialog } from '../components/deploy/DeployDialog';
import { EditSkillForm } from '../components/skills/EditSkillForm';
import { CloneDialog } from '../components/skills/CloneDialog';
import { RenameDialog } from '../components/skills/RenameDialog';
import { SkillInfoPanel } from '../components/skills/SkillInfoPanel';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import type { ContentRef, ContentType } from '../api/types';

export function SkillDetailPage() {
  const { type, name } = useParams<{ type?: ContentType; name: string }>();
  const ref: ContentRef | null = name
    ? { type: type ?? 'skill', name }
    : null;
  const navigate = useNavigate();
  const { data: pkg, isLoading, error } = useContent(ref);
  const deleteMutation = useDeleteContent();
  const patchMutation = usePatchContent();

  const [showDeploy, setShowDeploy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const handleDelete = () => {
    if (!ref) return;
    if (!confirm(`Remover o conteudo "${ref.type}/${ref.name}"? Esta acao nao pode ser desfeita.`)) return;
    deleteMutation.mutate(ref, {
      onSuccess: () => {
        toast.success(`"${ref.name}" removido`);
        navigate('/skills');
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Falha ao remover o conteudo');
      },
    });
  };

  const handleCopyBody = useCallback(() => {
    if (!pkg?.skill.body) return;
    navigator.clipboard.writeText(pkg.skill.body).then(() => {
      toast.success('Conteudo copiado para a area de transferencia');
    });
  }, [pkg?.skill.body]);

  const handleSave = useCallback(
    (patch: { description?: string; body?: string; tags?: string[]; category?: string }) => {
      if (!ref) return;
      patchMutation.mutate(
        { ref, patch },
        {
          onSuccess: () => {
            toast.success('Conteudo salvo');
            setIsEditing(false);
          },
          onError: (err) => {
            toast.error(err instanceof Error ? err.message : 'Falha ao salvar o conteudo');
          },
        },
      );
    },
    [patchMutation, ref],
  );

  const handleCloneSuccess = (newName: string) => {
    setShowClone(false);
    navigate(`/skills/${encodeURIComponent(ref?.type ?? 'skill')}/${encodeURIComponent(newName)}`);
  };

  const handleRenameSuccess = (newName: string) => {
    setShowRename(false);
    navigate(`/skills/${encodeURIComponent(ref?.type ?? 'skill')}/${encodeURIComponent(newName)}`, { replace: true });
  };

  if (isLoading) {
    return <LoadingSpinner className="py-24" size="lg" label="Carregando conteudo..." />;
  }

  if (error || !pkg) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : 'Conteudo nao encontrado'}
        </div>
      </div>
    );
  }

  const { skill, files } = pkg;
  const skillDescription =
    typeof skill.metadata.description === 'string' ? skill.metadata.description : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button
        onClick={() => navigate('/skills')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para o catalogo
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900">{skill.name}</h1>
            {skillDescription && (
              <p className="mt-2 text-sm text-gray-500">{skillDescription}</p>
            )}
            <p className="mt-3 text-sm text-gray-500">
              Esta e a definicao global de `type/name` na nuvem. O fluxo operacional agora vive em
              `/skills`: escolha o workspace, o agente e baixe o conteudo para o destino correto.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopyBody}
              title="Copiar conteudo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copiar
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium',
                isEditing
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50',
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              {isEditing ? 'Editando' : 'Editar'}
            </button>
            <button
              onClick={() => setShowClone(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Clonar
            </button>
            <button
              onClick={() => setShowRename(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              <PenLine className="h-3.5 w-3.5" />
              Renomear
            </button>
            <button
              onClick={() => setShowDeploy(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Rocket className="h-3.5 w-3.5" />
              Baixar para workspace
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remover
            </button>
          </div>
        </div>
      </div>

      {ref && <SkillInfoPanel ref={ref} />}

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
          {Object.keys(skill.metadata).length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-700">Metadata</h3>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <FileText className="h-4 w-4" />
              Conteudo
            </h3>
            <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-600 prose-code:text-brand-700 prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown>{skill.body}</ReactMarkdown>
            </div>
          </div>

          {files.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Folder className="h-4 w-4" />
                Arquivos ({files.length})
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

      {showDeploy && ref && (
        <DeployDialog
          contentRefs={[ref]}
          onClose={() => setShowDeploy(false)}
        />
      )}
      {showClone && ref && (
        <CloneDialog
          contentRef={ref}
          onClose={() => setShowClone(false)}
          onSuccess={handleCloneSuccess}
        />
      )}
      {showRename && ref && (
        <RenameDialog
          contentRef={ref}
          onClose={() => setShowRename(false)}
          onSuccess={handleRenameSuccess}
        />
      )}
    </div>
  );
}
