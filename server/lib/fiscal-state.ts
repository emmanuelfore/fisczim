export interface FiscalStateCarrier {
  id: number;
  companyId?: number | null;
  fdmsDeviceId?: string | null;
  fdmsDeviceSerialNo?: string | null;
  fdmsApiKey?: string | null;
  zimraPrivateKey?: string | null;
  zimraCertificate?: string | null;
  zimraEnvironment?: string | null;
  currentFiscalDayNo?: number | null;
  fiscalDayOpen?: boolean | null;
  fiscalDayOpenedAt?: Date | string | null;
  lastFiscalDayStatus?: string | null;
  lastReceiptGlobalNo?: number | null;
  dailyReceiptCount?: number | null;
  lastFiscalHash?: string | null;
  lastReceiptAt?: Date | string | null;
  qrUrl?: string | null;
}

export function hasDedicatedBranchFiscalDevice(branch?: FiscalStateCarrier | null): boolean {
  return Boolean(branch?.fdmsDeviceId && branch?.zimraPrivateKey && branch?.zimraCertificate);
}

export function getFiscalStateCarrier<T extends FiscalStateCarrier>(company: T, branch?: T | null): T {
  return hasDedicatedBranchFiscalDevice(branch) ? (branch as T) : company;
}

export function getFiscalStateOwnerKey(companyId: number, branch?: FiscalStateCarrier | null): number {
  return hasDedicatedBranchFiscalDevice(branch) ? -Number(branch!.id) : Number(companyId);
}
