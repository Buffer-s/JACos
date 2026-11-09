type P = { className?: string };

export function Cloud({ className }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden="true">
      <path d="M9.5 25.5a6 6 0 0 1-.9-11.93A8 8 0 0 1 24.1 12.4 6.55 6.55 0 0 1 23.5 25.5h-14Z" />
    </svg>
  );
}

export function Play({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.6-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z" />
    </svg>
  );
}

export function Pause({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4.2" height="14" rx="0.8" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="0.8" />
    </svg>
  );
}

export function Prev({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="2.4" height="14" rx="0.6" />
      <path d="M19 5.7v12.6a.5.5 0 0 1-.78.41L9.1 12.41a.5.5 0 0 1 0-.82l9.12-6.3a.5.5 0 0 1 .78.41Z" />
    </svg>
  );
}

export function Next({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="16.6" y="5" width="2.4" height="14" rx="0.6" />
      <path d="M5 5.7v12.6a.5.5 0 0 0 .78.41l9.12-6.3a.5.5 0 0 0 0-.82L5.78 5.29A.5.5 0 0 0 5 5.7Z" />
    </svg>
  );
}

export function Shuffle({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h3.5c2 0 3.4 1 4.6 2.8l1.8 2.4c1.2 1.8 2.6 2.8 4.6 2.8H21" />
      <path d="M3 17h3.5c2 0 3.4-1 4.6-2.8" />
      <path d="M13.2 8.6C14.3 7.6 15.5 7 17.5 7H21" />
      <path d="m18.5 4 2.7 3-2.7 3M18.5 14l2.7 3-2.7 3" />
    </svg>
  );
}

export function Repeat({ className, one }: P & { one?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19" />
      <path d="m16.5 4 3 3-3 3" />
      <path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5" />
      <path d="m7.5 14-3 3 3 3" />
      {one && <path d="M11.2 10.6 12.6 10v4.6" strokeWidth="1.5" />}
    </svg>
  );
}

export function Volume({ className, muted }: P & { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="m16 9.5 4.5 5m0-5-4.5 5" />
      ) : (
        <>
          <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
          <path d="M18 6.8a7.3 7.3 0 0 1 0 10.4" />
        </>
      )}
    </svg>
  );
}

export function Search({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  );
}

export function Spinner({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={`${className ?? ""} animate-spin`} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Pin({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function ExternalLink({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function Verified({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.5 14.4 4l2.8-.1 1.2 2.5 2.4 1.5-.4 2.8L21.5 13l-1.7 2.2-.3 2.8-2.8.6L14.8 20.5 12 19.6l-2.8.9-1.9-1.9-2.8-.6-.3-2.8L2.5 13l1.1-2.3-.4-2.8 2.4-1.5 1.2-2.5L9.6 4 12 2.5Z" />
      <path d="m8.8 12.2 2.2 2.2 4.3-4.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
