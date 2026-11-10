import { useEffect, useMemo, useState } from 'react';
import { useHashRoute, navigate } from '../lib/router';
import {
  getLikedTracks,
  getLocalPlaylists,
  onLocalLibraryChange,
  localPlaylistDuration,
} from '../lib/localLibrary';
import CreatePlaylistModal from './CreatePlaylistModal';
import { artwork } from '../lib/soundcloud';
import { fmtDuration } from '../lib/format';
import { usePlayer } from '../state/PlayerContext';

/**
 * SoundCloud-style right-hand column: your likes and your local playlists.
 * Shown on wide screens; everything here is stored in this browser only.
 */
export default function Sidebar() {
  const route = useHashRoute();
  const { playQueue } = usePlayer();
  const [tick, setTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const unsub = onLocalLibraryChange(() => setTick((t) => t + 1));
    const onKey = () => setTick((t) => t + 1);
    window.addEventListener('focus', onKey);
    return () => {
      unsub();
      window.removeEventListener('focus', onKey);
    };
  }, []);

  // re-read on every navigation too
  useEffect(() => setTick((t) => t + 1), [route]);

  const liked = useMemo(() => getLikedTracks(), [tick, route]);
  const playlists = useMemo(() => getLocalPlaylists(), [tick, route]);
  const recentLikes = liked.slice(0, 4);

  return (
    <aside className="sidebar" aria-label="Your library">
      {/* ---- likes ---- */}
      <section className="sidebar-box">
        <div className="sidebar-head">
          <h3>Likes</h3>
          <span className="sidebar-count">{liked.length}</span>
        </div>
        {recentLikes.length > 0 ? (
          <ul className="sidebar-list">
            {recentLikes.map((t) => (
              <li key={t.id}>
                <button className="sidebar-track" onClick={() => playQueue(liked, liked.indexOf(t), { type: 'tracks', id: 2_000_000_001, title: 'Likes' })} title={`Play “${t.title}”`}>
                  <span className="sidebar-art" aria-hidden="true">
                    {artwork(t.artwork_url, 't120x120')
                      ? <img src={artwork(t.artwork_url, 't120x120') ?? undefined} alt="" width={40} height={40} loading="lazy" />
                      : <span className="sidebar-art-fallback">{t.title.slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <span className="sidebar-track-meta">
                    <span className="sidebar-track-title">{t.title}</span>
                    <span className="sidebar-track-sub">{t.user?.username ?? 'Unknown artist'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sidebar-empty">No likes yet. Tap the heart on any track.</p>
        )}
        <a className="sidebar-link" href="#/likes">View all likes →</a>
      </section>

      {/* ---- local playlists ---- */}
      <section className="sidebar-box">
        <div className="sidebar-head">
          <h3>Playlists</h3>
          <span className="sidebar-count">{playlists.length}</span>
        </div>
        {playlists.length > 0 && (
          <ul className="sidebar-list">
            {playlists.slice(0, 6).map((p) => {
              const first = p.tracks[0];
              const img = first ? artwork(first.artwork_url, 't120x120') : null;
              return (
                <li key={p.id}>
                  <a className="sidebar-track" href={`#/playlists/${encodeURIComponent(p.id)}`} title={p.name}>
                    <span className="sidebar-art" aria-hidden="true">
                      {img ? <img src={img} alt="" width={40} height={40} loading="lazy" /> : <span className="sidebar-art-fallback">{p.name.trim().slice(0, 1).toUpperCase() || '?'}</span>}
                    </span>
                    <span className="sidebar-track-meta">
                      <span className="sidebar-track-title">{p.name}</span>
                      <span className="sidebar-track-sub">{p.tracks.length} track{p.tracks.length === 1 ? '' : 's'} · {fmtDuration(localPlaylistDuration(p))}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <div className="sidebar-create">
          <button className="btn btn-outline btn-block btn-sm" onClick={() => setCreateOpen(true)}>+ New playlist</button>
        </div>
        <a className="sidebar-link" href="#/playlists">Manage playlists →</a>
        <p className="sidebar-note">Private playlists stay on this device; public ones share a link.</p>
      </section>
      <CreatePlaylistModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(pl) => navigate(`/playlists/${encodeURIComponent(pl.id)}`)} />
    </aside>
  );
}
