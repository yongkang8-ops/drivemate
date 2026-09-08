"use client";

import { ShieldCheck, X } from "@phosphor-icons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { buildApiHeaders, type AuthenticatedRole } from "../lib/clientAuth";
import { safeWorkspaceNext } from "../lib/workspaceRouting";

type MfaFactor = { id: string; friendlyName?: string; status: string };
type MfaEnrollment = { factorId: string; qrCode: string; secret: string };
type PendingRequest = {
  run: () => Promise<Response>;
  resolve: (response: Response) => void;
};
type DialogMode = "loading" | "challenge" | "enroll" | "expired" | "error";

const SensitiveFetchContext = createContext<
  ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null
>(null);

function cancelledResponse() {
  return Response.json(
    { ok: false, code: "mfa_cancelled", message: "Sensitive operation cancelled." },
    { status: 409 },
  );
}

async function responseCode(response: Response) {
  try {
    const body = (await response.clone().json()) as { code?: string };
    return body.code;
  } catch {
    return undefined;
  }
}

export function useSensitiveFetch() {
  const value = useContext(SensitiveFetchContext);
  if (!value) throw new Error("useSensitiveFetch must be used inside MfaStepUpProvider.");
  return value;
}

export function MfaStepUpProvider({
  role,
  children,
}: {
  role: AuthenticatedRole;
  children: ReactNode;
}) {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [mode, setMode] = useState<DialogMode>("loading");
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("Checking your security settings.");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const pendingRef = useRef<PendingRequest | null>(null);
  const actionBusy = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const closeWithCancellation = useCallback(() => {
    generation.current++;
    pendingRef.current?.resolve(cancelledResponse());
    pendingRef.current = null;
    actionBusy.current = false;
    setPending(null);
    setEnrollment(null);
    setFactors([]);
    setCode("");
    setBusy(false);
  }, []);

  useEffect(() => {
    const suspend = () => flushSync(closeWithCancellation);
    const rememberTrigger = (event: MouseEvent) => {
      if (pendingRef.current || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>("button");
      if (button) triggerRef.current = button;
    };
    window.addEventListener("pagehide", suspend);
    document.addEventListener("click", rememberTrigger, true);
    return () => { window.removeEventListener("pagehide", suspend); document.removeEventListener("click", rememberTrigger, true); closeWithCancellation(); };
  }, [closeWithCancellation]);

  const dialogOpen = Boolean(pending);
  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") { event.preventDefault(); closeWithCancellation(); return; }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const trigger = triggerRef.current;
      // The caller releases its disabled fieldset after consuming the cancelled
      // response. Restore focus once that asynchronous cleanup has committed.
      const observer = new MutationObserver(restore);
      const timeout = window.setTimeout(() => observer.disconnect(), 1500);
      function restore() {
        if (pendingRef.current || !trigger?.isConnected) { observer.disconnect(); clearTimeout(timeout); return; }
        if (trigger.matches(":disabled")) return;
        trigger.focus(); observer.disconnect(); clearTimeout(timeout);
      }
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["disabled"] });
      requestAnimationFrame(restore);
    };
  }, [dialogOpen, closeWithCancellation]);
  useEffect(() => {
    if (dialogOpen) (dialogRef.current?.querySelector<HTMLInputElement>("input") ?? dialogRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [dialogOpen, mode, Boolean(enrollment)]);

  const loadMfa = useCallback(async () => {
    const version = generation.current;
    setMode("loading");
    setMessage("Checking your security settings.");
    try {
    const response = await fetch("/api/auth/mfa", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      factors?: MfaFactor[];
      message?: string;
    };
    if (version !== generation.current) return;
    if (response.status === 401) {
      setMode("expired");
      setMessage("Your session has expired.");
      return;
    }
    if (!response.ok || !body.ok) {
      setMode("error");
      setMessage(body.message || "Your staff session could not be verified.");
      return;
    }
    const nextFactors = body.factors ?? [];
    setFactors(nextFactors);
    setMode(nextFactors.some((factor) => factor.status === "verified") ? "challenge" : "enroll");
    setMessage("");
    } catch {
      if (version !== generation.current) return;
      setMode("error");
      setMessage("Security settings could not be loaded. Check the connection and try again.");
    }
  }, []);

  const sensitiveFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const version = generation.current;
    const run = () => fetch(input, init);
    const response = await run();
    if (response.status !== 403 || (await responseCode(response)) !== "mfa_required") {
      return response;
    }

    if (version !== generation.current || pendingRef.current || actionBusy.current) return cancelledResponse();
    return new Promise<Response>((resolve) => {
      const request = { run, resolve };
      pendingRef.current = request;
      setPending(request);
      void loadMfa();
    });
  }, [loadMfa]);

  async function startEnrollment() {
    if (actionBusy.current || !pendingRef.current) return;
    const version = generation.current;
    actionBusy.current = true;
    setBusy(true);
    setMessage("Starting authenticator setup.");
    try {
    const response = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: await buildApiHeaders(role, { "Content-Type": "application/json" }),
      body: JSON.stringify({ friendlyName: "DriveMate staff authenticator" }),
    });
    const body = (await response.json().catch(() => ({}))) as
      | ({ ok: true } & MfaEnrollment)
      | { ok?: false; message?: string };
    if (version !== generation.current) return;
    if (response.status === 401) {
      setMode("expired");
      setMessage("Your session has expired.");
      return;
    }
    if (!response.ok || !body.ok || typeof body.factorId !== "string" || typeof body.qrCode !== "string" || typeof body.secret !== "string") {
      setMessage("message" in body ? body.message || "Authenticator setup could not be started." : "Authenticator setup could not be started.");
      return;
    }
    setEnrollment(body);
    setMessage("Scan the QR code, then enter the current six-digit code.");
    } catch {
      if (version === generation.current) setMessage("Authenticator setup could not be confirmed. Check the connection and try again.");
    } finally {
      if (version === generation.current) { actionBusy.current = false; setBusy(false); }
    }
  }

  async function verifyAndContinue() {
    if (actionBusy.current || !pendingRef.current) return;
    const version = generation.current;
    const factorId = enrollment?.factorId ?? factors.find((factor) => factor.status === "verified")?.id;
    if (!factorId || !/^\d{6}$/.test(code)) {
      setMessage("Enter the current six-digit authenticator code.");
      return;
    }
    setBusy(true);
    actionBusy.current = true;
    try {
    const response = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: await buildApiHeaders(role, { "Content-Type": "application/json" }),
      body: JSON.stringify({ factorId, code }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (version !== generation.current) return;
    if (response.status === 401) {
      setBusy(false);
      setMode("expired");
      setMessage("Your session has expired.");
      return;
    }
    if (!response.ok || !body.ok) {
      setBusy(false);
      setMessage(body.message || "That code was not accepted. Check the current code and try again.");
      return;
    }

    const currentPending = pendingRef.current;
    if (!currentPending) {
      setBusy(false);
      return;
    }
    // Consume the continuation before dispatch. Cancellation/pagehide before
    // verification finishes must never trigger the pending business write.
    pendingRef.current = null;
    try { currentPending.resolve(await currentPending.run()); }
    catch { currentPending.resolve(Response.json({ ok: false, code: "request_unconfirmed", message: "Result could not be confirmed. Check saved records before retrying." }, { status: 503 })); }
    if (version !== generation.current) return;
    setPending(null);
    setEnrollment(null);
    setCode("");
    setBusy(false);
    } catch {
      if (version === generation.current) setMessage("Verification could not be completed. Check the connection and try again.");
    } finally {
      if (version === generation.current) { actionBusy.current = false; setBusy(false); }
    }
  }

  const dialogTitle = mode === "error" ? "Verification unavailable" : mode === "expired"
    ? "Your session has expired"
    : mode === "enroll"
      ? "Set up authenticator"
      : "Verify this sensitive action";
  const nextWorkspace = typeof window === "undefined" ? null : safeWorkspaceNext(window.location.pathname + window.location.search + window.location.hash);
  const reauthenticateHref = nextWorkspace ? `/staff/login?next=${encodeURIComponent(nextWorkspace)}` : "/staff/login";

  return (
    <SensitiveFetchContext.Provider value={sensitiveFetch}>
      {children}
      {pending ? (
        <div className="step-up-overlay">
          <section
            ref={dialogRef}
            aria-labelledby="step-up-title"
            aria-modal="true"
            className="step-up-dialog"
            role="dialog"
          >
            <div className="step-up-dialog-header">
              <span className="step-up-icon"><ShieldCheck size={24} weight="duotone" /></span>
              <button aria-label="Cancel verification" className="icon-button" onClick={closeWithCancellation} type="button">
                <X size={20} />
              </button>
            </div>
            <h2 id="step-up-title">{dialogTitle}</h2>
            {mode === "loading" ? <p>Checking your security settings.</p> : null}
            {mode === "error" ? <><p role="alert">{message}</p><button className="button button-secondary" type="button" onClick={() => void loadMfa()}>Retry security check</button></> : null}
            {mode === "expired" ? (
              <>
                <p>Sign in again before continuing. The pending operation has not been submitted.</p>
                <div className="step-up-actions">
                  <button className="button button-secondary" onClick={closeWithCancellation} type="button">Cancel</button>
                  <a className="button button-primary" href={reauthenticateHref}>Sign in again</a>
                </div>
              </>
            ) : null}
            {mode === "enroll" ? (
              <>
                <p>This is required only before your first sensitive operation.</p>
                {!enrollment ? (
                  <button className="button button-secondary" disabled={busy} onClick={() => void startEnrollment()} type="button">
                    Set up authenticator
                  </button>
                ) : (
                  <div className="step-up-enrollment">
                    <img
                      alt="Authenticator setup QR code"
                      src={enrollment.qrCode.startsWith("data:") ? enrollment.qrCode : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode)}`}
                    />
                    <p>Manual key: <code>{enrollment.secret}</code></p>
                  </div>
                )}
              </>
            ) : null}
            {mode === "challenge" || (mode === "enroll" && enrollment) ? (
              <label className="step-up-code-field">
                Six-digit code
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </label>
            ) : null}
            {mode !== "expired" && mode !== "loading" && mode !== "error" ? (
              <p aria-live="polite" className="step-up-message">{message}</p>
            ) : null}
            {mode === "challenge" || (mode === "enroll" && enrollment) ? (
              <div className="step-up-actions">
                <button className="button button-secondary" onClick={closeWithCancellation} type="button">Cancel</button>
                <button className="button button-primary" disabled={busy} onClick={() => void verifyAndContinue()} type="button">
                  Verify and continue
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </SensitiveFetchContext.Provider>
  );
}
