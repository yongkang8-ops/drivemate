"use client";

import { ShieldCheck, X } from "@phosphor-icons/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import { buildApiHeaders, type AuthenticatedRole } from "../lib/clientAuth";

type MfaFactor = { id: string; friendlyName?: string; status: string };
type MfaEnrollment = { factorId: string; qrCode: string; secret: string };
type PendingRequest = {
  run: () => Promise<Response>;
  resolve: (response: Response) => void;
};
type DialogMode = "loading" | "challenge" | "enroll" | "expired";

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

  const closeWithCancellation = useCallback(() => {
    pending?.resolve(cancelledResponse());
    setPending(null);
    setEnrollment(null);
    setCode("");
    setBusy(false);
  }, [pending]);

  const loadMfa = useCallback(async () => {
    setMode("loading");
    setMessage("Checking your security settings.");
    const response = await fetch("/api/auth/mfa", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      factors?: MfaFactor[];
      message?: string;
    };
    if (response.status === 401) {
      setMode("expired");
      setMessage("Your session has expired.");
      return;
    }
    if (!response.ok || !body.ok) {
      setMode("expired");
      setMessage(body.message || "Your staff session could not be verified.");
      return;
    }
    const nextFactors = body.factors ?? [];
    setFactors(nextFactors);
    setMode(nextFactors.some((factor) => factor.status === "verified") ? "challenge" : "enroll");
    setMessage("");
  }, []);

  const sensitiveFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const run = () => fetch(input, init);
    const response = await run();
    if (response.status !== 403 || (await responseCode(response)) !== "mfa_required") {
      return response;
    }

    return new Promise<Response>((resolve) => {
      setPending({ run, resolve });
      void loadMfa();
    });
  }, [loadMfa]);

  async function startEnrollment() {
    setBusy(true);
    setMessage("Starting authenticator setup.");
    const response = await fetch("/api/auth/mfa", {
      method: "POST",
      headers: await buildApiHeaders(role, { "Content-Type": "application/json" }),
      body: JSON.stringify({ friendlyName: "DriveMate staff authenticator" }),
    });
    const body = (await response.json().catch(() => ({}))) as
      | ({ ok: true } & MfaEnrollment)
      | { ok?: false; message?: string };
    setBusy(false);
    if (response.status === 401) {
      setMode("expired");
      setMessage("Your session has expired.");
      return;
    }
    if (!response.ok || !body.ok) {
      setMessage("message" in body ? body.message || "Authenticator setup could not be started." : "Authenticator setup could not be started.");
      return;
    }
    setEnrollment(body);
    setMessage("Scan the QR code, then enter the current six-digit code.");
  }

  async function verifyAndContinue() {
    const factorId = enrollment?.factorId ?? factors.find((factor) => factor.status === "verified")?.id;
    if (!factorId || !/^\d{6}$/.test(code)) {
      setMessage("Enter the current six-digit authenticator code.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: await buildApiHeaders(role, { "Content-Type": "application/json" }),
      body: JSON.stringify({ factorId, code }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
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

    const currentPending = pending;
    if (!currentPending) {
      setBusy(false);
      return;
    }
    const retried = await currentPending.run();
    currentPending.resolve(retried);
    setPending(null);
    setEnrollment(null);
    setCode("");
    setBusy(false);
  }

  const dialogTitle = mode === "expired"
    ? "Your session has expired"
    : mode === "enroll"
      ? "Set up authenticator"
      : "Verify this sensitive action";

  return (
    <SensitiveFetchContext.Provider value={sensitiveFetch}>
      {children}
      {pending ? (
        <div className="step-up-overlay">
          <section
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
            {mode === "expired" ? (
              <>
                <p>Sign in again before continuing. The pending operation has not been submitted.</p>
                <div className="step-up-actions">
                  <button className="button button-secondary" onClick={closeWithCancellation} type="button">Cancel</button>
                  <a className="button button-primary" href={role === "partner" ? "/partner" : "/admin"}>Sign in again</a>
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
            {mode !== "expired" && mode !== "loading" ? (
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
