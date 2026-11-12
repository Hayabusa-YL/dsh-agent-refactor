interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, totalCount, onPageChange }: PaginationProps) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        上一页
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
        .map((n, idx, arr) => (
          <span key={n}>
            {idx > 0 && n - arr[idx - 1] > 1 && <span style={{ color: '#aaa' }}>…</span>}
            <button onClick={() => onPageChange(n)} style={{ fontWeight: n === page ? 'bold' : 'normal' }}>
              {n}
            </button>
          </span>
        ))}
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        下一页
      </button>
      <span style={{ marginLeft: 'auto', color: '#666' }}>
        共 {totalCount} 条 / 第 {page} 页 共 {totalPages} 页
      </span>
    </div>
  );
}
