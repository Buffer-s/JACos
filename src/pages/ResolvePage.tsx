import { useEffect, useState } from 'react';
import { resolveUrl, ClientIdUnavailableError, ApiError } from '../lib/soundcloud';
import Logo from '../components/Logo';
import ErrorPanel from '../components/ErrorPanel';
import { openSettings } from '../lib/router';
import { toast } from '../lib/toast';

/**
 * Landing route for link-style URLs (https://jac-os.pages.dev/bfrend,
 * /bfrend/sets/some-set). Resolves the path against SoundCloud and
 * forwards — replacing history so refresh/back behave.
 */
export default function ResolvePage({ scPath }: { scPath: string }) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const url = `https://soundcloud.com/${scPath.replace(/^\/+|\/+$/g, '')}`;
    resolveUrl(url)
      .then((target) => {
        if (cancelled) return;
        if (target.kind === 'user') {
          window.location.replace(`/#/user/${encodeURIComponent(target.user.permalink)}`);
        } else if (target.kind === 'playlist') {
          window.location.replace(`/#/playlist/${target.playlist.id}`);
        } else if (target.kind === 'track') {
          const uploader = target.track.user?.permalink;
          if (uploader) {
            window.location.replace(`/#/user/${encodeURIComponent(uploader)}`);
          } else {
            setError('That URL is a single track — paste the profile URL instead.');
          }
        } else {
          setError(`SoundCloud doesn't recognize ${url}`);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ClientIdUnavailableError || (err instanceof ApiError && [0, 401, 403].includes(err.status))) {
          setError('Couldn’t connect to SoundCloud to resolve this link.');
          toast('Connection problem — check the route in Settings.', { actionLabel: 'Settings', onAction: openSettings });
        } else {
          setError(err instanceof Error ? err.message : 'Couldn’t resolve that URL.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scPath, attempt]);

  if (error) {
    return (
      <div className="page container">
        <ErrorPanel
          title="Couldn't open that link"
          message={error}
          onRetry={() => setAttempt((n) => n + 1)}
          externalHref={`https://soundcloud.com/${scPath.replace(/^\/+|\/+$/g, '')}`}
          externalLabel="Open on soundcloud.com"
        />
      </div>
    );
  }

  return (
    <div className="page container resolve-page" role="status" aria-busy="true">
      <Logo size={52} variant="mark" />
      <p className="resolve-text">
        Resolving <code>soundcloud.com/{scPath.replace(/^\/+/, '')}</code>…
      </p>
      <div className="search-spinner resolve-spinner" aria-hidden="true" />
    </div>
  );
}
