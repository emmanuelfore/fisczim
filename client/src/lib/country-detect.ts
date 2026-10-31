/**
 * Detect which country this instance is deployed for based on the domain.
 * Used to set sensible defaults without hardcoding Zimbabwe everywhere.
 */
import { currentBrand } from "./branding";

export function isLesothoDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('.co.ls');
}

/** Lesotho when either the domain or the build brand says so (LAN dev included). */
export function isLesothoInstance(): boolean {
  return isLesothoDomain() || currentBrand === "fiscalstack_lesotho";
}

export function getDefaultCountry(): string {
  return isLesothoInstance() ? 'Lesotho' : 'Zimbabwe';
}

export function getDefaultCurrency(): string {
  return isLesothoInstance() ? 'LSL' : 'USD';
}

export function getDefaultCity(): string {
  return isLesothoInstance() ? 'Maseru' : 'Harare';
}
