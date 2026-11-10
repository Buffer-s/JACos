import { useEffect, useMemo, useState } from 'react';
import {
  isTrackOffline,
  removeOfflineTrack,
  saveTrackOffline,
  isOfflineSupported,
} from '../lib/offline';
import { toast } from '../lib/toast';
import type { SCTrack } from '../lib/soundcloud';

/**
 * "Download for offline" — saves a playlist's progressive MP3s into the
 * browser's cache so they play without internet. HLS-only tracks are skipped
 * and reported honestly.
 */
export default function OfflineButton({
  tracks,
  label = 'Download for offline',
  className = 'btn btn-outline btn-block',
}: {
  tracks: SCTrack[];
  label?: string;
  /** override the button style for inline use (e.g. toolbars) */
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [offlineIds, setOfflineIds] = useState<Set<number>>(new Set());
  const trackIds = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const refresh = () =>
    Promise.all(trackIds.map((id) => isTrackOffline(id))).then((flags) =>
      setOfflineIds(new Set(trackIds.filter((_, i) => flags[i]))),
    );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIds.join(',')]);

  if (!isOfflineSupported()) return null;

  const savedCount = offlineIds.size;
  const allSaved = tracks.length > 0 && savedCount === tracks.length;

  const downloadAll = async () => {
    setBusy(true);
    const total = tracks.length;
    let saved = 0, hls = 0, failed = 0, done = 0;
    setProgress({ done: 0, total });
    for (const track of tracks) {
      const result = await saveTrackOffline(track);
      if (result === 'saved') saved += 1;
      else if (result === 'hls-only') hls += 1;
      else if (result === 'failed') failed += 1;
      done += 1;
      setProgress({ done, total });
    }
    setProgress(null);
    setBusy(false);
    await refresh();
    const parts = [`${saved} track${saved === 1 ? '' : 's'} saved for offline`];
    if (hls) parts.push(`${hls} skipped (HLS-only)`);
    if (failed) parts.push(`${failed} failed`);
    toast(parts.join(' · '));
  };

  const removeAll = async () => {
    setBusy(true);
    for (const id of offlineIds) await removeOfflineTrack(id);
    setBusy(false);
    await refresh();
    toast('Removed from offline storage.');
  };

  if (savedCount > 0) {
    return (
      <div className="offline-cluster" title="These tracks are stored in this browser and play without internet.">
        <span className="offline-badge">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 9.5 8 6l3.5 3.5M8 6v7" /><path d="M2.8 12.6a3.4 3.4 0 0 1-.4-6.8 4.6 4.6 0 0 1 8.9-1.5 4.1 4.1 0 0 1 2.9 4 4.3 4.3 0 0 1-2 4.4" /></svg>
          Offline · {savedCount}/{tracks.length}
        </span>
        <button className="linkish" onClick={() => void downloadAll()} disabled={busy || allSaved || tracks.length === savedCount}>
          Save rest
        </button>
        <button className="linkish" onClick={() => void removeAll()} disabled={busy}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <button className={className} onClick={() => void downloadAll()} disabled={busy || tracks.length === 0}>
      {busy ? <span className="btn-spinner" aria-hidden="true" /> : (
        <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }}><path d="M9 2.5v9M5.8 8.2 9 11.4l3.2-3.2M3.5 13.8v1.2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.2" /></svg>
      )}
      {busy && progress ? `Saving ${progress.done}/${progress.total}…` : label}
    </button>
  );
}
