import { useCallback, useMemo, useState } from 'react';
import type { User } from '../types';

export type SortOrder = 'asc' | 'desc';

export function useUserFilters(users: User[]) {
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter);
    if (statusFilter !== 'all') list = list.filter((u) => u.status === statusFilter);
    const sorted = [...list].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortOrder === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortOrder === 'asc' ? an - bn : bn - an;
    });
    return sorted;
  }, [users, roleFilter, statusFilter, sortKey, sortOrder]);

  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortOrder('asc');
      }
    },
    [sortKey],
  );

  return {
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    sortKey,
    sortOrder,
    filtered,
    toggleSort,
  };
}
