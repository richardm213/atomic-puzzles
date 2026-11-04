import "./PaginationRow.css";

import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";

export type PaginationRowProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  formatLabel?: (currentPage: number, totalPages: number) => string;
  disabled?: boolean;
  ariaLabel?: string;
  navigationVariant?: "text" | "arrows";
};

export const PaginationRow = ({
  currentPage,
  totalPages,
  onPageChange,
  formatLabel,
  disabled,
  ariaLabel = "Pagination",
  navigationVariant = "text",
}: PaginationRowProps) => {
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPageChange = (): void => {
    const parsedPage = Number.parseInt(pageInput, 10);
    const nextPage = Math.min(
      totalPages,
      Math.max(1, Number.isNaN(parsedPage) ? currentPage : parsedPage),
    );
    setIsEditingPage(false);
    setPageInput(String(nextPage));
    if (nextPage !== currentPage) {
      onPageChange(nextPage);
    }
  };

  return (
    <nav className="paginationRow" aria-label={ariaLabel}>
      <button
        type="button"
        className={navigationVariant === "arrows" ? "paginationArrowButton" : undefined}
        aria-label="Previous"
        title={navigationVariant === "arrows" ? "Previous page" : undefined}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={disabled || currentPage <= 1}
      >
        {navigationVariant === "arrows" ? (
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
        ) : (
          "Previous"
        )}
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
          {formatLabel
            ? formatLabel(currentPage, totalPages)
            : `Page ${currentPage} of ${totalPages}`}
        </button>
      )}
      <button
        type="button"
        className={navigationVariant === "arrows" ? "paginationArrowButton" : undefined}
        aria-label="Next"
        title={navigationVariant === "arrows" ? "Next page" : undefined}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={disabled || currentPage >= totalPages}
      >
        {navigationVariant === "arrows" ? (
          <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
        ) : (
          "Next"
        )}
      </button>
    </nav>
  );
};
