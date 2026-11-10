import { useEffect, useRef, useState } from 'react';
import {
  createLocalPlaylist,
  markPlaylistPublic,
  type LocalPlaylist,
} from '../lib/localLibrary';
import {
  checkSlugAvailable,
  publishPublicPlaylist,
  slugProblem,
} from '../lib/publicPlaylists';
import { toast } from '../lib/toast';

type SlugState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

/**
 * Create a playlist. Private (this browser only, the default) or Public
 * (a snapshot published at jac-os.pages.dev/<slug> — anyone with the link can
 * view it; the link follows later edits automatically, and can be made
 * private again from the playlist page).
 *
 * Also used in "publish" mode to make an existing local playlist public.
 */
export default function CreatePlaylistModal({
  open,
  onClose,
  onCreated,
  publishOf,
}: {
  open: boolean;
  onClose: () => void;
  /** called with the affected playlist after create/publish */
  onCreated?: (playlist: LocalPlaylist) => void;
  /** when set, the modal only asks for a slug and publishes this playlist */
  publishOf?: LocalPlaylist | null;
}) {
  const isPublish = !!publishOf;
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [slug, setSlug] = useState('');
  const [slugState, setSlugState] = useState<SlugState>('idle');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const publicMode = visibility === 'public' || isPublish;

  useEffect(() => {
    if (!open) return;
    setName(isPublish ? publishOf?.name ?? '' : '');
    setVisibility(isPublish ? 'public' : 'private');
    setSlug('');
    setSlugState('idle');
    setBusy(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // debounced availability check
  useEffect(() => {
    if (!open || !publicMode) return;
    const problem = slugProblem(slug);
    if (problem || slug.length === 0) {
      setSlugState(slug.length === 0 ? 'idle' : 'invalid');
      return;
    }
    setSlugState('checking');
    const t = window.setTimeout(() => {
      void checkSlugAvailable(slug).then((r) => setSlugState(r === 'error' ? 'error' : r));
    }, 350);
    return () => window.clearTimeout(t);
  }, [slug, open, publicMode]);

  if (!open) return null;

  const slugReady = slugState === 'available';
  const canSubmit = isPublish
    ? slugReady && !busy
    : visibility === 'private'
      ? name.trim().length > 0 && !busy
      : name.trim().length > 0 && slugReady && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (isPublish && publishOf) {
        const result = await publishPublicPlaylist({ slug, name: publishOf.name, tracks: publishOf.tracks });
        if (result === 'taken') { setSlugState('taken'); setBusy(false); return; }
        if (result === 'error') { toast('Could not publish — try again.'); setBusy(false); return; }
        markPlaylistPublic(publishOf.id, result.slug, result.editorKey);
        toast(`Your playlist is live at jac-os.pages.dev/${result.slug}`);
        onCreated?.({ ...publishOf, visibility: 'public', slug: result.slug });
        onClose();
        return;
      }
      const trimmed = name.trim();
      if (visibility === 'private') {
        const pl = createLocalPlaylist(trimmed);
        if (!pl) { toast('Could not create the playlist (limit reached or storage full).'); setBusy(false); return; }
        toast(`Created “${pl.name}”.`);
        onCreated?.(pl);
        onClose();
        return;
      }
      const result = await publishPublicPlaylist({ slug, name: trimmed, tracks: [] });
      if (result === 'taken') { setSlugState('taken'); setBusy(false); return; }
      if (result === 'error') { toast('Could not publish — try again.'); setBusy(false); return; }
      const pl = createLocalPlaylist(trimmed, {
        visibility: 'public',
        slug: result.slug,
        editorKey: result.editorKey,
      });
      if (!pl) { toast('Published, but could not save it locally (storage full).'); setBusy(false); return; }
      toast(`Created “${pl.name}” — live at jac-os.pages.dev/${result.slug}`);
      onCreated?.(pl);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const preview = `https://jac-os.pages.dev/${slug || 'your-slug'}`;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label={isPublish ? 'Make playlist public' : 'New playlist'}>
        <div className="modal-head">
          <h2>{isPublish ? 'Make playlist public' : 'New playlist'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="modal-body">
          {!isPublish && (
            <>
              <label className="field-label" htmlFor="nlp-name">Name</label>
              <input
                ref={inputRef}
                id="nlp-name"
                className="text-input"
                placeholder="My mix"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
                maxLength={80}
                spellCheck={false}
                autoComplete="off"
                disabled={busy}
              />

              <label className="field-label">Who can see it?</label>
              <div className="seg" role="group" aria-label="Visibility">
                <button className={`seg-btn${visibility === 'private' ? ' is-on' : ''}`} onClick={() => setVisibility('private')} disabled={busy}>
                  Private <span className="seg-sub">this device only</span>
                </button>
                <button className={`seg-btn${visibility === 'public' ? ' is-on' : ''}`} onClick={() => setVisibility('public')} disabled={busy}>
                  Public <span className="seg-sub">anyone with the link</span>
                </button>
              </div>
            </>
          )}

          {publicMode && (
            <>
              <label className="field-label" htmlFor="nlp-slug">Link</label>
              <div className="slug-field">
                <span className="slug-prefix">jac-os.pages.dev/</span>
                <input
                  ref={isPublish ? inputRef : undefined}
                  id="nlp-slug"
                  className="text-input slug-input"
                  placeholder="my-mix"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onKeyDown={(e) => e.key === 'Enter' && void submit()}
                  maxLength={40}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="none"
                  disabled={busy}
                />
              </div>
              <div className={`slug-status slug-${slugState}`} aria-live="polite">
                {slugState === 'checking' && 'Checking availability…'}
                {slugState === 'available' && <>Available — <span className="slug-preview">{preview}</span></>}
                {slugState === 'taken' && 'That link is taken.'}
                {slugState === 'invalid' && (slugProblem(slug) ?? 'Slugs: 3–40 chars, lowercase letters, digits, hyphens.')}
                {slugState === 'error' && 'Could not reach the server — check your connection.'}
                {slugState === 'idle' && <>Choose your link, e.g. <span className="slug-preview">{preview}</span></>}
              </div>
              <p className="modal-help">
                Public playlists are snapshots hosted by JACo&rsquo;s — no account needed. The link follows your
                edits automatically, contains the playlist name and track list only, and can be made private
                again from the playlist page. Your password never leaves this device (there isn&rsquo;t one).
              </p>
            </>
          )}

          <div className="download-actions">
            <button className="btn btn-orange-solid btn-sm" onClick={() => void submit()} disabled={!canSubmit}>
              {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {isPublish ? 'Publish' : visibility === 'public' ? 'Create public playlist' : 'Create playlist'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
