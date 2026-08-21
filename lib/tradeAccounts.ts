export type TradeAccountApplicationInput = {
  accountName: string;
  abn?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  postcode?: string;
  notes?: string;
  privacyConsent: boolean;
  tradeTermsConsent: boolean;
  consentVersion: string;
  turnstileToken?: string;
};

export type TradeAccountApplication = Omit<TradeAccountApplicationInput, "privacyConsent" | "tradeTermsConsent" | "consentVersion" | "turnstileToken"> & {
  id: string;
  status: "pending" | "approved" | "paused" | "closed";
  createdAt: string;
  privacyConsent?: boolean;
  tradeTermsConsent?: boolean;
  consentVersion?: string;
};

export type TradeAccountStatus = TradeAccountApplication["status"];

export type TradeAccountApplicationResult =
  | { ok: true; application: TradeAccountApplication }
  | { ok: false; message: string };

export type ApproveTradeAccountApplicationResult =
  | { ok: true; application: TradeAccountApplication }
  | { ok: false; message: string };

export type ProvisionTradeAccountLoginResult =
  | {
      ok: true;
      application: TradeAccountApplication;
      login: {
        email: string;
        userId: string;
        created: boolean;
        setupEmailSent: boolean;
      };
    }
  | { ok: false; message: string };

export type UpdateTradeAccountStatusResult =
  | { ok: true; application: TradeAccountApplication }
  | { ok: false; message: string };
