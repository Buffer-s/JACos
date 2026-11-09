import { useEffect, useRef, useState } from 'react';
import { getProgressiveStreamUrl, type SCTrack } from '../lib/soundcloud';
import { toast } from '../lib/toast';

/** Characters not allowed in filenames on any OS, plus control characters. */
function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return (clean || 'track').slice(0, 110);
}

/**
 * Download a track straight from SoundCloud's CDN to the device.
 * Asks for a filename, then fetches the progressive MP3 and saves it.
 * HLS-only tracks can't be saved as a clean MP3 — we say so instead.
 */
export default function DownloadButton({
  track,
  size = 'row',
}: {
  track: SCTrack;
  size?: 'row' | 'bar';
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultName = sanitizeFilename(`${track.title} - ${track.user?.username ?? 'SoundCloud'}`);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.setTimeout(() => inputRef.current?.select(), 30);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const download = async () => {
    const filename = sanitizeFilename(name);
    setBusy(true);
    try {
      const streamUrl = await getProgressiveStreamUrl(track);
      if (!streamUrl) {
        toast('This track is HLS-only — SoundCloud serves no direct MP3 to save.');
        return;
      }
      const res = await fetch(streamUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast(`Saved “${filename}.mp3”.`);
      setOpen(false);
    } catch (err) {
      console.warn('download failed', err);
      toast('SoundCloud’s CDN refused the download. Open the track on soundcloud.com instead.');
    } finally {
      setBusy(false);
    }
  };

  const iconSize = size === 'bar' ? 17 : 15;

  return (
    <>
      <button
        className={`track-action${size === 'bar' ? ' track-action-bar' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Download track"
        title="Download track"
      >
        <svg viewBox="0 0 18 18" width={iconSize} height={iconSize} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 2.5v9M5.8 8.2 9 11.4l3.2-3.2M3.5 13.8v1.2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.2" />
        </svg>
      </button>

      {open && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Download track">
            <div className="modal-head">
              <h2>Download track</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close" disabled={busy}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-help" style={{ marginTop: 0 }}>
                The MP3 is saved directly from SoundCloud&rsquo;s CDN to your device — JACos never hosts or proxies it.
              </p>
              <label className="field-label" htmlFor="download-name">File name</label>
              <div className="field-row">
                <input
                  ref={inputRef}
                  id="download-name"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !busy && name.trim()) void download();
                  }}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={busy}
                />
                <span className="download-ext">.mp3</span>
              </div>
              <div className="download-actions">
                <button className="btn btn-orange-solid btn-sm" onClick={() => void download()} disabled={busy || !name.trim()}>
                  {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
                  {busy ? 'Downloading…' : 'Download'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
