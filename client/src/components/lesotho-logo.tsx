// Shared logo for the Lesotho site (lekaku branch).
// Same FiscalStack stacked-layers silhouette as the main brand mark,
// recolored via the `color` prop (Lesotho green on light, white on dark).
export function LesothoMark({
  size = 40,
  color = "#0E7A4F",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      {/* Top slab */}
      <path
        d="M24 2 44 12 24 22 4 12Z"
        fill={color}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Middle band */}
      <path
        d="M9 19.5 24 27 39 19.5 39 24.5 24 32 9 24.5Z"
        fill={color}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Bottom band */}
      <path
        d="M9 29 24 36.5 39 29 39 34 24 41.5 9 34Z"
        fill={color}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
