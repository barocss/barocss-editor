import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes } from 'react';

/** Table presentation only. The product owns records, selection and edit commands. */
export function DataTable({ className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table {...props} data-office-table className={className} />;
}

export function DataTableRow({ selected = false, ...props }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return <tr {...props} data-row-selected={selected} />;
}

export function DataTableCell({ numeric, readOnly, invalid, ...props }: TdHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
}) {
  return <td {...props} data-office-cell data-numeric={numeric || undefined}
    data-readonly={readOnly || undefined} data-invalid={invalid || undefined} />;
}
