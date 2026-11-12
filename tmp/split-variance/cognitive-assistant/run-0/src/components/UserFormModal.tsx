import type { User, UserFormData } from '../types';

interface UserFormModalProps {
  open: boolean;
  editingUser: User | null;
  formData: UserFormData;
  onFormChange: (field: keyof UserFormData, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function UserFormModal({
  open,
  editingUser,
  formData,
  onFormChange,
  onSave,
  onCancel,
}: UserFormModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{ background: '#fff', padding: 24, width: 420, borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>{editingUser ? '编辑用户' : '新增用户'}</h3>
        {([
          ['name', '姓名', 'text'],
          ['email', '邮箱', 'email'],
          ['phone', '手机号', 'tel'],
          ['department', '部门', 'text'],
          ['remark', '备注', 'text'],
        ] as [keyof UserFormData, string, string][]).map(([field, label, type]) => (
          <div key={field} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>{label}</label>
            <input
              type={type}
              value={formData[field]}
              onChange={(e) => onFormChange(field, e.target.value)}
              style={{ width: '100%', padding: 6 }}
            />
          </div>
        ))}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>角色</label>
          <select
            value={formData.role}
            onChange={(e) => onFormChange('role', e.target.value)}
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
            onChange={(e) => onFormChange('status', e.target.value)}
            style={{ width: '100%', padding: 6 }}
          >
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>取消</button>
          <button onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
