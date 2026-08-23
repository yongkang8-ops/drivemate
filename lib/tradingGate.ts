export const TRADING_DISABLED_CODE = "TRADING_DISABLED";
export const PRETRADE_MESSAGE =
  "Live ordering is not available while DriveMate is in pre-trade mode.";

export type TradingMode = "pretrade" | "trading" | "invalid";

export function getTradingGate() {
  const tradingConfigured =
    process.env.DRIVEMATE_TRADING_ENABLED === "true";
  const gstRegistered = process.env.DRIVEMATE_GST_REGISTERED === "true";
  const enabled = tradingConfigured && gstRegistered;
  const mode: TradingMode = enabled
    ? "trading"
    : tradingConfigured
      ? "invalid"
      : "pretrade";

  return {
    enabled,
    gstRegistered,
    tradingConfigured,
    mode,
    message: enabled
      ? "Live trading is enabled."
      : mode === "invalid"
        ? "Trading cannot be enabled until GST registration is confirmed."
        : PRETRADE_MESSAGE,
  };
}

export function tradingDisabledPayload() {
  return {
    ok: false as const,
    code: TRADING_DISABLED_CODE,
    message: getTradingGate().message,
  };
}
