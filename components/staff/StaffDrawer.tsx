"use client";

import { X } from "@phosphor-icons/react";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
}

export function StaffDrawer({
  title,
  subtitle,
  closeLocked = false,
  returnFocusRef,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  closeLocked?: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = `staff-drawer-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = focusableElements(dialog);
    focusables[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeLocked) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const current = focusableElements(dialog!);
      if (current.length === 0) return;
      const first = current[0];
      const last = current[current.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [closeLocked, onClose, returnFocusRef]);

  return (
    <div className="staff-drawer-layer">
      <button aria-label="Dismiss account panel" className="staff-drawer-backdrop" disabled={closeLocked} onClick={onClose} type="button" />
      <section aria-labelledby={titleId} aria-modal="true" className="staff-drawer" ref={dialogRef} role="dialog">
        <header className="staff-drawer-header">
          <div><p className="eyebrow">Staff account</p><h2 id={titleId}>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button aria-label="Close account panel" className="icon-button" disabled={closeLocked} onClick={onClose} type="button"><X size={19} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}
