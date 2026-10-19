import {
  employeeDetailSchema,
  type EmployeeDetail,
  type NewEmployeeBody,
  type SalaryChangeBody,
  type UpdateEmployeeBody,
} from '@acme/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '@/lib/api';

export function useEmployee(id: number) {
  return useQuery({
    queryKey: ['employees', 'detail', id],
    queryFn: () => apiGet(`/api/employees/${id}`, employeeDetailSchema),
  });
}

/** Every write returns the full detail, so the cache is replaced without a second request. */
function useDetailCache() {
  const queryClient = useQueryClient();
  return (detail: EmployeeDetail) => {
    queryClient.setQueryData(['employees', 'detail', detail.id], detail);
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
