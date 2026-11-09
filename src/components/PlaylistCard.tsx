import { useState } from 'react';
import Artwork from './Artwork';
import { getPlaylist, artwork, type SCPlaylist, type SCTrack } from '../lib/soundcloud';
import { usePlayer } from '../state/PlayerContext';
import { timeAgo, fmtCount } from '../lib/format';
import { toast } from '../lib/toast';
import { navigate } from '../lib/router';

export default function PlaylistCard({ playlist }: { playlist: SCPlaylist }) {
  const { playQueue, source, status, toggle } = usePlayer();
  const [loading, setLoading] = useState(false);

  const isThisPlaying =
    source?.type === 'playlist' && source.id === playlist.id && (status === 'playing' || status === 'loading');

  const playAll = async () => {
    if (isThisPlaying) {
      toggle();
      return;
    }
    setLoading(true);
    try {
      const full = await getPlaylist(playlist.id);
      const tracks = (full.tracks ?? []).filter((t): t is SCTrack => typeof (t as SCTrack).duration === 'number');
      playQueue(tracks, 0, { type: 'playlist', id: playlist.id, title: playlist.title });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load that playlist.');
    } finally {
      setLoading(false);
    }
  };

  const updated = playlist.last_modified ?? playlist.created_at;

  return (
    <article className="card">
      <div className="card-art" role="link" tabIndex={0} aria-label={`Open playlist ${playlist.title}`}
        onClick={() => navigate(`/playlist/${playlist.id}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/playlist/${playlist.id}`)}>
        <Artwork src={artwork(playlist.artwork_url, 't500x500')} title={playlist.title} fluid />
        <button
          className={`card-play${isThisPlaying ? ' is-playing' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            void playAll();
          }}
          aria-label={isThisPlaying ? 'Pause playlist' : 'Play playlist'}
          title={isThisPlaying ? 'Pause' : 'Play'}
        >
          {loading ? (
            <span className="card-play-spinner" aria-hidden="true" />
          ) : isThisPlaying && status === 'playing' ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><rect x="6" y="5" width="4.4" height="14" rx="1" /><rect x="13.6" y="5" width="4.4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true"><path d="M8.5 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L10 4.65a1 1 0 0 0-1.5.85Z" /></svg>
          )}
        </button>
        <span className="card-tracks-pill">{playlist.track_count} track{playlist.track_count === 1 ? '' : 's'}</span>
      </div>

      <a className="card-title" href={`#/playlist/${playlist.id}`} title={playlist.title}>
        {playlist.title}
      </a>
      <div className="card-meta">
        {updated ? <span>Updated {timeAgo(updated)}</span> : <span>&nbsp;</span>}
        {typeof playlist.likes_count === 'number' && playlist.likes_count > 0 && (
          <span className="card-likes">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M8 14s-5.6-3.6-7.2-8.4C-.1 2.6 2 1 4 1c1.5 0 3 .9 4 2.3C9 1.9 10.5 1 12 1c2 0 4.1 1.6 3.2 4.6C13.6 10.4 8 14 8 14Z" transform="scale(0.9) translate(0.9 0.6)"/></svg>
            {fmtCount(playlist.likes_count)}
          </span>
        )}
      </div>
    </article>
  );
}
