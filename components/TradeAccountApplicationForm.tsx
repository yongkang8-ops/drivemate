"use client";

import { useState } from "react";

type ApplicationResponse =
  | { ok: true; application: { id: string; accountName: string; status: string } }
  | { ok: false; message: string }
  | { error: unknown };

export function TradeAccountApplicationForm() {
  const [accountName, setAccountName] = useState("");
  const [abn, setAbn] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("New workshops can apply for trade access.");

  async function submitApplication() {
    const response = await fetch("/api/trade-account-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName,
        abn,
        contactName,
        contactEmail,
        contactPhone,
        postcode,
        notes,
      }),
    });

    const body = (await response.json()) as ApplicationResponse;
    if (!response.ok || !("ok" in body) || !body.ok) {
      setMessage("Account application could not be submitted.");
      return;
    }

    setMessage(`Application ${body.application.id} received for ${body.application.accountName}.`);
    setAccountName("");
    setAbn("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setPostcode("");
    setNotes("");
  }

  return (
    <section className="panel" id="open-account" style={{ marginTop: 18 }}>
      <p className="eyebrow">Open trade account</p>
      <h2>Apply for workshop ordering access</h2>
      <div className="form-grid">
        <label>
          Workshop / business name
          <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
        </label>
        <label>
          ABN
          <input value={abn} onChange={(event) => setAbn(event.target.value)} />
        </label>
        <label>
          Contact name
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
        </label>
        <label>
          Contact email
          <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
        </label>
        <label>
          Contact phone
          <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
        </label>
        <label>
          Postcode
          <input value={postcode} onChange={(event) => setPostcode(event.target.value)} />
        </label>
      </div>
      <label style={{ marginTop: 12 }}>
        Notes
        <input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <p>
        <button className="primary-button" type="button" onClick={submitApplication}>
          Submit application
        </button>{" "}
        <span className="badge" role="status">
          {message}
        </span>
      </p>
    </section>
  );
}
