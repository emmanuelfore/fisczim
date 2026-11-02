/**
 * v1 day control and certificate renewal must follow the company's provider.
 * A Lesotho company calling POST /api/v1/fiscal/open-day has to reach the RSL
 * gateway, not the Zimbabwe one — and no test here may touch a real gateway.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

const constructed = { zimra: [] as any[], lekuka: [] as any[] };
const calls = {
  zimraPing: vi.fn(),
  zimraOpenDay: vi.fn(),
  zimraStatus: vi.fn(),
  zimraIssueCertificate: vi.fn(),
  lekukaPing: vi.fn(),
  lekukaStatus: vi.fn(),
  lekukaOpenDay: vi.fn(),
  lekukaCloseDay: vi.fn(),
  lekukaIssueCertificate: vi.fn(),
  lekukaConfirmCertificate: vi.fn(),
};
const keypair = vi.fn();

vi.mock("../../../zimra.js", () => {
  class ZimraDevice {
    config: any;
    constructor(config: any) {
      constructed.zimra.push(config);
      this.config = config;
    }
    ping = () => calls.zimraPing();
    getStatus = () => calls.zimraStatus();
    openDay = (n?: number) => calls.zimraOpenDay(n);
    issueCertificate = () => calls.zimraIssueCertificate();
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
  return { ZimraDevice, ZimraApiError, getZimraBaseUrl: () => "https://fdms.test" };
});

vi.mock("../../../lekuka.js", () => {
  class LekukaDevice {
    config: any;
    constructor(config: any) {
      constructed.lekuka.push(config);
      this.config = config;
    }
    ping = () => calls.lekukaPing();
    getStatus = () => calls.lekukaStatus();
    openDay = () => calls.lekukaOpenDay();
    closeDay = (args: any) => calls.lekukaCloseDay(args);
    issueCertificate = (csr: string) => calls.lekukaIssueCertificate(csr);
    confirmCertificate = (thumbprint?: string) => calls.lekukaConfirmCertificate(thumbprint);
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
  return { LekukaDevice, LekukaApiError, generateLekukaKeypair: (...a: any[]) => keypair(...a) };
});

const updateCompany = vi.fn();
const calculateFiscalCounters = vi.fn();

vi.mock("../../../storage.js", () => ({
  storage: {
    updateCompany: (...a: any[]) => updateCompany(...a),
    calculateFiscalCounters: (...a: any[]) => calculateFiscalCounters(...a),
    getInvoicesByFiscalDay: vi.fn(),
  },
}));
vi.mock("../../../lib/fiscalization.js", () => ({ getZimraLogger: () => ({ log: vi.fn() }) }));
vi.mock("../../../lib/zimra-preflight.js", () => ({
  assertFiscalDayClosePreflight: vi.fn(),
  ZimraPreflightError: class extends Error {},
}));

import fiscalRouter from "../fiscal.js";

const zimraCompany = {
  id: 1,
  fiscalProvider: "ZIMRA",
  country: "Zimbabwe",
  fdmsDeviceId: "1234567890",
  fdmsDeviceSerialNo: "SW12345",
  zimraPrivateKey: "pem-key",
  zimraCertificate: "pem-cert",
  zimraEnvironment: "test",
  currentFiscalDayNo: 12,
  fiscalDayOpen: true,
  dailyReceiptCount: 40,
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
  body: Record<string, any> = {}
): Promise<{ statusCode: number; body: any }> {
  let resolveSettled!: () => void;
  const settled = new Promise<void>((r) => { resolveSettled = r; });

  const req: any = { method: "POST", url: path, path, query: {}, params: {}, body, company };
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
  keypair.mockReturnValue({ privateKey: "new-private-key", certificateRequest: "new-csr" });
  calculateFiscalCounters.mockResolvedValue([{ taxType: "01", amount: 100 }]);
});

describe("POST /api/v1/fiscal/ping", () => {
  test("a LEKUKA company pings the RSL gateway", async () => {
    calls.lekukaPing.mockResolvedValue({ operationID: "1" });

    const { statusCode, body } = await dispatch(lekukaCompany, "/ping");

    expect(statusCode).toBe(200);
    expect(body.provider).toBe("LEKUKA");
    expect(calls.lekukaPing).toHaveBeenCalledTimes(1);
    expect(constructed.zimra).toHaveLength(0);
  });

  test("an unregistered company is a 400, not a 500", async () => {
    const { statusCode, body } = await dispatch({ ...zimraCompany, fdmsDeviceId: null }, "/ping");

    expect(statusCode).toBe(400);
    expect(body.error).toBe("NOT_REGISTERED");
    expect(calls.zimraPing).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/fiscal/open-day", () => {
  test("a LEKUKA company opens the day on RSL and takes its day number", async () => {
    calls.lekukaStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayClosed", lastFiscalDayNo: 4 });
    calls.lekukaOpenDay.mockResolvedValue({ fiscalDayNo: 5 });

    const { statusCode, body } = await dispatch(lekukaCompany, "/open-day");

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ success: true, provider: "LEKUKA", fiscalDayNo: 5 });
    expect(calls.lekukaOpenDay).toHaveBeenCalledTimes(1);
    expect(constructed.zimra).toHaveLength(0);
    expect(updateCompany).toHaveBeenCalledWith(2, expect.objectContaining({ fiscalDayOpen: true, currentFiscalDayNo: 5 }));
  });

  test("an already-open RSL day is reported, not opened twice", async () => {
    calls.lekukaStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayOpened", lastFiscalDayNo: 7 });

    const { body } = await dispatch(lekukaCompany, "/open-day");

    expect(body).toMatchObject({ success: true, fiscalDayNo: 7, message: "Fiscal day is already open" });
    expect(calls.lekukaOpenDay).not.toHaveBeenCalled();
  });

  test("a ZIMRA company still uses the FDMS gateway", async () => {
    calls.zimraStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayClosed", lastFiscalDayNo: 11 });
    calls.zimraOpenDay.mockResolvedValue({ fiscalDayNo: 12 });

    const { body } = await dispatch(zimraCompany, "/open-day");

    expect(body).toMatchObject({ success: true, provider: "ZIMRA", fiscalDayNo: 12 });
    expect(calls.zimraOpenDay).toHaveBeenCalledWith(12);
    expect(constructed.lekuka).toHaveLength(0);
  });

  test("provider rejection keeps its status code", async () => {
    const { LekukaApiError } = await import("../../../lekuka.js");
    calls.lekukaStatus.mockResolvedValue({ fiscalDayStatus: "FiscalDayClosed" });
    calls.lekukaOpenDay.mockRejectedValue(new LekukaApiError(400, "Previous fiscal day is not closed."));

    const { statusCode, body } = await dispatch(lekukaCompany, "/open-day");

    expect(statusCode).toBe(400);
    expect(body.error).toBe("FISCAL_PROVIDER_ERROR");
    expect(updateCompany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/fiscal/close-day", () => {
  test("a LEKUKA company closes on RSL with counters from stored receipts", async () => {
    calls.lekukaCloseDay.mockResolvedValue({ fiscalDayNo: 12 });

    const { statusCode, body } = await dispatch(lekukaCompany, "/close-day");

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({ success: true, provider: "LEKUKA", fiscalDayNo: 12 });
    expect(calls.lekukaCloseDay).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalDayNo: 12, counters: [{ taxType: "01", amount: 100 }] })
    );
    expect(updateCompany).toHaveBeenCalledWith(2, expect.objectContaining({ fiscalDayOpen: false }));
  });

  test("a rejected RSL closure leaves the day open for retry", async () => {
    const { LekukaApiError } = await import("../../../lekuka.js");
    calls.lekukaCloseDay.mockRejectedValue(new LekukaApiError(400, "Receipts remain unclosed."));

    const { statusCode } = await dispatch(lekukaCompany, "/close-day");

    expect(statusCode).toBe(400);
    expect(updateCompany).toHaveBeenCalledWith(2, expect.objectContaining({ fiscalDayOpen: true, lastFiscalDayStatus: "FiscalDayCloseFailed" }));
  });

  test("no open day is a 400 and never marks the day as close-failed", async () => {
    const { statusCode, body } = await dispatch({ ...lekukaCompany, currentFiscalDayNo: 0 }, "/close-day");

    expect(statusCode).toBe(400);
    expect(body.message).toBe("No fiscal day has been opened yet");
    expect(updateCompany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/fiscal/certificate/issue", () => {
  test("a LEKUKA company renews on RSL and stores the new pair without returning it", async () => {
    calls.lekukaIssueCertificate.mockResolvedValue({ certificate: "rsl-new-cert" });

    const { statusCode, body } = await dispatch(lekukaCompany, "/certificate/issue");

    expect(statusCode).toBe(200);
    expect(body).toMatchObject({
      provider: "LEKUKA",
      certificate: "rsl-new-cert",
      privateKeyStored: true,
      confirmationRequired: true,
    });
    expect(body.privateKey).toBeUndefined();
    expect(calls.lekukaIssueCertificate).toHaveBeenCalledWith("new-csr");
    expect(updateCompany).toHaveBeenCalledWith(2, {
      zimraPrivateKey: "new-private-key",
      zimraCertificate: "rsl-new-cert",
    });
    expect(constructed.zimra).toHaveLength(0);
  });

  test("a supplied CSR keeps the private key client-side", async () => {
    calls.lekukaIssueCertificate.mockResolvedValue({ certificate: "client-cert" });

    const { body } = await dispatch(lekukaCompany, "/certificate/issue", { certificateRequest: "client-csr" });

    expect(body.privateKeyStored).toBe(false);
    expect(calls.lekukaIssueCertificate).toHaveBeenCalledWith("client-csr");
    expect(updateCompany).toHaveBeenCalledWith(2, { zimraCertificate: "client-cert" });
  });

  test("a ZIMRA company renews on FDMS, and a caller CSR is refused", async () => {
    calls.zimraIssueCertificate.mockResolvedValue({ certificate: "fdms-new-cert", privateKey: "fdms-new-key" });

    const { body } = await dispatch(zimraCompany, "/certificate/issue");
    expect(body).toMatchObject({ provider: "ZIMRA", certificate: "fdms-new-cert", confirmationRequired: false });
    expect(updateCompany).toHaveBeenCalledWith(1, {
      zimraPrivateKey: "fdms-new-key",
      zimraCertificate: "fdms-new-cert",
    });

    const refused = await dispatch(zimraCompany, "/certificate/issue", { certificateRequest: "csr" });
    expect(refused.statusCode).toBe(400);
    expect(refused.body.error).toBe("NOT_SUPPORTED");
  });

  test("renewal needs a device: the CSR is built from the real serial so the CN matches", async () => {
    calls.zimraIssueCertificate.mockResolvedValue({ certificate: "c", privateKey: "k" });

    await dispatch(zimraCompany, "/certificate/issue");

    expect(constructed.zimra[0].deviceSerialNo).toBe("SW12345");
  });
});

describe("POST /api/v1/fiscal/certificate/confirm", () => {  test("a ZIMRA company is told there is nothing to confirm", async () => {
    const { statusCode, body } = await dispatch(zimraCompany, "/certificate/confirm");

    expect(statusCode).toBe(400);
    expect(body.error).toBe("NOT_SUPPORTED");
    expect(calls.lekukaConfirmCertificate).not.toHaveBeenCalled();
  });

  test("a LEKUKA company confirms, and an unparseable certificate falls back to the pending one", async () => {
    calls.lekukaConfirmCertificate.mockResolvedValue({ status: "Ok" });

    const stored = await dispatch(lekukaCompany, "/certificate/confirm");
    expect(stored.statusCode).toBe(200);
    expect(stored.body.provider).toBe("LEKUKA");
    // "pem-cert" is not a PEM certificate, so no thumbprint can be derived.
    expect(calls.lekukaConfirmCertificate).toHaveBeenCalledWith(undefined);
  });
});

describe("uniform /api/v1 gateway passthrough", () => {
  function passthrough(path: string, company: any, body: Record<string, any> = {}) {
    const handled: string[] = [];
    let fellThrough = false;
    const req: any = {
      method: "POST",
      url: path,
      path,
      query: {},
      params: {},
      body,
      company,
      apiKeyCompanyId: company?.id,
      app: { handle: (r: any) => { handled.push(r.url); } },
    };
    const res: any = { status() { return this; }, json() { return this; } };

    fiscalRouter(req, res, () => { fellThrough = true; });
    return { handled, fellThrough };
  }

  test("transact re-dispatches to the company scoped by the API key", () => {
    const { handled } = passthrough("/transact", lekukaCompany);

    expect(handled).toEqual(["/api/companies/2/zimra/transact"]);
  });

  test("a company id in the payload cannot steer the tenant", () => {
    const { handled } = passthrough("/transact", lekukaCompany, { companyId: 999 });

    expect(handled).toEqual(["/api/companies/2/zimra/transact"]);
  });

  test("the router's own endpoints are not intercepted", () => {
    const { handled } = passthrough("/certificate/issue", lekukaCompany);

    expect(handled).toEqual([]);
  });
});
