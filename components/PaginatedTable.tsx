"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

export function usePagination(id: string, total: number) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const nextPage = Number(params.get(`${id}Page`));
      const nextSize = Number(params.get(`${id}Size`));
      setPage(Number.isSafeInteger(nextPage) && nextPage > 0 ? nextPage : 1);
      setSize([25, 50, 100].includes(nextSize) ? nextSize : 25);
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("drivemate:list-state", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("drivemate:list-state", restore); };
  }, [id]);
  function navigate(next: number, nextSize = size) {
    const url = new URL(window.location.href);
    url.searchParams.set(`${id}Page`, String(next));
    url.searchParams.set(`${id}Size`, String(nextSize));
    window.history.pushState(window.history.state, "", url);
    setPage(next); setSize(nextSize);
  }
  return { current, size, total, pages, navigate, start: (current - 1) * size, end: Math.min(current * size, total) };
}

export function PaginationControls({ state, label }: { state: ReturnType<typeof usePagination>; label: string }) {
  const { current, size, total, pages, navigate } = state;
  return (
    <div className="pagination-controls" role="group" aria-label={`${label} pagination`}>
      <p role="status">{total === 0 ? "0 records" : `${(current - 1) * size + 1}–${Math.min(current * size, total)} of ${total} records`}</p>
      <label>Rows per page <select aria-label={`${label} rows per page`} value={size} onChange={event => navigate(1, Number(event.target.value))}>{[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <button type="button" className="secondary-button" disabled={current <= 1} onClick={() => navigate(current - 1)}>Previous</button>
      <span>Page {current} of {pages}</span>
      <button type="button" className="secondary-button" disabled={current >= pages} onClick={() => navigate(current + 1)}>Next</button>
    </div>
  );
}

// Retains existing cells/actions. Pagination never changes selection or issues a write.
export function PaginatedTable({ children, id, label, total, className }: {
  children: ReactNode; id: string; label: string; total: number; className?: string; resetKey?: string;
}) {
  const pager = usePagination(id, total);
  const scrollRegion = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const region = scrollRegion.current;
    if (!region) return;
    const update = () => setOverflows(region.scrollWidth > region.clientWidth + 1);
    const observer = new ResizeObserver(update);
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);
    update();
    return () => observer.disconnect();
  }, [total, pager.size]);
  return <div className="paginated-table">
    <PaginationControls state={pager} label={label} />
    {overflows ? <p className="table-scroll-hint">Scroll sideways to view all columns.</p> : null}
    <div ref={scrollRegion} className="paginated-table-scroll" role="region" aria-label={`${label} table, scroll horizontally for more columns`} tabIndex={0}>
      <table className={className} aria-label={label}>{Children.map(children, child => {
        if (!isValidElement<{ children?: ReactNode }>(child) || child.type !== "tbody" || total === 0) return child;
        const rows = Children.toArray(child.props.children);
        return cloneElement(child as ReactElement<{ children?: ReactNode }>, {}, rows.slice(pager.start, pager.end));
      })}</table>
    </div>
  </div>;
}
