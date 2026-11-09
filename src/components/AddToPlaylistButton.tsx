import { useEffect, useRef, useState } from 'react';
import { getLocalPlaylists, createLocalPlaylist, addTrackToLocalPlaylist, onLocalLibraryChange, type LocalPlaylist } from '../lib/localLibrary';
import { toast } from '../lib/toast';
import { artwork } from '../lib/soundcloud';
import type { SCTrack } from '../lib/soundcloud';

/**
 * "Add to playlist" button used on every track row and in the player bar.
 * Opens a small modal listing the browser-local playlists; creating a new
 * one from here also adds the track. Nothing is stored anywhere but this
 * browser.
 */
export default function AddToPlaylistButton({
  track,
  size = 'row',
}: {
  track: SCTrack;
  /** 'row' renders a compact icon button; 'bar' a slightly larger one */
  size?: 'row' | 'bar';
}) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setPlaylists(getLocalPlaylists());
    refresh();
    const unsub = onLocalLibraryChange(refresh);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const addTo = (id: string, playlistName: string) => {
    const result = addTrackToLocalPlaylist(id, track);
    if (result === 'added') toast(`Added to “${playlistName}”.`);
    else if (result === 'duplicate') toast(`“${playlistName}” already has this track.`);
    else if (result === 'full') toast(`“${playlistName}” is full (500 tracks).`);
    else toast('That playlist is gone — try another one.');
    setOpen(false);
  };

  const createAndAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const playlist = createLocalPlaylist(trimmed);
    if (!playlist) {
      toast('Could not create the playlist (limit reached or storage full).');
      return;
    }
    addTrackToLocalPlaylist(playlist.id, track);
    toast(`Created “${playlist.name}” and added the track.`);
    setName('');
    setOpen(false);
  };

  const iconSize = size === 'bar' ? 18 : 15;

  return (
    <>
      <button
        className={`track-action${size === 'bar' ? ' track-action-bar' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Add to playlist"
        title="Add to playlist"
      >
        <svg viewBox="0 0 18 18" width={iconSize} height={iconSize} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M8 4.5H4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 4 16.5h9a1.5 1.5 0 0 0 1.5-1.5v-4M12.5 1.5v6M9.5 4.5h6" />
        </svg>
      </button>

      {open && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Add to playlist">
            <div className="modal-head">
              <h2>Add to playlist</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-help" style={{ marginTop: 0 }}>
                Local playlists stay in this browser only — they are never uploaded.
              </p>

              <div className="field-row" style={{ marginBottom: 12 }}>
                <input
                  ref={inputRef}
                  className="text-input"
                  placeholder="Create a new playlist…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createAndAdd();
                  }}
                  maxLength={80}
                  spellCheck={false}
                  aria-label="New playlist name"
                />
                <button className="btn btn-orange-solid btn-sm" onClick={createAndAdd} disabled={!name.trim()}>
                  Create
                </button>
              </div>

              {playlists.length === 0 ? (
                <p className="modal-help">No playlists yet — create one above and the track lands in it.</p>
              ) : (
                <ul className="pl-pick-list">
                  {playlists.map((p) => {
                    const first = p.tracks[0];
                    const img = first ? artwork(first.artwork_url, 't120x120') : null;
                    return (
                      <li key={p.id}>
                        <button className="pl-pick-row" onClick={() => addTo(p.id, p.name)}>
                          <span className="pl-pick-art" aria-hidden="true">
                            {img ? <img src={img} alt="" width={38} height={38} loading="lazy" /> : String(p.name.trim()[0] ?? '?').toUpperCase()}
                          </span>
                          <span className="pl-pick-meta">
                            <span className="pl-pick-name">{p.name}</span>
                            <span className="pl-pick-sub">{p.tracks.length} track{p.tracks.length === 1 ? '' : 's'}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
