import { employeeFacetsResponseSchema, employeeListResponseSchema } from '@acme/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { facetsApiQuery, listApiQuery, type ListFilters } from './list-filters';

export function useEmployeeList(filters: ListFilters) {
  const query = listApiQuery(filters).toString();
  return useQuery({
    queryKey: ['employees', 'list', query],
    queryFn: () => apiGet(`/api/employees?${query}`, employeeListResponseSchema),
    placeholderData: keepPreviousData,
  });
}

/** How many employees each filter option would match under the current search and filters. */
export function useEmployeeFacets(filters: ListFilters) {
  const query = facetsApiQuery(filters).toString();
  return useQuery({
    queryKey: ['employees', 'facets', query],
    queryFn: () => apiGet(`/api/employees/facets?${query}`, employeeFacetsResponseSchema),
    placeholderData: keepPreviousData,
  });
}
