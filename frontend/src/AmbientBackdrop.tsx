export function AmbientBackdrop() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      {(["left", "right"] as const).map((side) => (
        <svg
          key={side}
          className={`ambient-contours ambient-contours-${side}`}
          viewBox="0 0 240 1000"
          preserveAspectRatio="none"
          fill="none"
          focusable="false"
        >
          <g className="ambient-contour-lines">
            <path d="M-140-100C400 180-200 580 100 1100" />
            <path d="M-100-100C440 180-160 580 140 1100" />
            <path d="M-60-100C480 180-120 580 180 1100" />
            <path d="M-20-100C520 180-80 580 220 1100" />
          </g>
          <path
            className="ambient-contour-glint"
            d="M-100-100C440 180-160 580 140 1100"
            pathLength="1000"
          />
        </svg>
      ))}
    </div>
  );
}
