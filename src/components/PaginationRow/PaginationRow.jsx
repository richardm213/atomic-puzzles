import { useEffect, useState } from "react";

export const PaginationRow = ({ currentPage, totalPages, onPageChange, formatLabel, disabled }) => {
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPageChange = () => {
    const parsedPage = Number.parseInt(pageInput, 10);
    const nextPage = Math.min(totalPages, Math.max(1, Number.isNaN(parsedPage) ? currentPage : parsedPage));
    setIsEditingPage(false);
    setPageInput(String(nextPage));
    if (nextPage !== currentPage) {
      onPageChange(nextPage);
    }
  };

  return (
    <div className="paginationRow">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={disabled || currentPage <= 1}
      >
        Previous
      </button>
      {isEditingPage ? (
        <form
          className="paginationJumpForm"
          onSubmit={(event) => {
            event.preventDefault();
            commitPageChange();
          }}
        >
          <label className="paginationJumpLabel">
            <span>Page</span>
            <input
              className="paginationJumpInput"
              type="number"
              inputMode="numeric"
              min="1"
              max={totalPages}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageChange}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setIsEditingPage(false);
                setPageInput(String(currentPage));
              }}
              autoFocus
              disabled={disabled}
              aria-label={`Enter page number between 1 and ${totalPages}`}
            />
            <span>of {totalPages}</span>
          </label>
        </form>
      ) : (
        <button
          type="button"
          className="paginationPageButton"
          onClick={() => setIsEditingPage(true)}
          disabled={disabled}
          aria-label={`Current page ${currentPage} of ${totalPages}. Click to enter a page number.`}
        >
          {formatLabel ? formatLabel(currentPage, totalPages) : `Page ${currentPage} of ${totalPages}`}
        </button>
      )}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={disabled || currentPage >= totalPages}
      >
        Next
      </button>
    </div>
  );
};
