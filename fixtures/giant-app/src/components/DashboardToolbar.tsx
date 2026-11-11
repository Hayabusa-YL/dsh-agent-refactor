interface DashboardToolbarProps {
  keyword: string;
  showFilter: boolean;
  exporting: boolean;
  selectedCount: number;
  onKeywordChange: (value: string) => void;
  onToggleFilter: () => void;
  onReset: () => void;
  onAdd: () => void;
  onExport: () => void;
  onBatchDelete: () => void;
}

export default function DashboardToolbar({
  keyword,
  showFilter,
  exporting,
  selectedCount,
  onKeywordChange,
  onToggleFilter,
  onReset,
  onAdd,
  onExport,
  onBatchDelete,
}: DashboardToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <input
        placeholder="搜索姓名 / 邮箱 / 部门"
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        style={{ padding: '6px 10px', width: 240 }}
      />
      <button onClick={onToggleFilter}>{showFilter ? '收起筛选' : '筛选'}</button>
      <button onClick={onReset}>重置</button>
      <div style={{ flex: 1 }} />
      <button onClick={onAdd}>+ 新增用户</button>
      <button onClick={onExport} disabled={exporting}>
        {exporting ? '导出中…' : '导出'}
      </button>
      {selectedCount > 0 && (
        <button style={{ color: 'red' }} onClick={onBatchDelete}>
          批量删除（{selectedCount}）
        </button>
      )}
    </div>
  );
}
