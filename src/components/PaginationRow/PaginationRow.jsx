export const PaginationRow = ({ currentPage, totalPages, onPageChange, formatLabel }) => (
  <div className="paginationRow">
    <button
      type="button"
      onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      disabled={currentPage <= 1}
    >
      Previous
    </button>
    <span>
      {formatLabel ? formatLabel(currentPage, totalPages) : `Page ${currentPage} of ${totalPages}`}
    </span>
    <button
      type="button"
      onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      disabled={currentPage >= totalPages}
    >
      Next
    </button>
  </div>
);
