import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPlaylist,
  artwork,
  avatar,
  type SCPlaylist,
  type SCTrack,
} from '../lib/soundcloud';
import { usePlayer } from '../state/PlayerContext';
import { fmtCount, fmtFullCount, fmtDate, fmtTotalDuration } from '../lib/format';
import TrackRow from '../components/TrackRow';
import ForkButton from '../components/ForkButton';
import OfflineButton from '../components/OfflineButton';
import ErrorPanel from '../components/ErrorPanel';
import Artwork from '../components/Artwork';
import { toast } from '../lib/toast';
import { ClientIdUnavailableError } from '../lib/soundcloud';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; playlist: SCPlaylist; tracks: SCTrack[] };

export default function PlaylistPage({ id }: { id: number }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const { playQueue, toggle, status, source, shuffle, toggleShuffle } = usePlayer();

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const playlist = await getPlaylist(id);
      const tracks = (playlist.tracks ?? []).filter((t): t is SCTrack => typeof (t as SCTrack).duration === 'number');
      setState({ status: 'ready', playlist, tracks });
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof ClientIdUnavailableError
            ? 'JACos could not detect a SoundCloud client_id automatically. Open Settings and paste one to connect.'
            : err instanceof Error
              ? err.message
              : 'Something went wrong while loading this playlist.',
      });
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isThisPlaylist = source?.type === 'playlist' && source.id === id;
  const isPlaying = isThisPlaylist && status === 'playing';
  const isLoading = isThisPlaylist && status === 'loading';

  const playAll = useCallback(() => {
    if (state.status !== 'ready' || state.tracks.length === 0) return;
    if (isThisPlaylist) {
      toggle();
      return;
    }
    playQueue(state.tracks, 0, { type: 'playlist', id, title: state.playlist.title });
  }, [state, isThisPlaylist, toggle, playQueue, id]);

  const shuffleAll = useCallback(() => {
    if (state.status !== 'ready' || state.tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const start = Math.floor(Math.random() * state.tracks.length);
    playQueue(state.tracks, start, { type: 'playlist', id, title: state.playlist.title });
  }, [state, shuffle, toggleShuffle, playQueue, id]);

  const totalDuration = useMemo(
    () => (state.status === 'ready' ? state.tracks.reduce((sum, t) => sum + (t.duration || 0), 0) : 0),
    [state],
  );

  if (state.status === 'loading') {
    return (
      <div className="page container playlist-layout" aria-busy="true">
        <div className="playlist-side">
          <div className="skel" style={{ width: '100%', aspectRatio: '1', borderRadius: 4 }} />
          <div className="skel" style={{ width: '80%', height: 24, marginTop: 16 }} />
          <div className="skel" style={{ width: '50%', height: 14, marginTop: 10 }} />
        </div>
        <div className="playlist-main">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="track-row"><div className="skel" style={{ width: '90%', height: 40 }} /></div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page container">
        <ErrorPanel
          title="Couldn't load this playlist"
          message={state.message}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const { playlist, tracks } = state;
  const owner = playlist.user;
  const ownerName = owner?.username ?? 'Unknown';
  const artworkSrc = artwork(playlist.artwork_url, 't500x500');
  const created = fmtDate(playlist.created_at);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(playlist.permalink_url ?? `https://soundcloud.com/playlists/${playlist.id}`);
      toast('Playlist link copied.');
    } catch {
      toast('Could not copy to clipboard.');
    }
  };

  return (
    <div className="page container playlist-layout">
      {/* ---------- left rail: artwork, meta, creator ---------- */}
      <aside className="playlist-side">
        <div className="playlist-art">
          <Artwork src={artworkSrc} title={playlist.title} fluid />
          <button className="playlist-art-play" onClick={playAll} aria-label={isPlaying ? 'Pause' : 'Play playlist'}>
            {isLoading ? (
              <span className="card-play-spinner" aria-hidden="true" />
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" aria-hidden="true"><rect x="7" y="5.5" width="3.8" height="13" rx="1"/><rect x="13.2" y="5.5" width="3.8" height="13" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" aria-hidden="true"><path d="M9 6.4v11.2a.85.85 0 0 0 1.3.72l8.9-5.6a.85.85 0 0 0 0-1.44l-8.9-5.6A.85.85 0 0 0 9 6.4Z"/></svg>
            )}
          </button>
        </div>

        <h1 className="playlist-title">{playlist.title}</h1>
        {owner && (
          <a className="playlist-owner" href={`#/user/${encodeURIComponent(owner.permalink)}`}>
            <Artwork src={avatar(owner.avatar_url, 't50x50')} title={ownerName} size={20} className="playlist-owner-avatar" />
            {ownerName}
          </a>
        )}

        <div className="playlist-stats">
          <span>{playlist.track_count} track{playlist.track_count === 1 ? '' : 's'}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{fmtTotalDuration(totalDuration)}</span>
          {typeof playlist.likes_count === 'number' && playlist.likes_count > 0 && (
            <>
              <span className="dot-sep" aria-hidden="true" />
              <span>{fmtFullCount(playlist.likes_count)} likes</span>
            </>
          )}
          {created && (
            <>
              <span className="dot-sep" aria-hidden="true" />
              <span>{created}</span>
            </>
          )}
        </div>

        <div className="playlist-cta">
          <button className="btn btn-orange-solid btn-block" onClick={playAll} disabled={tracks.length === 0}>
            {isLoading ? 'Loading…' : isPlaying ? 'Pause' : 'Play playlist'}
          </button>
          <button className="btn btn-outline btn-block" onClick={shuffleAll} disabled={tracks.length === 0}>
            Shuffle play
          </button>
          <ForkButton name={playlist.title} tracks={tracks} />
          <OfflineButton tracks={tracks} label="Download for offline" />
        </div>
        <div className="playlist-links">
          <button className="linkish" onClick={() => void copyLink()}>Copy link</button>
          <a className="linkish" href={playlist.permalink_url} target="_blank" rel="noreferrer">Open on SoundCloud ↗</a>
        </div>

        {owner && (
          <div className="creator-card">
            <div className="creator-head">Playlist creator</div>
            <div className="creator-row">
              <a href={`#/user/${encodeURIComponent(owner.permalink)}`} className="creator-avatar-link">
                <Artwork src={avatar(owner.avatar_url, 't120x120')} title={ownerName} size={56} className="creator-avatar" />
              </a>
              <div className="creator-meta">
                <a href={`#/user/${encodeURIComponent(owner.permalink)}`} className="creator-name">{ownerName}</a>
                <div className="creator-followers">{fmtCount(owner.followers_count)} followers</div>
              </div>
            </div>
            <a className="btn btn-outline btn-sm btn-block" href={owner.permalink_url} target="_blank" rel="noreferrer">Follow on SoundCloud</a>
          </div>
        )}
      </aside>

      {/* ---------- right: tracklist ---------- */}
      <section className="playlist-main" aria-label="Tracklist">
        <div className="tracklist-head" aria-hidden="true">
          <span>#</span>
          <span />
          <span>Track</span>
          <span className="th-wave">Waveform</span>
          <span>Likes</span>
          <span>Time</span>
        </div>
        {tracks.map((track, i) => (
          <TrackRow key={`${track.id}-${i}`} track={track} index={i} queueTracks={tracks} source={{ type: 'playlist', id, title: playlist.title }} />
        ))}
        {tracks.length === 0 && (
          <div className="empty-panel">
            <h2>Nothing streamable here</h2>
            <p>This playlist is empty, or its tracks are not public/streamable.</p>
          </div>
        )}
        <p className="list-note">Tracks stream from SoundCloud&rsquo;s CDN. First play is cached in your browser; replays come from cache.</p>
      </section>
    </div>
  );
}
