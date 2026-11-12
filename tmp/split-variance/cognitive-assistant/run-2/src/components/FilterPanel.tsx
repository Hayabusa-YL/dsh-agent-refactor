interface FilterPanelProps {
  roleFilter: string;
  statusFilter: string;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

export default function FilterPanel({
  roleFilter,
  statusFilter,
  onRoleChange,
  onStatusChange,
}: FilterPanelProps) {
  return (
    <div style={{ padding: 12, border: '1px dashed #ccc', marginBottom: 12, display: 'flex', gap: 16 }}>
      <label>
        角色：
        <select value={roleFilter} onChange={(e) => onRoleChange(e.target.value)}>
          <option value="all">全部</option>
          <option value="admin">管理员</option>
          <option value="user">普通用户</option>
        </select>
      </label>
      <label>
        状态：
        <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}>
          <option value="all">全部</option>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
      </label>
    </div>
  );
}
