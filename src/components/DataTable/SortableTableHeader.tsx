import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { SortDirection } from "../../hooks/useTableSort";

type SortableTableHeaderProps = Omit<ComponentPropsWithoutRef<"th">, "aria-sort"> & {
  active: boolean;
  buttonClassName?: string;
  direction: SortDirection;
  label: ReactNode;
  onSort: () => void;
};

export const SortableTableHeader = ({
  active,
  buttonClassName,
  direction,
  label,
  onSort,
  scope = "col",
  ...props
}: SortableTableHeaderProps) => {
  const buttonClasses = ["sortableTableButton", buttonClassName, active ? "active" : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <th
      {...props}
      scope={scope}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className={buttonClasses} onClick={onSort}>
        {label}
        <span className="sortableTableIndicator" aria-hidden="true">
          {active ? (direction === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
};
