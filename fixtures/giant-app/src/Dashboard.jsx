import { useEffect, useMemo, useRef, useState } from 'react';

const PAGE_SIZE = 10;

const initialForm = {
  name: '',
  email: '',
  role: 'user',
  status: 'active',
  department: '',
  phone: '',
  remark: '',
};

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function maskPhone(phone) {
  if (!phone) return '-';
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

async function fetchUsers(keyword = '') {
  await new Promise((r) => setTimeout(r, 200));
  const all = [];
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

export default function Dashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortKey, setSortKey] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(initialForm);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const toastTimer = useRef(null);

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

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function notify(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter);
    if (statusFilter !== 'all') list = list.filter((u) => u.status === statusFilter);
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string') {
        return sortOrder === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortOrder === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [users, roleFilter, statusFilter, sortKey, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageIds = pageData.map((u) => u.id);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  }

  function toggleSelect(id) {
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

  function openEdit(user) {
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

  function handleFormChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function validateForm() {
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

  function requestDelete(user) {
    setConfirm({ type: 'delete', user, message: `确定删除「${user.name}」吗？` });
  }

  function requestBatchDelete() {
    setConfirm({ type: 'batch', message: `确定删除选中的 ${selectedIds.size} 个用户吗？` });
  }

  function doConfirm() {
    if (confirm?.type === 'delete') {
      setUsers((prev) => prev.filter((u) => u.id !== confirm.user.id));
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

  const missingCount = selectedIds.size;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: 0, marginBottom: 16 }}>用户管理</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="搜索姓名 / 邮箱 / 部门"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ padding: '6px 10px', width: 240 }}
        />
        <button onClick={() => setShowFilter(!showFilter)}>
          {showFilter ? '收起筛选' : '筛选'}
        </button>
        <button onClick={resetFilters}>重置</button>
        <div style={{ flex: 1 }} />
        <button onClick={openAdd}>+ 新增用户</button>
        <button onClick={handleExport} disabled={exporting}>
          {exporting ? '导出中…' : '导出'}
        </button>
        {missingCount > 0 && (
          <button style={{ color: 'red' }} onClick={requestBatchDelete}>
            批量删除（{missingCount}）
          </button>
        )}
      </div>

      {showFilter && (
        <div style={{ padding: 12, border: '1px dashed #ccc', marginBottom: 12, display: 'flex', gap: 16 }}>
          <label>
            角色：
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">全部</option>
              <option value="admin">管理员</option>
              <option value="user">普通用户</option>
            </select>
          </label>
          <label>
            状态：
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">全部</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
        </div>
      )}

      {toast && (
        <div style={{ background: '#e6f4ff', border: '1px solid #91caff', padding: '8px 12px', marginBottom: 12 }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>加载中…</div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>
                  <input
                    type="checkbox"
                    checked={pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))}
                    onChange={toggleSelectAll}
                  />
                </th>
                {[
                  ['id', 'ID'],
                  ['name', '姓名'],
                  ['email', '邮箱'],
                  ['role', '角色'],
                  ['status', '状态'],
                  ['department', '部门'],
                  ['phone', '手机号'],
                  ['createdAt', '创建时间'],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    style={{ padding: 8, cursor: 'pointer' }}
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    {sortKey === key ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th style={{ padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: '#999' }}>
                    暂无数据
                  </td>
                </tr>
              )}
              {pageData.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>
                    <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />
                  </td>
                  <td style={{ padding: 8 }}>{u.id}</td>
                  <td style={{ padding: 8 }}>{u.name}</td>
                  <td style={{ padding: 8 }}>{u.email}</td>
                  <td style={{ padding: 8 }}>
                    {u.role === 'admin' ? (
                      <span style={{ color: '#d4380d' }}>管理员</span>
                    ) : (
                      <span>普通用户</span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    {u.status === 'active' ? (
                      <span style={{ color: '#389e0d' }}>启用</span>
                    ) : (
                      <span style={{ color: '#999' }}>停用</span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>{u.department}</td>
                  <td style={{ padding: 8 }}>{maskPhone(u.phone)}</td>
                  <td style={{ padding: 8 }}>{formatDate(u.createdAt)}</td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => openEdit(u)}>编辑</button>{' '}
                    <button style={{ color: 'red' }} onClick={() => requestDelete(u)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
              .map((n, idx, arr) => (
                <span key={n}>
                  {idx > 0 && n - arr[idx - 1] > 1 && <span style={{ color: '#aaa' }}>…</span>}
                  <button
                    onClick={() => setPage(n)}
                    style={{ fontWeight: n === page ? 'bold' : 'normal' }}
                  >
                    {n}
                  </button>
                </span>
              ))}
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              下一页
            </button>
            <span style={{ marginLeft: 'auto', color: '#666' }}>
              共 {filtered.length} 条 / 第 {page} 页 共 {totalPages} 页
            </span>
          </div>
        </>
      )}

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div style={{ background: '#fff', padding: 24, width: 420, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>{editingUser ? '编辑用户' : '新增用户'}</h3>
            {[
              ['name', '姓名', 'text'],
              ['email', '邮箱', 'email'],
              ['phone', '手机号', 'tel'],
              ['department', '部门', 'text'],
              ['remark', '备注', 'text'],
            ].map(([field, label, type]) => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  type={type}
                  value={formData[field]}
                  onChange={(e) => handleFormChange(field, e.target.value)}
                  style={{ width: '100%', padding: 6 }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>角色</label>
              <select
                value={formData.role}
                onChange={(e) => handleFormChange('role', e.target.value)}
                style={{ width: '100%', padding: 6 }}
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>状态</label>
              <select
                value={formData.status}
                onChange={(e) => handleFormChange('status', e.target.value)}
                style={{ width: '100%', padding: 6 }}
              >
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModalOpen(false)}>取消</button>
              <button onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: 24, width: 360, borderRadius: 8 }}>
            <p style={{ marginTop: 0 }}>{confirm.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setConfirm(null)}>取消</button>
              <button style={{ color: 'red' }} onClick={doConfirm}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
