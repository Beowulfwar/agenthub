import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchConfig, setConfigValue } from '../api/client';

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
  });
}

export function useSetConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      setConfigValue(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] });
      qc.invalidateQueries({ queryKey: ['health'] });
    },
  });
}
