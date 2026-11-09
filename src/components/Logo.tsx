/** The JACo's Soundcloud mark: ascending bars resolving into a cloud. */
export default function Logo({ size = 36, variant = 'full' }: { size?: number; variant?: 'full' | 'mark' }) {
  const cloud = (
    <svg
      width={size}
      height={Math.round((size * 29) / 45)}
      viewBox="0 0 45 29"
      fill="none"
      aria-hidden="true"
      className="logo-mark"
    >
      <g fill="#ff5500">
        <rect x="0" y="13" width="2.6" height="13" rx="1.3" />
        <rect x="4.2" y="10" width="2.6" height="16" rx="1.3" />
        <rect x="8.4" y="7.5" width="2.6" height="18.5" rx="1.3" />
        <rect x="12.6" y="5" width="2.6" height="21" rx="1.3" />
        <rect x="16.8" y="3" width="2.6" height="23" rx="1.3" />
        <rect x="21" y="1" width="2.6" height="25" rx="1.3" />
      </g>
      <path
        fill="#ff5500"
        d="M44 18.6a7.2 7.2 0 0 0-7.6-7.15A10.6 10.6 0 0 0 25.8 4.6a2.9 2.9 0 0 0-3.55 2.85v14a2.6 2.6 0 0 0 2.58 2.6H39.4A5.35 5.35 0 0 0 44 18.6Z"
      />
    </svg>
  );

  if (variant === 'mark') return cloud;

  return (
    <a className="logo" href="#/" aria-label="JACo's Soundcloud — home">
      {cloud}
      <span className="logo-word">
        <span className="logo-bold">JACo&rsquo;s</span>
        <span className="logo-light">&nbsp;Soundcloud</span>
      </span>
    </a>
  );
}
