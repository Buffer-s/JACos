import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { waveformBars } from '../lib/waveform';
import { usePlayer } from '../state/PlayerContext';

/**
 * SoundCloud-style waveform. Bars are generated deterministically from the
 * track id; the played portion renders orange over gray. Click or drag to seek.
 */
export default function Waveform({
  trackId,
  barCount = 96,
  height = 40,
  live = false,
  className = '',
}: {
  trackId: number | string;
  barCount?: number;
  height?: number;
  /** true on the row of the currently-playing track — animates + seeks */
  live?: boolean;
  className?: string;
}) {
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bars = useMemo(() => waveformBars(trackId, barCount), [trackId, barCount]);
  const { audio, seekTo, duration } = usePlayer();
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Track playback position with rAF at 60fps on the active row
  useEffect(() => {
    if (!live) {
      setProgress(0);
      return;
    }
    const tick = () => {
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      setProgress(dur > 0 ? Math.min(1, audio.currentTime / dur) : 0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [live, audio, duration]);

  const W = barCount * 3.4;
  const H = 100;
  const maxH = 100;

  const fractionFromEvent = (e: React.PointerEvent): number => {
    const el = rootRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    if (d > 0) seekTo(fractionFromEvent(e) * d);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!live || !draggingRef.current) return;
    const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    if (d > 0) seekTo(fractionFromEvent(e) * d);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const playedWidth = W * progress;

  return (
    <div
      ref={rootRef}
      className={`waveform ${live ? 'is-live' : ''} ${className}`}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role={live ? 'slider' : undefined}
      aria-label={live ? 'Seek' : undefined}
      aria-valuemin={live ? 0 : undefined}
      aria-valuemax={live ? 100 : undefined}
      aria-valuenow={live ? Math.round(progress * 100) : undefined}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        <g fill="#d9d9d9">
          {bars.map((h, i) => {
            const bh = Math.max(4, h * maxH);
            return <rect key={i} x={i * 3.4 + 0.5} y={(H - bh) / 2} width="2.2" height={bh} rx="0.8" />;
          })}
        </g>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={playedWidth} height={H} />
        </clipPath>
        <g fill="#ff5500" clipPath={`url(#${clipId})`}>
          {bars.map((h, i) => {
            const bh = Math.max(4, h * maxH);
            return <rect key={i} x={i * 3.4 + 0.5} y={(H - bh) / 2} width="2.2" height={bh} rx="0.8" />;
          })}
        </g>
      </svg>
    </div>
  );
}
