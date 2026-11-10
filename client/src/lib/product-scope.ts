import {
  resolveProductScope,
  isHrSurfacePath,
  HR_HOME_PATH,
  type ProductScope,
} from "@shared/product-scope";

export type { ProductScope };

/**
 * Build-time product surface, set the same way the brand is set — see
 * `npm run build:hr` and lib/branding.ts. Unset means the full platform.
 */
export const productScope: ProductScope = resolveProductScope(
  import.meta.env.VITE_PRODUCT_SCOPE as string | undefined
);

export const isHrOnly = productScope === "hr";

/** Whether a client-side route exists in this build. Full builds allow everything. */
export function isPathInScope(path: string): boolean {
  if (!isHrOnly) return true;
  return isHrSurfacePath(path);
}

export { HR_HOME_PATH };
