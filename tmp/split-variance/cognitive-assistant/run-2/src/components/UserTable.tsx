import type { User } from '../types';

function formatDate(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function maskPhone(phone: string) {
  if (!phone) return '-';
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

interface UserTableProps {
  pageData: User[];
  selectedIds: Set<number>;
  sortKey: string;
  sortOrder: 'asc' | 'desc';
  onToggleSort: (key: string) => void;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: number) => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

export default function UserTable({
  pageData,
  selectedIds,
  sortKey,
  sortOrder,
  onToggleSort,
  onToggleSelectAll,
  onToggleSelect,
  onEdit,
  onDelete,
}: UserTableProps) {
  const pageIds = pageData.map((u) => u.id);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#fafafa', textAlign: 'left' }}>
          <th style={{ padding: 8 }}>
            <input
              type="checkbox"
              checked={pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))}
              onChange={onToggleSelectAll}
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
            <th key={key} style={{ padding: 8, cursor: 'pointer' }} onClick={() => onToggleSort(key)}>
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
              <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => onToggleSelect(u.id)} />
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
              <button onClick={() => onEdit(u)}>编辑</button>{' '}
              <button style={{ color: 'red' }} onClick={() => onDelete(u)}>
                删除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
