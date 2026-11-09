import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../state/PlayerContext';
import { artwork } from '../lib/soundcloud';
import { fmtCount, fmtClock } from '../lib/format';
import Artwork from './Artwork';
import { navigate } from '../lib/router';

/** The fixed SoundCloud-style bottom player. */
export default function PlayerBar() {
  const {
    current, status, errorMessage, audio, duration, volume, muted, shuffle, repeat,
    liked, cacheInfo, source, toggle, next, prev, seekTo, setVolume, toggleMute,
    toggleShuffle, cycleRepeat, toggleLike,
  } = usePlayer();

  const [progress, setProgress] = useState(0);
  const fillRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Smooth 60fps progress without re-rendering React state constantly
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      const frac = dur > 0 ? Math.min(1, audio.currentTime / dur) : 0;
      setProgress((prev) => (Math.abs(prev - frac) > 0.002 ? frac : prev));
      if (fillRef.current) fillRef.current.style.width = `${frac * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audio, duration]);

  useEffect(() => {
    const up = () => (draggingRef.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  // pad page bottom while the fixed bar is visible
  useEffect(() => {
    document.body.classList.toggle('has-player', !!current);
    return () => document.body.classList.remove('has-player');
  }, [current]);

  if (!current) return null;

  const fracFromEvent = (e: React.PointerEvent): number => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };
  const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
  const onSeekPointer = (e: React.PointerEvent) => {
    draggingRef.current = true;
    seekTo(fracFromEvent(e) * dur);
  };
  const onSeekMove = (e: React.PointerEvent) => {
    if (draggingRef.current) seekTo(fracFromEvent(e) * dur);
  };

  const isLiked = liked.has(current.id);
  const baseLikes = current.likes_count ?? current.favoritings_count ?? 0;
  const likeCount = baseLikes + (isLiked ? 1 : 0);
  const playing = status === 'playing';
  const loading = status === 'loading';

  return (
    <div className="playerbar" role="region" aria-label="Player">
      {/* hairline progress track across the very top of the bar */}
      <div
        className="pb-progress"
        ref={barRef}
        onPointerDown={onSeekPointer}
        onPointerMove={onSeekMove}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(progress * dur)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') seekTo(audio.currentTime + 5);
          if (e.key === 'ArrowLeft') seekTo(audio.currentTime - 5);
        }}
      >
        <div className="pb-progress-fill" ref={fillRef} style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="pb-inner">
        {/* transport controls */}
        <div className="pb-controls">
          <button className={`pb-icon${shuffle ? ' is-on' : ''}`} onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" title="Shuffle">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5h3.2c4.7 0 6 10 10.8 10H18M2 15h3.2c.9 0 1.8-.7 2.6-1.9M18 5h-2c-.9 0-1.8.7-2.6 1.9M18 5l-2.3-2.3M18 5l-2.3 2.3M18 15l-2.3-2.3M18 15l-2.3 2.3"/></svg>
          </button>
          <button className="pb-icon" onClick={prev} aria-label="Previous track" title="Previous">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M5.5 4.5a.75.75 0 0 1 .75.75v9.5a.75.75 0 0 1-1.5 0v-9.5a.75.75 0 0 1 .75-.75Zm9.78.7a.8.8 0 0 1 1.26.66v8.28a.8.8 0 0 1-1.26.66l-6.62-4.14a.8.8 0 0 1 0-1.32l6.62-4.14Z"/></svg>
          </button>
          <button className="pb-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
            {loading ? (
              <span className="pb-spinner" aria-hidden="true" />
            ) : playing ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><rect x="7" y="6" width="3.7" height="12" rx="0.9"/><rect x="13.3" y="6" width="3.7" height="12" rx="0.9"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M9.5 6.6v10.8a.83.83 0 0 0 1.27.7l8.4-5.4a.83.83 0 0 0 0-1.4l-8.4-5.4a.83.83 0 0 0-1.27.7Z"/></svg>
            )}
          </button>
          <button className="pb-icon" onClick={next} aria-label="Next track" title="Next">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M14.5 4.5a.75.75 0 0 0-.75.75v9.5a.75.75 0 0 0 1.5 0v-9.5a.75.75 0 0 0-.75-.75Zm-9.78.7a.8.8 0 0 0-1.26.66v8.28a.8.8 0 0 0 1.26.66l6.62-4.14a.8.8 0 0 0 0-1.32L4.72 5.2Z"/></svg>
          </button>
          <button
            className={`pb-icon pb-repeat${repeat !== 'off' ? ' is-on' : ''}`}
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            title={repeat === 'off' ? 'Repeat: off' : repeat === 'all' ? 'Repeat: all' : 'Repeat: one'}
            aria-pressed={repeat !== 'off'}
          >
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.3L17 8M17 3.5V8h-4.5M16.5 10a6.5 6.5 0 0 1-11.3 4.3L3 12M3 16.5V12h4.5"/></svg>
            {repeat === 'one' && <span className="repeat-one-badge">1</span>}
          </button>
        </div>

        {/* now playing */}
        <div className="pb-track">
          {source?.type === 'playlist' && source.id ? (
            <button className="pb-art-btn" onClick={() => navigate(`/playlist/${source.id}`)} title="Back to playlist">
              <Artwork src={artwork(current.artwork_url, 't120x120')} title={current.title} size={44} className="player-art" />
            </button>
          ) : (
            <Artwork src={artwork(current.artwork_url, 't120x120')} title={current.title} size={44} className="player-art" />
          )}
          <div className="pb-meta">
            <button className="pb-title" onClick={() => source?.type === 'playlist' && source.id && navigate(`/playlist/${source.id}`)} title={current.title}>
              {current.title}
            </button>
            <div className="pb-artist-row">
              {current.user ? (
                <a className="pb-artist" href={`#/user/${encodeURIComponent(current.user.permalink)}`}>{current.user.username}</a>
              ) : (
                <span className="pb-artist">SoundCloud</span>
              )}
              <span className="pb-cache" title={cacheInfo?.cacheable === false ? 'Streaming directly (cache unavailable)' : cacheInfo?.fromCache ? 'Served from your browser cache' : 'Caching to browser storage'}>
                {cacheInfo?.streaming === 'hls' ? 'HLS' : cacheInfo?.cacheable === false ? 'Streaming' : cacheInfo?.fromCache ? 'Cached' : 'Caching'}
              </span>
            </div>
            {status === 'error' && errorMessage && <div className="pb-error" role="alert">{errorMessage}</div>}
          </div>
        </div>

        {/* right cluster */}
        <div className="pb-right">
          <span className="pb-clock" aria-hidden="true">{fmtClock(audio.currentTime)} / {fmtClock(dur)}</span>
          <button className={`like-btn pb-like${isLiked ? ' is-liked' : ''}`} onClick={() => toggleLike(current.id)} aria-pressed={isLiked} aria-label={isLiked ? 'Unlike' : 'Like'} title={isLiked ? 'Unlike' : 'Like'}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M8 14.2s-5.9-3.8-7.6-8.9C-.5 2.3 1.8.7 3.9.7c1.5 0 3 .9 4.1 2.4C9.1 1.6 10.6.7 12.1.7c2.1 0 4.4 1.6 3.5 4.6-1.7 5.1-7.6 8.9-7.6 8.9Z" fill={isLiked ? '#ff5500' : 'none'} stroke={isLiked ? '#ff5500' : '#666'} strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            {likeCount > 0 && <span>{fmtCount(likeCount)}</span>}
          </button>
          <a className="pb-icon" href={current.permalink_url} target="_blank" rel="noreferrer" aria-label="Open this track on soundcloud.com" title="Open on soundcloud.com">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3M12 3h5v5M17 3l-8.2 8.2"/></svg>
          </a>
          <div className="pb-volume">
            <button className="pb-icon" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
              {muted || volume === 0 ? (
                <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M3 8.5a1 1 0 0 1 1-1h2.6L10 4.1A.8.8 0 0 1 11.3 4.8v10.4a.8.8 0 0 1-1.3.7L6.6 12.5H4a1 1 0 0 1-1-1v-3Zm15.8 1.5a.8.8 0 0 0-1.1-1.2l-1 .95-1-.95a.8.8 0 0 0-1.1 1.2l1.05 1-1.05 1a.8.8 0 1 0 1.1 1.2l1-1 1 1a.8.8 0 0 0 1.1-1.2l-1.05-1 1.05-1Z" opacity=".9"/></svg>
              ) : (
                <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M3 8.5a1 1 0 0 1 1-1h2.6L10 4.1A.8.8 0 0 1 11.3 4.8v10.4a.8.8 0 0 1-1.3.7L6.6 12.5H4a1 1 0 0 1-1-1v-3Zm12.4-.2c.9.7 1.5 1.6 1.5 2.7s-.6 2-1.5 2.7a.9.9 0 0 0 1 1.5c1.3-1 2.1-2.4 2.1-4.2s-.8-3.2-2.1-4.2a.9.9 0 0 0-1 1.5Z" opacity=".9"/></svg>
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
