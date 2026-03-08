import { useState, useEffect, useCallback } from 'react';
import { Save, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useSaveWorkspace } from '../../hooks/useWorkspace';
import { TargetSelector } from '../deploy/TargetSelector';
import { HoverHint } from '../shared/HoverHint';
import type {
  ContentType,
  DeployTarget,
  DeployTargetDirectory,
  WorkspaceManifest,
  WorkspaceContentEntry,
} from '../../api/types';

interface WorkspaceFormProps {
  manifest: WorkspaceManifest;
  filePath: string;
  workspaceDir: string;
  targetDirectories: DeployTargetDirectory[];
}

const SOURCE_LABELS: Record<DeployTargetDirectory['source'], string> = {
  'workspace-local': 'Padrao do workspace',
  'config-override': 'Override global',
  'tool-default': 'Padrao da ferramenta',
};

export function WorkspaceForm({
  manifest,
  filePath,
  workspaceDir,
  targetDirectories,
}: WorkspaceFormProps) {
  const resolvedTargetDirectories = targetDirectories ?? [];
  const [name, setName] = useState(manifest.name ?? '');
  const [description, setDescription] = useState(manifest.description ?? '');
  const [defaultTargets, setDefaultTargets] = useState<DeployTarget[]>(manifest.defaultTargets ?? ['claude-code']);
  const [contents, setContents] = useState<WorkspaceContentEntry[]>(manifest.contents ?? manifest.skills ?? []);
  const [newContentName, setNewContentName] = useState('');
  const [newContentType, setNewContentType] = useState<ContentType>('skill');
  const saveMutation = useSaveWorkspace();

  // Sync form when manifest prop changes (e.g. workspace switch)
  useEffect(() => {
    setName(manifest.name ?? '');
    setDescription(manifest.description ?? '');
    setDefaultTargets(manifest.defaultTargets ?? ['claude-code']);
    setContents(manifest.contents ?? manifest.skills ?? []);
  }, [manifest]);

  const handleSave = useCallback(() => {
    const updated: WorkspaceManifest = {
      version: 2,
      ...(name.trim() && { name: name.trim() }),
      ...(description.trim() && { description: description.trim() }),
      defaultTargets,
      contents: contents.length > 0 ? contents : undefined,
      // Preserve groups from original manifest (form doesn't edit groups yet)
      ...(manifest.groups && { groups: manifest.groups }),
      ...(manifest.profile && { profile: manifest.profile }),
    };

    saveMutation.mutate(
      { filePath, manifest: updated },
      {
        onSuccess: () => toast.success('Workspace salvo'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Nao foi possivel salvar o workspace'),
      },
    );
  }, [name, description, defaultTargets, contents, manifest.groups, manifest.profile, filePath, saveMutation]);

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

  const addContent = () => {
    const trimmed = newContentName.trim();
    if (!trimmed) return;
    if (contents.some((entry) => entry.name === trimmed && entry.type === newContentType)) {
      toast.error(`O conteudo "${newContentType}/${trimmed}" ja esta na lista`);
      return;
    }
    setContents([...contents, { type: newContentType, name: trimmed }]);
    setNewContentName('');
    setNewContentType('skill');
  };

  const removeContent = (index: number) => {
    setContents(contents.filter((_, i) => i !== index));
  };

  const updateContentTargets = (index: number, targets: DeployTarget[]) => {
    const updated = [...contents];
    if (targets.length > 0) {
      updated[index] = { ...updated[index]!, targets };
    } else {
      // Remove per-skill override, falls back to defaultTargets
      const { targets: _, ...rest } = updated[index]!;
      updated[index] = rest;
    }
    setContents(updated);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Configuracao do workspace</h3>
          <HoverHint text="O Agent Hub guarda estas informacoes no arquivo interno ahub.workspace.json. Esse arquivo nao e a nuvem de skills; ele apenas descreve o que este projeto deve baixar e para onde enviar." />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pasta do workspace</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-700">{workspaceDir}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Arquivo interno</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-700">{filePath}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
              Nome de exibicao
              <HoverHint text="Use um nome facil de localizar na lista, como Projeto principal ou Cliente A." />
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Projeto principal"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
              Descricao
              <HoverHint text="Use esta descricao para lembrar o que este projeto sincroniza ou qual contexto ele atende." />
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Conteudos usados neste projeto"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-700">Pastas reconhecidas pelos agentes</h4>
                <HoverHint text="Estas sao as pastas que Codex, Claude Code e Cursor vao observar neste workspace. O sync usa esses caminhos para que as skills fiquem disponiveis dentro do aplicativo." />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {resolvedTargetDirectories.map((directory) => (
              <div key={directory.target} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">{directory.label}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                    {SOURCE_LABELS[directory.source]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {directory.exists ? 'Pasta encontrada no disco' : 'Sera criada no primeiro sync'}
                </p>
                <div className="mt-3 space-y-2 text-xs text-gray-600">
                  <div>
                    <p className="font-medium text-gray-700">Raiz</p>
                    <p className="break-all font-mono text-[11px] text-gray-500">{directory.rootPath}</p>
                  </div>
                  <div>
                  <p className="font-medium text-gray-700">Pasta de skills</p>
                    <p className="break-all font-mono text-[11px] text-gray-500">{directory.directories.skill}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Pasta de prompts</p>
                    <p className="break-all font-mono text-[11px] text-gray-500">{directory.directories.prompt}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Pasta de subagents</p>
                    <p className="break-all font-mono text-[11px] text-gray-500">{directory.directories.subagent}</p>
                  </div>
                </div>
              </div>
            ))}
            {resolvedTargetDirectories.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500 sm:col-span-3">
                O Agent Hub vai mostrar essas pastas assim que os dados do workspace forem carregados.
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <TargetSelector
            selected={defaultTargets}
            onChange={setDefaultTargets}
            label="Agentes padrao deste workspace"
            description="Escolha para quais aplicativos os conteudos deste workspace devem ser enviados por padrao."
            labelAddon={
              <HoverHint text="Se um conteudo nao tiver destino proprio, ele usara estes agentes como padrao." />
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Conteudos deste workspace ({contents.length})
            </h3>
            <HoverHint text="Somente os conteudos listados aqui entram no sync deste workspace. Se a lista estiver vazia, o projeto continua valido e pode receber conteudos depois." />
          </div>
          <span className="text-xs text-gray-400">Ctrl+S para salvar</span>
        </div>

        {contents.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100">
            {contents.map((content, i) => (
              <div key={`${content.type}/${content.name}`} className="flex items-center gap-3 py-3 first:pt-0">
                <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-gray-900">
                  {content.type}/{content.name}
                </span>
                <div className="flex flex-shrink-0 gap-1">
                  {(['claude-code', 'codex', 'cursor'] as DeployTarget[]).map((t) => {
                    const active = content.targets?.includes(t) ?? false;
                    const isDefault = !content.targets && defaultTargets.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          const current = content.targets ?? [...defaultTargets];
                          const next = current.includes(t)
                            ? current.filter((x) => x !== t)
                            : [...current, t];
                          updateContentTargets(i, next);
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
                        title={isDefault ? 'Herdado dos agentes padrao' : `Alternar ${t}`}
                      >
                        {t === 'claude-code' ? 'CC' : t === 'codex' ? 'CX' : 'CR'}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => removeContent(i)}
                  className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                  title="Remove conteudo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <select
            value={newContentType}
            onChange={(event) => setNewContentType(event.target.value as ContentType)}
            className="w-36 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="skill">skill</option>
            <option value="prompt">prompt</option>
            <option value="subagent">subagent</option>
          </select>
          <input
            type="text"
            value={newContentName}
            onChange={(e) => setNewContentName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addContent()}
            placeholder="content-name"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            onClick={addContent}
            disabled={!newContentName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Adicionar
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
            Groups are preserved on save. Use the Raw JSON editor to modify grouped sync rules.
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
                  {(group.contents?.map((entry) => `${entry.type}/${entry.name}`) ?? group.skills ?? []).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save workspace profile'}
        </button>
      </div>
    </div>
  );
}
