import { createHash } from "node:crypto";
import forge from "node-forge";
import { beforeEach, describe, expect, test, vi } from "vitest";

const confirm = vi.fn();
const issue = vi.fn();

vi.mock("../../lekuka.js", () => ({
  LekukaDevice: class {
    constructor(public config: any) {}
    confirmCertificate = (thumbprint?: string) => confirm(thumbprint);
    issueCertificate = (csr: string) => issue(csr);
  },
  LekukaApiError: class extends Error {},
  generateLekukaKeypair: () => ({ privateKey: "generated-key", certificateRequest: "generated-csr" }),
}));

vi.mock("../../zimra.js", () => ({
  ZimraDevice: class {},
  ZimraApiError: class extends Error {},
  getZimraBaseUrl: () => "https://fdms.test",
}));

const updateCompany = vi.fn();
vi.mock("../../storage.js", () => ({ storage: { updateCompany: (...a: any[]) => updateCompany(...a) } }));
vi.mock("../fiscalization.js", () => ({ getZimraLogger: () => ({ log: vi.fn() }) }));

import {
  certificateExpiry,
  certificateThumbprint,
  companyUsesLekuka,
  confirmCompanyCertificate,
  issueCompanyCertificate,
  UnsupportedOperationError,
} from "../fiscal-provider.js";

function selfSignedPem(notAfter = new Date(Date.now() + 86400000)): string {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = notAfter;
  cert.setSubject([{ name: "commonName", value: "RSL-SN-0000000812" }]);
  cert.setIssuer(cert.subject.attributes);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.COUNTRY_SCOPE;
});

describe("provider detection", () => {
  test("the company's own provider decides outside a Lesotho-scoped deployment", () => {
    process.env.COUNTRY_SCOPE = "zimbabwe";
    expect(companyUsesLekuka({ fiscalProvider: "ZIMRA", country: "Zimbabwe" })).toBe(false);
    expect(companyUsesLekuka({ fiscalProvider: "LEKUKA", country: "Lesotho" })).toBe(true);
  });

  test("a Lesotho-scoped deployment routes every company to RSL", () => {
    process.env.COUNTRY_SCOPE = "lesotho";
    expect(companyUsesLekuka({ fiscalProvider: "ZIMRA", country: "Zimbabwe" })).toBe(true);
  });
});

describe("certificateThumbprint", () => {
  test("is the uppercase SHA-1 of the certificate DER, as the gateway expects", () => {
    const pem = selfSignedPem();
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(pem))).getBytes();
    const expected = createHash("sha1").update(Buffer.from(der, "binary")).digest("hex").toUpperCase();

    expect(certificateThumbprint(pem)).toBe(expected);
  });

  test("unparseable or absent certificates yield no thumbprint", () => {
    expect(certificateThumbprint("not-a-certificate")).toBeUndefined();
    expect(certificateThumbprint(null)).toBeUndefined();
  });
});

describe("certificateExpiry", () => {
  test("reads the certificate expiry as an ISO timestamp", () => {
    const notAfter = new Date("2030-01-02T03:04:05.000Z");
    expect(certificateExpiry(selfSignedPem(notAfter))).toBe(notAfter.toISOString());
  });

  test("unparseable or absent certificates yield no expiry", () => {
    expect(certificateExpiry("not-a-certificate")).toBeNull();
    expect(certificateExpiry(null)).toBeNull();
  });
});

describe("confirmCompanyCertificate", () => {
  test("a single-step gateway has nothing to confirm", async () => {
    await expect(confirmCompanyCertificate({ fiscalProvider: "ZIMRA", country: "Zimbabwe" }))
      .rejects.toBeInstanceOf(UnsupportedOperationError);
    expect(confirm).not.toHaveBeenCalled();
  });

  test("renewal confirms the certificate that was just issued, not the previous one", async () => {
    const company: any = {
      id: 7,
      fiscalProvider: "LEKUKA",
      country: "Lesotho",
      fdmsDeviceId: "812",
      fdmsDeviceSerialNo: "SN-0004",
      lekukaGatewayUrl: "https://rsl.test",
      zimraPrivateKey: "old-key",
      zimraCertificate: "old-cert",
    };
    const newPem = selfSignedPem();
    issue.mockResolvedValue({ certificate: newPem });
    confirm.mockResolvedValue({ status: "Ok" });

    const issued = await issueCompanyCertificate(company);
    expect(updateCompany).toHaveBeenCalledWith(7, {
      zimraPrivateKey: "generated-key",
      zimraCertificate: newPem,
    });

    await confirmCompanyCertificate({ ...company, zimraCertificate: issued.certificate });

    expect(confirm).toHaveBeenCalledWith(certificateThumbprint(newPem));
  });
});
