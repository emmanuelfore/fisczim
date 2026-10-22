/**
 * Detect which country this instance is deployed for based on the domain.
 * Used to set sensible defaults without hardcoding Zimbabwe everywhere.
 */
export function isLesothoDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('.co.ls');
}

export function getDefaultCountry(): string {
  return isLesothoDomain() ? 'Lesotho' : 'Zimbabwe';
}

export function getDefaultCurrency(): string {
  return isLesothoDomain() ? 'LSL' : 'USD';
}

export function getDefaultCity(): string {
  return isLesothoDomain() ? 'Maseru' : 'Harare';
}
