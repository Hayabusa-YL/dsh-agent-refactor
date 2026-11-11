import { useEffect, useState } from 'react';
import type { ConfirmState, User, UserFormData } from '../types';
import { useToast } from './useToast';
import { useUserFilters } from './useUserFilters';

export const PAGE_SIZE = 10;

export const initialForm: UserFormData = {
  name: '',
  email: '',
  role: 'user',
  status: 'active',
  department: '',
  phone: '',
  remark: '',
};

async function fetchUsers(keyword = ''): Promise<User[]> {
  await new Promise((r) => setTimeout(r, 200));
  const all: User[] = [];
  for (let i = 0; i < 47; i++) {
    all.push({
      id: i + 1,
      name: `用户${i + 1}`,
      email: `user${i + 1}@example.com`,
      role: i % 3 === 0 ? 'admin' : 'user',
      status: i % 5 === 0 ? 'disabled' : 'active',
      department: ['研发', '市场', '运营', '财务'][i % 4],
      phone: `138${String(10000000 + i * 123456).slice(0, 8)}`,
      remark: i % 7 === 0 ? '重点客户' : '',
      createdAt: Date.now() - i * 86400000,
    });
  }
  const kw = keyword.trim().toLowerCase();
  if (!kw) return all;
  return all.filter(
    (u) =>
      u.name.toLowerCase().includes(kw) ||
      u.email.toLowerCase().includes(kw) ||
      u.department.includes(kw),
  );
}

export function useUserDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>(initialForm);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { toast, notify } = useToast();
  const {
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    sortKey,
    sortOrder,
    filtered,
    toggleSort,
  } = useUserFilters(users);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUsers(keyword)
      .then((data) => {
        if (!cancelled) {
          setUsers(data);
          setPage(1);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keyword]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageIds = pageData.map((u) => u.id);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = pageIds.every((id) => next.has(id));
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function openAdd() {
    setEditingUser(null);
    setFormData(initialForm);
    setModalOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      department: user.department,
      phone: user.phone,
      remark: user.remark,
    });
    setModalOpen(true);
  }

  function handleFormChange(field: keyof UserFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function validateForm(): string | null {
    if (!formData.name.trim()) return '姓名不能为空';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return '邮箱格式不对';
    if (formData.phone && !/^1\d{10}$/.test(formData.phone)) return '手机号格式不对';
    return null;
  }

  async function handleSave() {
    const error = validateForm();
    if (error) {
      notify(error);
      return;
    }
    if (editingUser) {
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...formData } : u)));
      notify('已保存');
    } else {
      const maxId = users.reduce((m, u) => Math.max(m, u.id), 0);
      setUsers((prev) => [{ id: maxId + 1, ...formData, createdAt: Date.now() }, ...prev]);
      notify('已新增');
    }
    setModalOpen(false);
    setEditingUser(null);
  }

  function requestDelete(user: User) {
    setConfirm({ type: 'delete', user, message: `确定删除「${user.name}」吗？` });
  }

  function requestBatchDelete() {
    setConfirm({ type: 'batch', message: `确定删除选中的 ${selectedIds.size} 个用户吗？` });
  }

  function doConfirm() {
    if (confirm?.type === 'delete' && confirm.user) {
      setUsers((prev) => prev.filter((u) => u.id !== confirm.user!.id));
      notify('已删除');
    } else if (confirm?.type === 'batch') {
      setUsers((prev) => prev.filter((u) => !selectedIds.has(u.id)));
      setSelectedIds(new Set());
      notify(`已删除 ${selectedIds.size} 个`);
    }
    setConfirm(null);
  }

  async function handleExport() {
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      notify(`已导出 ${filtered.length} 条数据（模拟）`);
    } finally {
      setExporting(false);
    }
  }

  function resetFilters() {
    setKeyword('');
    setRoleFilter('all');
    setStatusFilter('all');
    setShowFilter(false);
  }

  return {
    users,
    loading,
    keyword,
    setKeyword,
    page,
    setPage,
    selectedIds,
    sortKey,
    sortOrder,
    modalOpen,
    editingUser,
    formData,
    confirm,
    showFilter,
    setShowFilter,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    exporting,
    toast,
    filtered,
    totalPages,
    pageData,
    pageIds,
    toggleSort,
    toggleSelect,
    toggleSelectAll,
    openAdd,
    openEdit,
    handleFormChange,
    handleSave,
    requestDelete,
    requestBatchDelete,
    doConfirm,
    handleExport,
    resetFilters,
    setModalOpen,
    setConfirm,
  };
}
