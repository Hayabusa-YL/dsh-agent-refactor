import { useUserDashboard } from './hooks/useUserDashboard';
import DashboardToolbar from './components/DashboardToolbar';
import FilterPanel from './components/FilterPanel';
import UserTable from './components/UserTable';
import Pagination from './components/Pagination';
import UserFormModal from './components/UserFormModal';
import ConfirmDialog from './components/ConfirmDialog';

export default function Dashboard() {
  const {
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
  } = useUserDashboard();

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: 0, marginBottom: 16 }}>用户管理</h2>

      <DashboardToolbar
        keyword={keyword}
        showFilter={showFilter}
        exporting={exporting}
        selectedCount={selectedIds.size}
        onKeywordChange={setKeyword}
        onToggleFilter={() => setShowFilter(!showFilter)}
        onReset={resetFilters}
        onAdd={openAdd}
        onExport={handleExport}
        onBatchDelete={requestBatchDelete}
      />

      {showFilter && (
        <FilterPanel
          roleFilter={roleFilter}
          statusFilter={statusFilter}
          onRoleChange={setRoleFilter}
          onStatusChange={setStatusFilter}
        />
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
          <UserTable
            pageData={pageData}
            selectedIds={selectedIds}
            sortKey={sortKey}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelect={toggleSelect}
            onEdit={openEdit}
            onDelete={requestDelete}
          />

          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={filtered.length}
            onPageChange={setPage}
          />
        </>
      )}

      <UserFormModal
        open={modalOpen}
        editingUser={editingUser}
        formData={formData}
        onFormChange={handleFormChange}
        onSave={handleSave}
        onCancel={() => setModalOpen(false)}
      />

      <ConfirmDialog confirm={confirm} onConfirm={doConfirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
