import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPublicPlaylist, type PublicPlaylist } from '../lib/publicPlaylists';
import { getTracksByIds, artwork, type SCTrack } from '../lib/soundcloud';
import { fmtTotalDuration } from '../lib/format';
import { usePlayer } from '../state/PlayerContext';
import { navigate } from '../lib/router';
import TrackRow from '../components/TrackRow';
import Artwork from '../components/Artwork';
import ForkButton from '../components/ForkButton';
import OfflineButton from '../components/OfflineButton';
import { toast } from '../lib/toast';
import { hashPlaylistId } from '../lib/localLibrary';

/**
 * A public JACo's playlist — jac-os.pages.dev/<slug>. Anyone with the link
 * can listen. Snapshot hosted in JACo's Supabase project; no account needed.
 * If the slug doesn't exist, we bounce to the SoundCloud resolver so bare
 * URLs like /bfrend keep working.
 */
export default function PublicPlaylistPage({ slug }: { slug: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'missing' }
    | { status: 'upstream-error'; playlist: PublicPlaylist; snapshotCount: number }
    | { status: 'ready'; playlist: PublicPlaylist; tracks: SCTrack[] }
  >({ status: 'loading' });
  const { playQueue, toggle, status, source, shuffle, toggleShuffle } = usePlayer();

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ status: 'loading' });
      const playlist = await getPublicPlaylist(slug);
      if (!alive) return;
      if (!playlist) {
        setState({ status: 'missing' });
        return;
      }
      const ids = playlist.tracks.map((t) => t.id);
      const hydrated = await getTracksByIds(ids);
      if (!alive) return;
      const byId = new Map(hydrated.map((t) => [t.id, t]));
      // keep snapshot order; drop anything SoundCloud no longer serves
      const tracks = ids.map((id) => byId.get(id)).filter((t): t is SCTrack => !!t);
      if (ids.length > 0 && tracks.length === 0) {
        setState({ status: 'upstream-error', playlist, snapshotCount: ids.length });
        return;
      }
      setState({ status: 'ready', playlist, tracks });
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // missing slug → try SoundCloud (bare links like /bfrend land here)
  useEffect(() => {
    if (state.status !== 'missing') return;
    const t = window.setTimeout(() => navigate(`/resolve/${encodeURIComponent(slug)}`), 1200);
    return () => window.clearTimeout(t);
  }, [state.status, slug]);

  const sourceId = hashPlaylistId(`public:${slug}`);
  const isThisList = source?.type === 'local' && source.id === sourceId;
  const isPlaying = isThisList && status === 'playing';
  const isLoading = isThisList && status === 'loading';
  const sourceInfo = useMemo(() => ({ type: 'local' as const, id: sourceId, title: state.status === 'ready' ? state.playlist.name : 'Public playlist' }), [sourceId, state]);

  const playAll = useCallback(() => {
    if (state.status !== 'ready' || state.tracks.length === 0) return;
    if (isThisList) return toggle();
    playQueue(state.tracks, 0, sourceInfo);
  }, [state, isThisList, toggle, playQueue, sourceInfo]);

  const shuffleAll = useCallback(() => {
    if (state.status !== 'ready' || state.tracks.length === 0) return;
    if (!shuffle) toggleShuffle();
    const start = Math.floor(Math.random() * state.tracks.length);
    playQueue(state.tracks, start, sourceInfo);
  }, [state, shuffle, toggleShuffle, playQueue, sourceInfo]);

  if (state.status === 'loading') {
    return (
      <div className="page container playlist-layout" aria-busy="true">
        <div className="playlist-side">
          <div className="skel" style={{ width: '100%', aspectRatio: '1', borderRadius: 4 }} />
          <div className="skel" style={{ width: '70%', height: 24, marginTop: 16 }} />
        </div>
        <div className="playlist-main">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="track-row"><div className="skel" style={{ width: '90%', height: 40 }} /></div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'upstream-error') {
    return (
      <div className="page container">
        <div className="empty-panel" style={{ marginTop: 48 }}>
          <h2>SoundCloud isn&rsquo;t answering</h2>
          <p>This playlist has {state.snapshotCount} tracks on the public link, but SoundCloud couldn&rsquo;t serve them right now. Try again in a moment.</p>
          <button className="btn btn-orange-solid btn-sm" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="page container">
        <div className="empty-panel" style={{ marginTop: 48 }}>
          <h2>No public playlist at “{slug}”</h2>
          <p>It may have been made private — or it might be a SoundCloud link. Taking you to SoundCloud…</p>
          <button className="btn btn-orange-solid btn-sm" onClick={() => navigate(`/resolve/${encodeURIComponent(slug)}`)}>
            Search SoundCloud for “{slug}”
          </button>
        </div>
      </div>
    );
  }

  const { playlist, tracks } = state;
  const total = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const firstArt = playlist.tracks[0]?.artwork_url;
  const art = artwork(firstArt, 't500x500');
  const shareUrl = `https://jac-os.pages.dev/${playlist.slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied.');
    } catch {
      toast('Could not copy to clipboard.');
    }
  };

  return (
    <div className="page container playlist-layout">
      <aside className="playlist-side">
        <div className="playlist-art">
          <Artwork src={art} title={playlist.name} fluid />
          <button className="playlist-art-play" onClick={playAll} aria-label={isPlaying ? 'Pause' : 'Play playlist'} disabled={tracks.length === 0}>
            {isLoading ? (
              <span className="card-play-spinner" aria-hidden="true" />
            ) : isPlaying ? (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" aria-hidden="true"><rect x="7" y="5.5" width="3.8" height="13" rx="1"/><rect x="13.2" y="5.5" width="3.8" height="13" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="34" height="34" fill="#fff" aria-hidden="true"><path d="M9 6.4v11.2a.85.85 0 0 0 1.3.72l8.9-5.6a.85.85 0 0 0 0-1.44l-8.9-5.6A.85.85 0 0 0 9 6.4Z"/></svg>
            )}
          </button>
        </div>

        <h1 className="playlist-title">{playlist.name}</h1>

        <div className="playlist-stats">
          <span className="public-chip">Public playlist</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{tracks.length} track{tracks.length === 1 ? '' : 's'}</span>
          <span className="dot-sep" aria-hidden="true" />
          <span>{fmtTotalDuration(total)}</span>
        </div>

        <div className="playlist-cta">
          <button className="btn btn-orange-solid btn-block" onClick={playAll} disabled={tracks.length === 0}>
            {isLoading ? 'Loading…' : isPlaying ? 'Pause' : 'Play playlist'}
          </button>
          <button className="btn btn-outline btn-block" onClick={shuffleAll} disabled={tracks.length === 0}>
            Shuffle play
          </button>
          <ForkButton name={playlist.name} tracks={tracks} />
          <OfflineButton tracks={tracks} label="Download for offline" />
        </div>
        <div className="playlist-links">
          <button className="linkish" onClick={() => void copyLink()}>Copy link</button>
          <span className="slug-line" title={shareUrl}>{shareUrl.replace('https://', '')}</span>
        </div>
      </aside>

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
        {tracks.map((track, i) => (
          <TrackRow key={`${track.id}-${i}`} track={track} index={i} queueTracks={tracks} source={sourceInfo} />
        ))}
        {tracks.length === 0 && (
          <div className="empty-panel">
            <h2>This playlist is empty</h2>
            <p>The curator hasn&rsquo;t added anything yet — fork it and make it yours.</p>
          </div>
        )}
        <p className="list-note">Public playlist — anyone with the link can listen. Tracks stream from SoundCloud&rsquo;s CDN. Fork makes your private copy.</p>
      </section>
    </div>
  );
}
