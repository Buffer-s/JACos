import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer } from '../state/PlayerContext';
import { artwork } from '../lib/soundcloud';
import { navigate } from '../lib/router';
import { TrackArtwork } from './TrackRow';
import AddToPlaylistButton from './AddToPlaylistButton';

/** seconds -> "m:ss" */
function fmtClock(total: number): string {
  if (!Number.isFinite(total) || total < 0) return '0:00';
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * SoundCloud-style bottom player bar. Hidden until the first track is loaded.
 * The thin progress line on top is clickable/draggable to seek.
 */
export default function PlayerBar() {
  const {
    current,
    status,
    errorMessage,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    liked,
    cacheInfo,
    source,
    audio,
    toggle,
    next,
    prev,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
  } = usePlayer();

  const [progress, setProgress] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // body class accounts for the fixed bar when laying out page + footer
  useEffect(() => {
    document.body.classList.toggle('has-player', !!current);
    return () => document.body.classList.remove('has-player');
  }, [current]);

  // keep progress in sync with the audio element (rAF while playing)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      setProgress(dur > 0 ? Math.min(1, audio.currentTime / dur) : 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audio, duration]);

  const fractionFromEvent = useCallback((e: React.PointerEvent | PointerEvent): number => {
    const el = progressRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }, []);

  const onSeek = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      if (dur > 0) seekTo(fractionFromEvent(e) * dur);
    },
    [audio, duration, seekTo, fractionFromEvent],
  );

  if (!current) return null;

  const playing = status === 'playing';
  const loading = status === 'loading';
  const isLiked = liked.has(current.id);
  const artistName = current.user?.username;
  const artistHref = current.user ? `#/user/${encodeURIComponent(current.user.permalink)}` : undefined;
  const artSrc = artwork(current.artwork_url, 't200x200');
  const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
  const shown = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

  const openSource = () => {
    if (source?.type === 'playlist' && source.id !== undefined) navigate(`/playlist/${source.id}`);
    else if (current.user) navigate(`/user/${encodeURIComponent(current.user.permalink)}`);
  };

  return (
    <div className="playerbar" role="region" aria-label="Now playing">
      {/* progress line */}
      <div
        className="pb-progress"
        ref={progressRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          onSeek(e);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) onSeek(e);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        <div className="pb-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="pb-inner">
        {/* ---- transport ---- */}
        <div className="pb-controls">
          <button className={`pb-icon${shuffle ? ' is-on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} title="Shuffle">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5h3l7 9h6M2 14.5h3l2.2-2.8M18 5.5h-6l-2.4 3M15 3l3 2.5L15 8M15 12l3 2.5-3 2.5"/></svg>
          </button>
          <button className="pb-icon" onClick={prev} aria-label="Previous track" title="Previous">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 4h2v12H6zM16 4v12l-9.2-6z"/></svg>
          </button>
          <button className="pb-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
            {loading ? (
              <span className="pb-spinner" aria-hidden="true" />
            ) : playing ? (
              <svg viewBox="0 0 24 24" width="17" height="17" fill="#fff" aria-hidden="true"><rect x="6.5" y="5" width="3.8" height="14" rx="0.9"/><rect x="13.7" y="5" width="3.8" height="14" rx="0.9"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="19" height="19" fill="#fff" aria-hidden="true"><path d="M8.5 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L10 4.65a1 1 0 0 0-1.5.85Z"/></svg>
            )}
          </button>
          <button className="pb-icon" onClick={next} aria-label="Next track" title="Next">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 4h2v12h-2zM4 4v12l9.2-6z"/></svg>
          </button>
          <button className={`pb-icon pb-repeat${repeat !== 'off' ? ' is-on' : ''}`} onClick={cycleRepeat} aria-label={`Repeat: ${repeat}`} title={`Repeat: ${repeat}`} aria-pressed={repeat !== 'off'}>
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5h11l-2.8-2.8M17 12.5H6l2.8 2.8"/></svg>
            {repeat === 'one' && <span className="repeat-one-badge" aria-hidden="true">1</span>}
          </button>
        </div>

        {/* ---- track meta ---- */}
        <div className="pb-track">
          <button className="pb-art-btn" onClick={openSource} aria-label="Open the source of this track">
            {artSrc ? <img className="player-art" src={artSrc} alt="" width={44} height={44} /> : <TrackArtwork track={current} size={44} />}
          </button>
          <div className="pb-meta">
            <button className="pb-title" onClick={openSource} title={current.title}>{current.title}</button>
            <div className="pb-artist-row">
              {artistHref ? (
                <a className="pb-artist" href={artistHref}>{artistName}</a>
              ) : (
                <span className="pb-artist">{artistName ?? 'Unknown artist'}</span>
              )}
              {cacheInfo?.fromCache && <span className="pb-cache">From cache</span>}
            </div>
            {status === 'error' && errorMessage && <div className="pb-error" role="alert">{errorMessage}</div>}
          </div>
        </div>

        {/* ---- right side: like, clock, volume ---- */}
        <div className="pb-right">
          <AddToPlaylistButton track={current} size="bar" />
          <button className={`pb-icon${isLiked ? ' is-on' : ''}`} onClick={() => toggleLike(current)} aria-label={isLiked ? 'Unlike' : 'Like'} aria-pressed={isLiked} title={isLiked ? 'Unlike' : 'Like'}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M8 14.2s-5.9-3.8-7.6-8.9C-.5 2.3 1.8.7 3.9.7c1.5 0 3 .9 4.1 2.4C9.1 1.6 10.6.7 12.1.7c2.1 0 4.4 1.6 3.5 4.6-1.7 5.1-7.6 8.9-7.6 8.9Z"
                fill={isLiked ? '#ff5500' : 'none'}
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="pb-clock">{fmtClock(shown)} / {fmtClock(total)}</span>
          <div className="pb-volume">
            <button className="pb-icon" onClick={toggleMute} aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'} title={muted || volume === 0 ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? (
                <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M3 7.5v5h3.5L11 16V4L6.5 7.5H3z" opacity=".9"/><path d="M14 8l4 4M18 8l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ) : (
                <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M3 7.5v5h3.5L11 16V4L6.5 7.5H3z" opacity=".9"/><path d="M14.2 7.4a3.8 3.8 0 0 1 0 5.2M16.6 5a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
              )}
            </button>
            <input
              className="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
