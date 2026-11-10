import { useEffect, useMemo, useState } from 'react';
import { getLocalPlaylists, deleteLocalPlaylist, localPlaylistDuration, onLocalLibraryChange } from '../lib/localLibrary';
import CreatePlaylistModal from '../components/CreatePlaylistModal';
import { fmtDuration } from '../lib/format';
import { navigate } from '../lib/router';
import Artwork from '../components/Artwork';
import { artwork } from '../lib/soundcloud';
import { toast } from '../lib/toast';

export default function PlaylistsPage() {
  const [tick, setTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => onLocalLibraryChange(() => setTick((t) => t + 1)), []);

  const playlists = useMemo(() => getLocalPlaylists(), [tick]);

  const remove = (id: string, playlistName: string) => {
    deleteLocalPlaylist(id);
    toast(`Deleted “${playlistName}”.`);
  };

  return (
    <div className="page container">
      <header className="likes-header">
        <div className="likes-badge playlists-badge" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="34" height="34" fill="#fff"><path d="M13 8h22v5H13zM13 14h22v5H13zM13 20h14v5H13zM13 26h14v5H13zM32 22h4v14.2a5.5 5.5 0 1 1-4-5.3V22Z"/></svg>
        </div>
        <div className="likes-meta">
          <p className="likes-eyebrow">Local by default</p>
          <h1>Your playlists</h1>
          <p className="likes-sub">{playlists.length} playlist{playlists.length === 1 ? '' : 's'} — private ones stay on this device; public ones share a link.</p>
          <div className="likes-actions">
            <button className="btn btn-orange-solid btn-sm" onClick={() => setCreateOpen(true)}>Create playlist</button>
          </div>
        </div>
      </header>

      {playlists.length === 0 ? (
        <div className="empty-panel">
          <h2>No playlists yet</h2>
          <p>Create one above — or press the add button (＋) on any track anywhere in JACos and start there.</p>
        </div>
      ) : (
        <div className="card-grid">
          {playlists.map((p) => {
            const first = p.tracks[0];
            const art = first ? artwork(first.artwork_url, 't500x500') : null;
            return (
              <article key={p.id} className="card">
                <div
                  className="card-art"
                  role="link"
                  tabIndex={0}
                  aria-label={`Open playlist ${p.name}`}
                  onClick={() => navigate(`/playlists/${encodeURIComponent(p.id)}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/playlists/${encodeURIComponent(p.id)}`)}
                >
                  <Artwork src={art} title={p.name} fluid />
                  <span className="card-tracks-pill">{p.tracks.length} track{p.tracks.length === 1 ? '' : 's'}</span>
                </div>
                <a className="card-title" href={`#/playlists/${encodeURIComponent(p.id)}`} title={p.name}>{p.name}</a>
                {p.visibility === 'public' && p.slug && <span className="public-chip card-public-chip" title={`https://jac-os.pages.dev/${p.slug}`}>Public</span>}
                <div className="card-meta">
                  <span>{fmtDuration(localPlaylistDuration(p))}</span>
                  <button className="linkish card-delete" onClick={() => remove(p.id, p.name)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <CreatePlaylistModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(pl) => navigate(`/playlists/${encodeURIComponent(pl.id)}`)} />
    </div>
  );
}
