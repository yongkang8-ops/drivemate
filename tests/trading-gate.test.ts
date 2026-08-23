import { afterEach, describe, expect, it, vi } from "vitest";
import { getTradingGate } from "../lib/tradingGate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production trading gate", () => {
  it("keeps trading disabled in pre-trade mode", () => {
    vi.stubEnv("DRIVEMATE_TRADING_ENABLED", "false");
    vi.stubEnv("DRIVEMATE_GST_REGISTERED", "false");

    expect(getTradingGate()).toEqual({
      enabled: false,
      gstRegistered: false,
      tradingConfigured: false,
      mode: "pretrade",
      message: "Live ordering is not available while DriveMate is in pre-trade mode.",
    });
  });

  it("does not enable trading when GST is unavailable", () => {
    vi.stubEnv("DRIVEMATE_TRADING_ENABLED", "true");
    vi.stubEnv("DRIVEMATE_GST_REGISTERED", "false");

    expect(getTradingGate()).toMatchObject({
      enabled: false,
      mode: "invalid",
      tradingConfigured: true,
      gstRegistered: false,
    });
  });

  it("enables trading only when both production flags are true", () => {
    vi.stubEnv("DRIVEMATE_TRADING_ENABLED", "true");
    vi.stubEnv("DRIVEMATE_GST_REGISTERED", "true");

    expect(getTradingGate()).toMatchObject({
      enabled: true,
      mode: "trading",
    });
  });
});
