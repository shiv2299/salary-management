import { employeeListResponseSchema } from '@acme/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { listApiQuery, type ListFilters } from './list-filters';

export function useEmployeeList(filters: ListFilters) {
  const query = listApiQuery(filters).toString();
  return useQuery({
    queryKey: ['employees', 'list', query],
    queryFn: () => apiGet(`/api/employees?${query}`, employeeListResponseSchema),
    placeholderData: keepPreviousData,
  });
}
