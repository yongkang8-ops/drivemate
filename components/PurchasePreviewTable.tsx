"use client";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { PaginatedTable } from "./PaginatedTable";

export type PurchasePreviewRow = { sku: string; partNumber: string; nameEn: string; quantity: number; cashPurchaseCostMinor: number; riskTier: string };
export function PurchasePreviewTable({ rows }: { rows: PurchasePreviewRow[] }) {
  const columns = useMemo<ColumnDef<PurchasePreviewRow>[]>(() => [
    { accessorKey: "sku", header: "SKU" }, { accessorKey: "partNumber", header: "Part Number" }, { accessorKey: "nameEn", header: "Part" },
    { accessorKey: "quantity", header: "Qty" }, { accessorKey: "riskTier", header: "Risk" },
    { accessorKey: "cashPurchaseCostMinor", header: "Cash cost", cell: ({ getValue }) => `RMB ${(Number(getValue()) / 100).toFixed(2)}` },
  ], []);
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  return <div className="import-preview-table"><PaginatedTable id="purchasePreview" label="Purchase preview" total={rows.length}><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></PaginatedTable></div>;
}
