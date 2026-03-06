import { useState } from 'react';
import { X, Rocket, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useDeploy } from '../../hooks/useDeploy';
import { TargetSelector } from './TargetSelector';
import type { DeployTarget } from '../../api/types';

interface DeployDialogProps {
  skillNames: string[];
  onClose: () => void;
}

export function DeployDialog({ skillNames, onClose }: DeployDialogProps) {
  const [targets, setTargets] = useState<DeployTarget[]>(['claude-code']);
  const deployMutation = useDeploy();

  const handleDeploy = () => {
    if (!targets.length) {
      toast.error('Select at least one target');
      return;
    }

    deployMutation.mutate(
      { skills: skillNames, targets },
      {
        onSuccess: (result) => {
          if (result.failed.length === 0) {
            toast.success(`Deployed ${result.deployed.length} skill(s) successfully`);
          } else {
            toast.warning(
              `Deployed ${result.deployed.length}, failed ${result.failed.length}`,
            );
          }
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Deploy failed');
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Deploy Skills</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Skills list */}
        <div className="mt-4">
          <p className="text-sm text-gray-500">
            {skillNames.length} skill{skillNames.length !== 1 ? 's' : ''} selected:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skillNames.map((name) => (
              <span
                key={name}
                className="rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Target selector */}
        <div className="mt-5">
          <TargetSelector selected={targets} onChange={setTargets} />
        </div>

        {/* Result preview */}
        {deployMutation.data && (
          <div className="mt-4 space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
            {deployMutation.data.deployed.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {d.skill} → {d.target}
              </div>
            ))}
            {deployMutation.data.failed.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 text-red-700">
                <XCircle className="h-3.5 w-3.5" />
                {f.skill} → {f.target}: {f.error}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={deployMutation.isPending || !targets.length}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Rocket className="h-4 w-4" />
            {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
          </button>
        </div>
      </div>
    </div>
  );
}
