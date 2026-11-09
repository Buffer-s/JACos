/** Inline error/empty state block — used by pages on API failures. */
export default function ErrorPanel({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
  externalHref,
  externalLabel,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  externalHref?: string;
  externalLabel?: string;
}) {
  return (
    <div className="error-panel" role="alert">
      <svg viewBox="0 0 64 40" width="84" height="54" fill="none" aria-hidden="true">
        <path d="M6 22a9 9 0 0 1 8.6-8.9 12.6 12.6 0 0 1 12.2-9.6 12.9 12.9 0 0 1 10.6-5.7 13.2 13.2 0 0 1 13 10.6A10.3 10.3 0 0 1 62 17a10.4 10.4 0 0 1-4 8" stroke="#d4d4d4" strokeWidth="3.4" strokeLinecap="round"/>
        <path d="M10 33h44" stroke="#e2e2e2" strokeWidth="3.4" strokeLinecap="round" strokeDasharray="1 7"/>
      </svg>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="error-actions">
        {onRetry && (
          <button className="btn btn-orange-solid btn-sm" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        {externalHref && (
          <a className="btn btn-outline btn-sm" href={externalHref} target="_blank" rel="noreferrer">
            {externalLabel ?? 'Open on SoundCloud'}
          </a>
        )}
      </div>
    </div>
  );
}
