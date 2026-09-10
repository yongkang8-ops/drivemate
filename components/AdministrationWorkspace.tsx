"use client";

import { useEffect, useRef, useState } from "react";
import { adminSectionFromHash, adminSections, type AdminSectionId } from "../lib/adminSections";
import { AdminDashboard } from "./AdminDashboard";
import { AdminOperationsPanel } from "./AdminOperationsPanel";
import { PurchaseImportPanel } from "./PurchaseImportPanel";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { WorkspaceBrand } from "./WorkspaceBrand";

export function AdministrationWorkspace() {
  const [section, setSection] = useState<AdminSectionId>("overview");
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollBySection = useRef(new Map<AdminSectionId, number>());
  useEffect(() => {
    const restore = () => setSection(adminSectionFromHash(window.location.hash));
    restore();
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("hashchange", restore); window.removeEventListener("popstate", restore); };
  }, []);
  function openSection(next: AdminSectionId) {
    if (next === section) return;
    scrollBySection.current.set(section, window.scrollY);
    window.history.pushState(window.history.state, "", `#${next}`);
    setSection(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollBySection.current.get(next) ?? 0, behavior: "instant" });
    });
  }
  return <div className="administration-app">
    <aside className="administration-sidebar">
      <WorkspaceBrand />
      <WorkspaceNavigation current="/admin" />
      <nav className="workspace-navigation admin-modules" aria-label="Admin modules">
        <span>Management</span>
        {adminSections.map(item => <a href={`#${item.id}`} key={item.id} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "is-active" : undefined} onClick={event => { if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); openSection(item.id); }}>{item.label}</a>)}
      </nav>
    </aside>
    <main className="administration-content" id="administration-main">
      <header className="administration-heading"><p className="eyebrow">Administration</p><h1 ref={heading} tabIndex={-1}>{adminSections.find(item => item.id === section)?.label}</h1><p>Manage approved records. Sensitive changes require additional verification.</p></header>
      {/* Keep stateful editors mounted: section navigation must not discard drafts. */}
      <div hidden={section !== "purchasing"}><PurchaseImportPanel /></div>
      <AdminOperationsPanel section={section} />
      <AdminDashboard section={section} />
    </main>
  </div>;
}
