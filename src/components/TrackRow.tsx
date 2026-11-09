import { usePlayer, type PlaySource } from '../state/PlayerContext';
import Waveform from './Waveform';
import AddToPlaylistButton from './AddToPlaylistButton';
import { artwork, type SCTrack } from '../lib/soundcloud';
import { fmtCount, fmtDuration } from '../lib/format';
import Artwork from './Artwork';

/**
 * SoundCloud-style tracklist row: index/equalizer, play button, title+uploader,
 * plays, like button, waveform, duration.
 */
export default function TrackRow({
  track,
  index,
  queueTracks,
  source,
  onRemove,
}: {
  track: SCTrack;
  index: number;
  queueTracks: SCTrack[];
  source: PlaySource;
  /** when set, shows an X that removes the track (e.g. from a local playlist) instead of add-to-playlist */
  onRemove?: () => void;
}) {
  const { current, status, toggle, playQueue, liked, toggleLike, source: playSource } = usePlayer();

  const active = current?.id === track.id && playSource?.type === source.type && (source.id === undefined || playSource.id === source.id);
  const playing = active && status === 'playing';
  const loading = active && status === 'loading';

  const isLiked = liked.has(track.id);
  const baseLikes = track.likes_count ?? track.favoritings_count ?? 0;
  const likeCount = baseLikes + (isLiked ? 1 : 0);
  const uploader = track.user?.username;
  const uploaderHref = track.user ? `#/user/${encodeURIComponent(track.user.permalink)}` : undefined;

  const onPlay = () => {
    if (active) {
      toggle();
      return;
    }
    playQueue(queueTracks, index, source);
  };

  return (
    <div className={`track-row${active ? ' is-active' : ''}`} data-track-id={track.id}>
      <div className="track-index">
        {active ? (
          <span className={`eq${playing ? '' : ' is-paused'}`} aria-hidden="true">
            <span /><span /><span /><span />
          </span>
        ) : (
          <span className="track-num">{index + 1}</span>
        )}
      </div>

      <button className="track-play" onClick={onPlay} aria-label={playing ? 'Pause' : `Play ${track.title}`}>
        {loading ? (
          <span className="track-play-spinner" aria-hidden="true" />
        ) : playing ? (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="#ff5500" aria-hidden="true"><rect x="7" y="6" width="3.6" height="12" rx="0.8" /><rect x="13.4" y="6" width="3.6" height="12" rx="0.8" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="17" height="17" fill="#ff5500" aria-hidden="true"><path d="M9.2 7.2v9.6a.8.8 0 0 0 1.22.68l7.6-4.8a.8.8 0 0 0 0-1.36l-7.6-4.8a.8.8 0 0 0-1.22.68Z" /></svg>
        )}
      </button>

      <div className="track-main">
        <button className="track-title" onClick={onPlay} title={track.title}>
          {track.title}
        </button>
        <div className="track-sub">
          {uploaderHref ? (
            <a href={uploaderHref} className="track-artist">{uploader}</a>
          ) : (
            <span className="track-artist">{uploader ?? 'Unknown artist'}</span>
          )}
          {typeof track.playback_count === 'number' && track.playback_count > 0 && (
            <span className="track-plays">
              <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Zm4.2 2.1v2.8c0 .5.55.82.97.55l2.35-1.4a.65.65 0 0 0 0-1.1L7.17 6.05a.65.65 0 0 0-.97.55Z" opacity=".85"/></svg>
              {fmtCount(track.playback_count)}
            </span>
          )}
        </div>
      </div>

      <div className="track-wave">
        <Waveform trackId={track.id} barCount={72} height={36} live={active} />
      </div>

      <button
        className={`like-btn${isLiked ? ' is-liked' : ''}`}
        onClick={() => toggleLike(track)}
        aria-pressed={isLiked}
        aria-label={isLiked ? 'Unlike' : 'Like'}
        title={isLiked ? 'Unlike' : 'Like'}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M8 14.2s-5.9-3.8-7.6-8.9C-.5 2.3 1.8.7 3.9.7c1.5 0 3 .9 4.1 2.4C9.1 1.6 10.6.7 12.1.7c2.1 0 4.4 1.6 3.5 4.6-1.7 5.1-7.6 8.9-7.6 8.9Z"
            fill={isLiked ? '#ff5500' : 'none'}
            stroke={isLiked ? '#ff5500' : '#999'}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
        {likeCount > 0 && <span>{fmtCount(likeCount)}</span>}
      </button>

      <div className="track-time">{fmtDuration(track.duration)}</div>

      <div className="track-action-cell">
        {onRemove ? (
          <button className="track-action" onClick={onRemove} aria-label="Remove from this playlist" title="Remove from this playlist">
            <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M5 5l8 8M13 5l-8 8"/></svg>
          </button>
        ) : (
          <AddToPlaylistButton track={track} />
        )}
      </div>
    </div>
  );
}

/** Compact artwork+title pair used in the player bar. */
export function TrackArtwork({ track, size }: { track: SCTrack; size: number }) {
  return (
    <Artwork
      src={artwork(track.artwork_url, 't200x200')}
      title={track.title}
      size={size}
      className="player-art"
    />
  );
}
