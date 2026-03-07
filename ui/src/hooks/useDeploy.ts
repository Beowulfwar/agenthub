import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deploy } from '../api/client';
import type { DeployRequest } from '../api/types';

export function useDeploy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: DeployRequest) => deploy(req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      qc.invalidateQueries({ queryKey: ['workspace-registry'] });
    },
  });
}
