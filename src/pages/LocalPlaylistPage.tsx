import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLocalPlaylist,
  renameLocalPlaylist,
  deleteLocalPlaylist,
  removeTrackFromLocalPlaylist,
  localPlaylistDuration,
  onLocalLibraryChange,
} from '../lib/localLibrary';
import { artwork } from '../lib/soundcloud';
import { fmtCount, fmtTotalDuration } from '../lib/format';
import { usePlayer } from '../state/PlayerContext';
import { navigate } from '../lib/router';
import TrackRow from '../components/TrackRow';
import Artwork from '../components/Artwork';
import NotFound from './NotFound';
import { toast } from '../lib/toast';

export default function LocalPlaylistPage({ id }: { id: string }) {
  const { playQueue, toggle, status, source, shuffle, toggleShuffle } = usePlayer();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => onLocalLibraryChange(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    if (!confirmingDelete) return;
    const t = window.setTimeout(() => setConfirmingDelete(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmingDelete]);

  const playlist = useMemo(() => getLocalPlaylist(id), [id, tick]);

  const total = playlist ? localPlaylistDuration(playlist) : 0;
  const isThisList = !!playlist && source?.type === 'local' && source.id === hashId(playlist.id);
  const isPlaying = isThisList && status === 'playing';
  const isLoading = isThisList && status === 'loading';

  const sourceInfo = useMemo(
    () => (playlist ? { type: 'local' as const, id: hashId(playlist.id), title: playlist.name } : { type: 'local' as const }),
    [playlist],
  );

  const playAll = useCallback(() => {
    if (!playlist || playlist.tracks.length === 0) return;
    if (isThisList) {
      toggle();
      return;
    }
    playQueue(playlist.tracks, 0, sourceInfo as { type: 'local'; id: number; title: string });
  }, [playlist, isThisList, toggle, playQueue, sourceInfo]);

  const shuffleAll = useCallback(() => {
    if (!playlist || playlist.tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const start = Math.floor(Math.random() * playlist.tracks.length);
    playQueue(playlist.tracks, start, sourceInfo as { type: 'local'; id: number; title: string });
  }, [playlist, shuffle, toggleShuffle, playQueue, sourceInfo]);

  if (!playlist) return <NotFound />;

  const first = playlist.tracks[0];
  const art = first ? artwork(first.artwork_url, 't500x500') : null;

  const commitRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== playlist.name) {
      renameLocalPlaylist(playlist.id, trimmed);
      toast('Playlist renamed.');
    }
    setEditing(false);
  };

  const remove = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deleteLocalPlaylist(playlist.id);
    toast(`Deleted “${playlist.name}”.`);
    navigate('/playlists');
  };

  return (
    <div className="page container playlist-layout">
      {/* left rail */}
      <aside className="playlist-side">
        <div className="playlist-art">
          <Artwork src={art} title={playlist.name} fluid />
          <button className="playlist-art-play" onClick={playAll} aria-label={isPlaying ? 'Pause' : 'Play playlist'} disabled={playlist.tracks.length === 0}>
            {isLoading ? (
              <span className="card-play-spinner" aria-hidden="true" />
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" aria-hidden="true"><rect x="7" y="5.5" width="3.8" height="13" rx="1"/><rect x="13.2" y="5.5" width="3.8" height="13" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" aria-hidden="true"><path d="M9 6.4v11.2a.85.85 0 0 0 1.3.72l8.9-5.6a.85.85 0 0 0 0-1.44l-8.9-5.6A.85.85 0 0 0 9 6.4Z"/></svg>
            )}
          </button>
        </div>

        {editing ? (
          <div className="rename-row">
            <input
              className="text-input"
              value={name}
              autoFocus
              maxLength={80}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              aria-label="Playlist name"
            />
          </div>
        ) : (
          <h1 className="playlist-title local-title">
            {playlist.name}
            <button className="icon-btn rename-btn" onClick={() => { setName(playlist.name); setEditing(true); }} aria-label="Rename playlist" title="Rename playlist">
              <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.6 2.6a1.8 1.8 0 0 1 2.5 2.5L7 13.2 3.5 14.2 4.5 10.7l8.1-8.1Z"/></svg>
            </button>
          </h1>
        )}

        <div className="playlist-stats">
          <span className="local-chip">Local playlist</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{playlist.tracks.length} track{playlist.tracks.length === 1 ? '' : 's'}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{fmtTotalDuration(total)}</span>
        </div>

        <div className="playlist-cta">
          <button className="btn btn-orange-solid btn-block" onClick={playAll} disabled={playlist.tracks.length === 0}>
            {isLoading ? 'Loading…' : isPlaying ? 'Pause' : 'Play playlist'}
          </button>
          <button className="btn btn-outline btn-block" onClick={shuffleAll} disabled={playlist.tracks.length === 0}>
            Shuffle play
          </button>
        </div>
        <div className="playlist-links">
          <button className={`linkish${confirmingDelete ? ' danger-linkish' : ''}`} onClick={remove}>
            {confirmingDelete ? 'Really delete this playlist?' : 'Delete playlist'}
          </button>
        </div>
      </aside>

      {/* tracklist */}
      <section className="playlist-main" aria-label="Tracklist">
        <div className="tracklist-head" aria-hidden="true">
          <span>#</span>
          <span />
          <span>Track</span>
          <span className="th-wave">Waveform</span>
          <span>Likes</span>
          <span>Time</span>
          <span />
        </div>
        {playlist.tracks.map((track, i) => (
          <TrackRow
            key={`${track.id}-${i}`}
            track={track}
            index={i}
            queueTracks={playlist.tracks}
            source={sourceInfo as { type: 'local'; id: number; title: string }}
            onRemove={() => {
              removeTrackFromLocalPlaylist(playlist.id, track.id);
              toast('Removed from the playlist.');
            }}
          />
        ))}
        {playlist.tracks.length === 0 && (
          <div className="empty-panel">
            <h2>Empty playlist</h2>
            <p>Press the add button (＋) on any track anywhere in JACos to put it here.</p>
          </div>
        )}
        <p className="list-note">Stored only in this browser — nothing is uploaded. Tracks stream from SoundCloud&rsquo;s CDN.</p>
      </section>
    </div>
  );
}

/** Stable numeric id for a local playlist (PlayerSource wants numbers). */
function hashId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000_000;
}
