import type { ConfirmState } from '../types';

interface ConfirmDialogProps {
  confirm: ConfirmState | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ confirm, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!confirm) return null;

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
    >
      <div style={{ background: '#fff', padding: 24, width: 360, borderRadius: 8 }}>
        <p style={{ marginTop: 0 }}>{confirm.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>取消</button>
          <button style={{ color: 'red' }} onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
