import "./DataTable.css";

import type { ComponentPropsWithoutRef } from "react";

type DataTableProps = ComponentPropsWithoutRef<"table"> & {
  wrapperClassName?: string;
};

export const DataTable = ({ className, wrapperClassName, ...props }: DataTableProps) => {
  const wrapperClasses = ["dataTableWrap", wrapperClassName].filter(Boolean).join(" ");
  const tableClasses = ["dataTable", className].filter(Boolean).join(" ");

  return (
    <div className={wrapperClasses}>
      <table className={tableClasses} {...props} />
    </div>
  );
};
