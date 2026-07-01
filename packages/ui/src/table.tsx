import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "./utils";

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    return (
      <table
        ref={ref}
        className={cn(
          "w-full min-w-[560px] table-fixed border-separate border-spacing-y-2 text-left",
          className,
        )}
        {...props}
      />
    );
  },
);

Table.displayName = "Table";

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  return <thead ref={ref} className={className} {...props} />;
});

TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => {
  return <tbody ref={ref} className={className} {...props} />;
});

TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => {
    return <tr ref={ref} className={className} {...props} />;
  },
);

TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    return <th ref={ref} className={cn("px-3 py-2 font-medium", className)} {...props} />;
  },
);

TableHead.displayName = "TableHead";

export type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  edge?: "end" | "start" | undefined;
};

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, edge, ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={cn(
          "qitu-table-cell px-3 py-3 align-top",
          edge === "start" && "rounded-l-[var(--qitu-radius-md)]",
          edge === "end" && "rounded-r-[var(--qitu-radius-md)]",
          className,
        )}
        {...props}
      />
    );
  },
);

TableCell.displayName = "TableCell";
