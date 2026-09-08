"use client";

import { useEffect, useRef } from "react";
import { safeViewportContext } from "../lib/viewportContext";

// Only viewport coordinates live in history and a tab-scoped fallback. No credentials,
// form contents or business records are cached. Async session checks can shrink
// the document before the browser's own restoration has enough content.
export function useHistoryScroll(hasAccess: boolean) {
  const allowed = useRef(hasAccess);
  allowed.current = hasAccess;
  useEffect(() => {
    const context = () => safeViewportContext(location.pathname + location.search + location.hash);
    const key = () => { const route = context(); return route ? `dm-viewport:${route}` : null; };
    const readSaved = () => {
      try { const storageKey = key(); return history.state?.dmViewport ?? (storageKey ? JSON.parse(sessionStorage.getItem(storageKey) ?? "null") : null); }
      catch { return history.state?.dmViewport; }
    };
    const initialSaved = readSaved();
    let position = { x: scrollX, y: scrollY };
    let restoring = false;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    let saveFrame = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { restoring = false; cancelAnimationFrame(frame); observer?.disconnect(); observer = null; clearTimeout(timeout); };
    const restore = (saved = initialSaved) => {
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y) || saved.y < 0 || saved.x < 0) return;
      const startingContext = location.href;
      finish(); restoring = true;
      const attempt = () => {
        if (location.href !== startingContext) { finish(); return; }
        if (!restoring || !allowed.current || document.documentElement.scrollHeight - innerHeight < saved.y) return;
        scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
        position = { x: saved.x, y: saved.y }; finish();
      };
      observer = new ResizeObserver(attempt);
      observer.observe(document.body);
      timeout = setTimeout(finish, 5000);
      frame = requestAnimationFrame(attempt);
    };
    const persist = () => {
      history.replaceState({ ...history.state, dmViewport: position }, "");
      try { const storageKey = key(); if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(position)); } catch { /* Storage may be blocked. Native history remains available. */ }
    };
    const track = () => {
      if (restoring || !allowed.current) return;
      position = { x: scrollX, y: scrollY };
      cancelAnimationFrame(saveFrame);
      // WebKit may snapshot history before either unload lifecycle handler.
      // Keep the current entry up to date while the user scrolls, at most once
      // per animation frame, without adding entries or changing the URL.
      saveFrame = requestAnimationFrame(persist);
    };
    const save = () => { finish(); cancelAnimationFrame(saveFrame); persist(); };
    const resume = (event: PageTransitionEvent) => { if (event.persisted) restore(readSaved()); };
    const userScroll = () => finish();
    window.addEventListener("scroll", track, { passive: true });
    window.addEventListener("pagehide", save);
    // WebKit snapshots the outgoing history entry before pagehide; capture
    // coordinates during beforeunload too (this handler never asks to block).
    window.addEventListener("beforeunload", save);
    window.addEventListener("pageshow", resume);
    window.addEventListener("wheel", userScroll, { passive: true });
    window.addEventListener("touchstart", userScroll, { passive: true });
    window.addEventListener("keydown", userScroll);
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === "back_forward" || navigation?.type === "reload") restore();
    return () => {
      finish();
      cancelAnimationFrame(saveFrame);
      window.removeEventListener("scroll", track); window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("pageshow", resume); window.removeEventListener("wheel", userScroll);
      window.removeEventListener("touchstart", userScroll); window.removeEventListener("keydown", userScroll);
    };
  }, []);
}
