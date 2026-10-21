import {
  employeeDetailSchema,
  peerContextSchema,
  salaryChangePreviewSchema,
  type SalaryChangePreviewBody,
  type EmployeeDetail,
  type NewEmployeeBody,
  type SalaryChangeBody,
  type UpdateEmployeeBody,
} from '@acme/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '@/lib/api';

export function useEmployee(id: number) {
  return useQuery({
    queryKey: ['employees', 'detail', id],
    queryFn: () => apiGet(`/api/employees/${id}`, employeeDetailSchema),
  });
}

export function usePeerContext(id: number) {
  return useQuery({
    queryKey: ['employees', 'peer-context', id],
    queryFn: () => apiGet(`/api/employees/${id}/peer-context`, peerContextSchema),
  });
}

/** The server computes every percentage and conversion; the browser only displays the result. */
export function fetchSalaryPreview(id: number, body: SalaryChangePreviewBody) {
  return apiSend(
    'POST',
    `/api/employees/${id}/salary-changes/preview`,
    salaryChangePreviewSchema,
    body,
  );
}

export function useSalaryPreview(id: number, body: SalaryChangePreviewBody | null) {
  return useQuery({
    queryKey: ['employees', 'salary-preview', id, body],
    queryFn: () => {
      if (!body) throw new Error('No salary change to preview');
      return fetchSalaryPreview(id, body);
    },
    enabled: body !== null,
    placeholderData: keepPreviousData,
  });
}

/** Every write returns the full detail, so the cache is replaced without a second request. */
function useDetailCache() {
  const queryClient = useQueryClient();
  return (detail: EmployeeDetail) => {
    queryClient.setQueryData(['employees', 'detail', detail.id], detail);
    void queryClient.invalidateQueries({ queryKey: ['employees', 'peer-context', detail.id] });
    void queryClient.invalidateQueries({ queryKey: ['employees', 'salary-preview', detail.id] });
    void queryClient.invalidateQueries({ queryKey: ['employees', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['insights'] });
  };
}

export function useUpdateEmployee(id: number) {
  const store = useDetailCache();
  return useMutation({
    mutationFn: (body: UpdateEmployeeBody) =>
      apiSend('PATCH', `/api/employees/${id}`, employeeDetailSchema, body),
    onSuccess: store,
  });
}

export function useCreateEmployee() {
  const store = useDetailCache();
  return useMutation({
    mutationFn: (body: NewEmployeeBody) =>
      apiSend('POST', '/api/employees', employeeDetailSchema, body),
    onSuccess: store,
  });
}

export function useSalaryChange(id: number) {
  const store = useDetailCache();
  return useMutation({
    mutationFn: (body: SalaryChangeBody) =>
      apiSend('POST', `/api/employees/${id}/salary-changes`, employeeDetailSchema, body),
    onSuccess: store,
  });
}

/** No body and so no content type: the API rejects a JSON content type on these two. */
export function useSetEmployeeStatus(id: number) {
  const store = useDetailCache();
  return useMutation({
    mutationFn: (action: 'deactivate' | 'reactivate') =>
      action === 'deactivate'
        ? apiSend('DELETE', `/api/employees/${id}`, employeeDetailSchema)
        : apiSend('POST', `/api/employees/${id}/reactivate`, employeeDetailSchema),
    onSuccess: store,
  });
}
