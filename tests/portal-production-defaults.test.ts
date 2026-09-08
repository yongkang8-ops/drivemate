import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TradePortalWorkspace } from "../components/TradePortalWorkspace";
import { AdminDashboard } from "../components/AdminDashboard";
import { MfaStepUpProvider } from "../components/MfaStepUpProvider";

afterEach(() => vi.unstubAllEnvs());
it("does not prefill a customer's live vehicle or purchase reference with demonstration data", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SHOW_INTERNAL_NAV", "false");
  const html = renderToStaticMarkup(createElement(TradePortalWorkspace, { tradingEnabled: false }));
  expect(html).not.toContain('value="LGWFFEA6XRA000245"');
  expect(html).not.toContain('value="QLD 24ALPHA"');
  expect(html).not.toContain('value="JOB-1842"');
});
it("does not ship sample import rows in a live administrator's input", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SHOW_INTERNAL_NAV", "false");
  const html = renderToStaticMarkup(createElement(MfaStepUpProvider, { role: "admin", children: createElement(AdminDashboard) }));
  expect(html).not.toContain("DM-GWM-NEW-099,GWM,Genuine Service Part");
  expect(html).not.toContain("DM-GWM-NEW-099,GWM,Cannon Alpha,2024");
});
