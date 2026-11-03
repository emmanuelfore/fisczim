/**
 * Read-only v1 device endpoints: /api/v1/fiscal/{status,config,server-certificate}
 *
 * These must route by the company's fiscal provider, never call a real gateway,
 * and never write local state.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

const constructed = { zimra: [] as any[], lekuka: [] as any[] };
const calls = {
  zimraStatus: vi.fn(),
  zimraConfig: vi.fn(),
  zimraServerCert: vi.fn(),
  lekukaStatus: vi.fn(),
  lekukaConfig: vi.fn(),
  lekukaServerCert: vi.fn(),
};

vi.mock("../../../zimra.js", () => {
  class ZimraDevice {
    config: any;
    constructor(config: any) {
      constructed.zimra.push(config);
      this.config = config;
    }
    getStatus = () => calls.zimraStatus();
    getConfig = () => calls.zimraConfig();
    getServerCertificate = (thumbprint?: string) => calls.zimraServerCert(thumbprint);
  }
  class ZimraApiError extends Error {
    statusCode: number;
    details?: unknown;
    constructor(statusCode: number, message: string, details?: unknown) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
    }
  }
  return { ZimraDevice, ZimraApiError, getZimraBaseUrl: () => "https://gateway.test" };
});

vi.mock("../../../lekuka.js", () => {
  class LekukaDevice {
    config: any;
    constructor(config: any) {
      constructed.lekuka.push(config);
      this.config = config;
    }
    getStatus = () => calls.lekukaStatus();
    getConfig = () => calls.lekukaConfig();
    getServerCertificate = () => calls.lekukaServerCert();
  }
  class LekukaApiError extends Error {
    statusCode: number;
    details?: unknown;
    constructor(statusCode: number, message: string, details?: unknown) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
    }
  }
  return { LekukaDevice, LekukaApiError, generateLekukaKeypair: () => ({ privateKey: "k", certificateRequest: "csr" }) };
});

vi.mock("../../../storage.js", () => ({
  storage: { updateCompany: vi.fn(), calculateFiscalCounters: vi.fn(), getInvoicesByFiscalDay: vi.fn() },
}));
vi.mock("../../../lib/fiscalization.js", () => ({ getZimraLogger: () => ({ log: vi.fn() }) }));
vi.mock("../../../lib/zimra-preflight.js", () => ({
  assertFiscalDayClosePreflight: vi.fn(),
  ZimraPreflightError: class extends Error {},
}));

import fiscalRouter from "../fiscal.js";
import { ZimraApiError } from "../../../zimra.js";

const zimraCompany = {
  id: 1,
  fiscalProvider: "ZIMRA",
  country: "Zimbabwe",
  fdmsDeviceId: "1234567890",
  fdmsDeviceSerialNo: "SW12345",
  zimraPrivateKey: "pem-key",
  zimraCertificate: "pem-cert",
  zimraEnvironment: "test",
};

const lekukaCompany = {
  ...zimraCompany,
  id: 2,
  fiscalProvider: "LEKUKA",
  country: "Lesotho",
  fdmsDeviceId: "812",
  lekukaGatewayUrl: "https://rsl.test",
};

async function dispatch(
  company: any,
  path: string,
  query: Record<string, string> = {}
): Promise<{ statusCode: number; body: any }> {
  let resolveSettled!: () => void;
  const settled = new Promise<void>((r) => { resolveSettled = r; });

  const req: any = { method: "GET", url: path, path, query, params: {}, body: {}, company };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: any) {
      this.body = b;
      resolveSettled();
      return this;
    },
  };

  fiscalRouter(req, res, () => resolveSettled());
  await settled;

  return { statusCode: res.statusCode, body: res.body };
}

beforeEach(() => {
  vi.clearAllMocks();
  constructed.zimra.length = 0;
  constructed.lekuka.length = 0;
});

describe("GET /api/v1/fiscal/status", () => {
  test("ZIMRA company reads from the FDMS gateway and is labelled ZIMRA", async () => {
    calls.zimraStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayOpened", lastFiscalDayNo: 12 });

    const { statusCode, body } = await dispatch(zimraCompany, "/status");

    expect(statusCode).toBe(200);
    expect(body).toEqual({ provider: "ZIMRA", data: { fiscalDayStatus: "FiscalDayOpened", lastFiscalDayNo: 12 } });
    expect(calls.zimraStatus).toHaveBeenCalledTimes(1);
    expect(calls.lekukaStatus).not.toHaveBeenCalled();
  });

  test("LEKUKA company reads from the RSL gateway and is labelled LEKUKA", async () => {
    calls.lekukaStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayClosed" });

    const { statusCode, body } = await dispatch(lekukaCompany, "/status");

    expect(statusCode).toBe(200);
    expect(body.provider).toBe("LEKUKA");
    expect(calls.lekukaStatus).toHaveBeenCalledTimes(1);
    expect(calls.zimraStatus).not.toHaveBeenCalled();
    expect(constructed.lekuka[0].baseUrl).toBe("https://rsl.test");
  });

  test("is read-only — no local counter writes", async () => {
    calls.zimraStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayOpened" });
    const { storage } = await import("../../../storage.js");

    await dispatch(zimraCompany, "/status");

    expect((storage as any).updateCompany).not.toHaveBeenCalled();
  });

  test("unregistered company gets 400 and no gateway call", async () => {
    const { statusCode, body } = await dispatch({ ...zimraCompany, fdmsDeviceId: null }, "/status");

    expect(statusCode).toBe(400);
    expect(body.error).toBe("NOT_REGISTERED");
    expect(constructed.zimra).toHaveLength(0);
  });

  test("registered device without credentials is a 400, not a transport failure", async () => {
    const { statusCode, body } = await dispatch(
      { ...zimraCompany, zimraPrivateKey: null, zimraCertificate: "" },
      "/status"
    );

    expect(statusCode).toBe(400);
    expect(body.missing).toEqual(["private key", "device certificate"]);
    expect(constructed.zimra).toHaveLength(0);
  });

  test("server-certificate is public — missing device credentials still answer", async () => {
    calls.zimraServerCert.mockResolvedValue({ certificates: ["…"] });

    const { statusCode, body } = await dispatch(
      { ...zimraCompany, zimraPrivateKey: null, zimraCertificate: "" },
      "/server-certificate"
    );

    expect(statusCode).toBe(200);
    expect(body.provider).toBe("ZIMRA");
  });

  test("provider rejection keeps the gateway status code", async () => {
    calls.zimraStatus.mockRejectedValue(new ZimraApiError(403, "Device certificate expired."));

    const { statusCode, body } = await dispatch(zimraCompany, "/status");

    expect(statusCode).toBe(403);
    expect(body.error).toBe("FISCAL_PROVIDER_ERROR");
    expect(body.message).toBe("Device certificate expired.");
  });
});

describe("GET /api/v1/fiscal/config", () => {
  test("passes certificateValidTill through", async () => {
    calls.zimraConfig.mockResolvedValue({
      taxPayerName: "ABC Trading",
      applicableTaxes: [{ taxID: "3", rate: 15 }],
      certificateValidTill: "2026-12-31",
    });

    const { statusCode, body } = await dispatch(zimraCompany, "/config");

    expect(statusCode).toBe(200);
    expect(body.data.certificateValidTill).toBe("2026-12-31");
    expect(body.provider).toBe("ZIMRA");
  });

  test("LEKUKA company uses its own gateway", async () => {
    calls.lekukaConfig.mockResolvedValue({ applicableTaxes: [] });

    const { body } = await dispatch(lekukaCompany, "/config");

    expect(body.provider).toBe("LEKUKA");
    expect(calls.zimraConfig).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/fiscal/server-certificate", () => {
  test("forwards the thumbprint to the ZIMRA gateway", async () => {
    calls.zimraServerCert.mockResolvedValue({ certificates: ["…"] });

    const { statusCode } = await dispatch(zimraCompany, "/server-certificate", { thumbprint: "AB12CD" });

    expect(statusCode).toBe(200);
    expect(calls.zimraServerCert).toHaveBeenCalledWith("AB12CD");
  });

  test("LEKUKA server certificate needs no device key pair", async () => {
    calls.lekukaServerCert.mockResolvedValue({ certificate: "…" });

    const { statusCode, body } = await dispatch({ ...lekukaCompany, zimraPrivateKey: null }, "/server-certificate");

    expect(statusCode).toBe(200);
    expect(body.provider).toBe("LEKUKA");
  });
});
