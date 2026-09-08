"use client";

import { useEffect, useRef, useState } from "react";

// Only explicit, non-secret list filters are placed in the URL. No form drafts.
export function useListFilters<T extends Record<string, string>>(defaults: T, tableId: string | readonly string[], allowed: Partial<Record<keyof T, readonly string[]>> = {}) {
  const initial = useRef(defaults);
  const permitted = useRef(allowed);
  const [values, setValues] = useState(defaults);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const result = { ...initial.current };
      for (const key of Object.keys(result) as Array<keyof T>) {
        const value = params.get(String(key));
        const options = permitted.current[key];
        if (value !== null && value.length <= 200 && !/[\u0000-\u001f]/.test(value) && (!options || options.includes(value))) result[key] = value as T[keyof T];
      }
      setValues(result);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function update<K extends keyof T>(key: K, value: T[K]) {
    setValues(current => ({ ...current, [key]: value }));
    const url = new URL(location.href);
    if (value === initial.current[key]) url.searchParams.delete(String(key));
    else url.searchParams.set(String(key), value.slice(0, 200));
    for (const id of typeof tableId === "string" ? [tableId] : tableId) url.searchParams.set(`${id}Page`, "1");
    // Typing is a single filter state, not one Back step per keystroke.
    history.replaceState(history.state, "", url);
    window.dispatchEvent(new Event("drivemate:list-state"));
  }
  return [values, update] as const;
}
