import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as submitOrder } from "../app/api/orders/route";
import { POST as dispatchOrder } from "../app/api/orders/[orderId]/dispatch/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pre-trade commercial mutation boundary", () => {
  it("blocks order submission before request processing", async () => {
    vi.stubEnv("DRIVEMATE_TRADING_ENABLED", "false");
    vi.stubEnv("DRIVEMATE_GST_REGISTERED", "false");

    const response = await submitOrder(
      new Request("https://drivemateparts.com.au/api/orders", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "TRADING_DISABLED",
      message: "Live ordering is not available while DriveMate is in pre-trade mode.",
    });
  });

  it("blocks dispatch before invoice-producing work", async () => {
    vi.stubEnv("DRIVEMATE_TRADING_ENABLED", "false");
    vi.stubEnv("DRIVEMATE_GST_REGISTERED", "false");

    const response = await dispatchOrder(
      new Request("https://drivemateparts.com.au/api/orders/order-1/dispatch", {
        method: "POST",
      }),
      { params: Promise.resolve({ orderId: "order-1" }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "TRADING_DISABLED",
    });
  });
});
