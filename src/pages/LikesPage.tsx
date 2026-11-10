import { useEffect, useMemo, useState } from 'react';
import { getLikedTracks, migrateLegacyLikes, replaceLikedTracks, onLocalLibraryChange } from '../lib/localLibrary';
import { fmtTotalDuration } from '../lib/format';
import { usePlayer } from '../state/PlayerContext';
import TrackRow from '../components/TrackRow';
import OfflineButton from '../components/OfflineButton';
import { toast } from '../lib/toast';

export default function LikesPage() {
  const { playQueue, source, status, toggle } = usePlayer();
  const [tick, setTick] = useState(0);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    void migrateLegacyLikes();
    const unsub = onLocalLibraryChange(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  useEffect(() => {
    if (!confirmingClear) return;
    const t = window.setTimeout(() => setConfirmingClear(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmingClear]);

  const likes = useMemo(() => getLikedTracks(), [tick]);
  const totalDuration = likes.reduce((sum, t) => sum + (typeof t.duration === 'number' ? t.duration : 0), 0);
  const isThisList = source?.type === 'tracks' && source.title === 'Likes';
  const isPlaying = isThisList && status === 'playing';
  const isLoading = isThisList && status === 'loading';

  const playAll = () => {
    if (likes.length === 0) return;
    if (isThisList) {
      toggle();
      return;
    }
    playQueue(likes, 0, { type: 'tracks', id: 2_000_000_001, title: 'Likes' });
  };

  const clearAll = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    replaceLikedTracks([]);
    setConfirmingClear(false);
    toast('All likes cleared.');
  };

  return (
    <div className="page container">
      <header className="likes-header">
        <div className="likes-badge" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="34" height="34" fill="#fff"><path d="M24 42.6S6.2 32.2 1.4 14.8C-1.8 4.4 8.1.9 14.2 4.7 18.9 7.6 22 12.6 24 17c2-4.4 5.1-9.4 9.8-12.3 6.1-3.8 16 0 12.8 10.1C41.8 32.2 24 42.6 24 42.6Z"/></svg>
        </div>
        <div className="likes-meta">
          <p className="likes-eyebrow">Local · stored in this browser</p>
          <h1>Likes</h1>
          <p className="likes-sub">{likes.length} track{likes.length === 1 ? '' : 's'}{likes.length > 0 && <> · {fmtTotalDuration(totalDuration)}</>}</p>
          <div className="likes-actions">
            <button className="btn btn-orange-solid btn-sm" onClick={playAll} disabled={likes.length === 0 || isLoading}>
              {isLoading ? 'Loading…' : isPlaying ? 'Pause' : 'Play all'}
            </button>
            {likes.length > 0 && <OfflineButton tracks={likes} label="Offline" className="btn btn-outline btn-sm" />}
            {likes.length > 0 && (
              <button className={`btn btn-ghost btn-sm${confirmingClear ? ' btn-danger-ghost' : ''}`} onClick={clearAll}>
                {confirmingClear ? 'Really clear all likes?' : 'Clear all'}
              </button>
            )}
          </div>
        </div>
      </header>

      {likes.length === 0 ? (
        <div className="empty-panel">
          <h2>No likes yet</h2>
          <p>Tap the heart on any track — here, on profiles, in playlists, or in search — and it will live here.</p>
        </div>
      ) : (
        <div className="track-list">
          {likes.map((t, i) => (
            <TrackRow key={`${t.id}-${i}`} track={t} index={i} queueTracks={likes} source={{ type: 'tracks', id: 2_000_000_001, title: 'Likes' }} />
          ))}
        </div>
      )}
    </div>
  );
}
