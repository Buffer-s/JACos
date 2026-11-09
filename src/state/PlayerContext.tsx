import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type Hls from 'hls.js';
import { getStreamUrl, type SCTrack } from '../lib/soundcloud';
import { ensurePlayable, prefetchTrack } from '../lib/audio-cache';
import { toast } from '../lib/toast';
import { readJSON, writeJSON, readString, writeString } from '../lib/storage';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaySource {
  type: 'playlist' | 'tracks' | 'single';
  id?: number;
  title?: string;
}

export interface CacheInfo {
  fromCache: boolean;
  cacheable: boolean;
  streaming: 'progressive' | 'hls';
}

interface PlayerContextValue {
  audio: HTMLAudioElement;
  queue: SCTrack[];
  index: number;
  current: SCTrack | null;
  status: PlayerStatus;
  errorMessage: string | null;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  liked: Set<number>;
  cacheInfo: CacheInfo | null;
  source: PlaySource | null;
  playQueue: (tracks: SCTrack[], startIndex: number, source: PlaySource) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (trackId: number) => void;
  isCurrent: (trackId: number) => boolean;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const isFullTrack = (t: SCTrack | { kind?: string; id: number }): t is SCTrack =>
  !!t && typeof t === 'object' && typeof (t as SCTrack).duration === 'number';

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [audio] = useState(() => {
    const a = new Audio();
    a.preload = 'auto';
    return a;
  });

  const [queue, setQueue] = useState<SCTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<SCTrack | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState<number>(() => {
    const v = Number(readString('volume'));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8;
  });
  const [muted, setMuted] = useState<boolean>(() => readString('muted') === '1');
  const [shuffle, setShuffle] = useState<boolean>(() => readString('shuffle') === '1');
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    const r = readString('repeat');
    return r === 'all' || r === 'one' ? r : 'off';
  });
  const [likedArr, setLikedArr] = useState<number[]>(() => readJSON<number[]>('liked', []));
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [source, setSource] = useState<PlaySource | null>(null);

  const liked = useMemo(() => new Set(likedArr), [likedArr]);
  const hlsRef = useRef<Hls | null>(null);
  const loadToken = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const indexRef = useRef(index);
  indexRef.current = index;
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;

  /* ---------------- track loading ---------------- */

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        /* ignore */
      }
      hlsRef.current = null;
    }
  }, []);

  const loadAndPlay = useCallback(
    async (track: SCTrack) => {
      const token = ++loadToken.current;
      destroyHls();
      setCurrent(track);
      setStatus('loading');
      setErrorMessage(null);
      setCacheInfo(null);
      setDuration((track.duration || 0) / 1000);

      try {
        const stream = await getStreamUrl(track);
        if (token !== loadToken.current) return; // superseded by a newer selection
        if (!stream) {
          setStatus('error');
          setErrorMessage('This track has no playable stream (it may be region-locked or disabled by the uploader).');
          return;
        }

        if (stream.kind === 'hls') {
          let attached = false;
          try {
            const { default: HlsJs } = await import('hls.js'); // code-split: only loaded for HLS-only tracks
            if (token !== loadToken.current) return;
            if (HlsJs.isSupported()) {
              const hls = new HlsJs({ enableWorker: true, lowLatencyMode: false });
              hls.loadSource(stream.url);
              hls.attachMedia(audio);
              hlsRef.current = hls;
              attached = true;
            }
          } catch {
            /* fall through to native playback */
          }
          if (!attached) audio.src = stream.url; // Safari: native HLS
          if (token !== loadToken.current) return;
          setCacheInfo({ fromCache: false, cacheable: false, streaming: 'hls' });
        } else {
          const result = await ensurePlayable(track.id, stream.url);
          if (token !== loadToken.current) return;
          audio.src = result.url;
          setCacheInfo({ fromCache: result.fromCache, cacheable: result.cacheable, streaming: 'progressive' });
        }

        try {
          await audio.play();
        } catch {
          if (token === loadToken.current) setStatus('paused');
        }
      } catch (err) {
        if (token !== loadToken.current) return;
        const message = err instanceof Error ? err.message : 'Could not load this track.';
        setStatus('error');
        setErrorMessage(message);
      }
    },
    [audio, destroyHls],
  );

  const playQueue = useCallback(
    (tracks: SCTrack[], startIndex: number, src: PlaySource) => {
      const playable = tracks.filter(isFullTrack);
      if (playable.length === 0) {
        toast('No streamable tracks in this list.');
        return;
      }
      const fullIndex = tracks.filter(isFullTrack).indexOf(tracks[startIndex] as SCTrack);
      const clamped = Math.max(0, Math.min(playable.length - 1, fullIndex === -1 ? 0 : fullIndex));
      setQueue(playable);
      setIndex(clamped);
      setSource(src);
      void loadAndPlay(playable[clamped]);
    },
    [loadAndPlay],
  );

  const next = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    if (shuffleRef.current && q.length > 1) {
      let n = indexRef.current;
      while (n === indexRef.current) n = Math.floor(Math.random() * q.length);
      setIndex(n);
      void loadAndPlay(q[n]);
      return;
    }
    const n = indexRef.current + 1;
    if (n < q.length) {
      setIndex(n);
      void loadAndPlay(q[n]);
    } else if (repeatRef.current === 'all') {
      setIndex(0);
      void loadAndPlay(q[0]);
    } else {
      setStatus('paused');
      audio.pause();
    }
  }, [audio, loadAndPlay]);

  const prev = useCallback(() => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const q = queueRef.current;
    const n = indexRef.current - 1;
    if (n >= 0) {
      setIndex(n);
      void loadAndPlay(q[n]);
    } else {
      audio.currentTime = 0;
    }
  }, [audio, loadAndPlay]);

  const toggle = useCallback(() => {
    if (!current) return;
    if (status === 'playing') audio.pause();
    else void audio.play().catch(() => setStatus('paused'));
  }, [audio, current, status]);

  const seekTo = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds)) return;
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
    },
    [audio],
  );

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    writeString('volume', String(clamped));
    if (clamped > 0) {
      setMuted(false);
      writeString('muted', '0');
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      writeString('muted', m ? '0' : '1');
      return !m;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      writeString('shuffle', s ? '0' : '1');
      return !s;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => {
      const nextMode: RepeatMode = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
      writeString('repeat', nextMode);
      return nextMode;
    });
  }, []);

  const toggleLike = useCallback((trackId: number) => {
    setLikedArr((prevArr) => {
      const has = prevArr.includes(trackId);
      const nextArr = has ? prevArr.filter((id) => id !== trackId) : [...prevArr, trackId];
      writeJSON('liked', nextArr);
      return nextArr;
    });
  }, []);

  const isCurrent = useCallback((trackId: number) => current?.id === trackId, [current]);

  /* ---------------- audio element wiring ---------------- */

  useEffect(() => {
    audio.volume = muted ? 0 : volume;
  }, [audio, volume, muted]);

  useEffect(() => {
    const onPlay = () => setStatus('playing');
    const onPause = () => setStatus((s) => (s === 'loading' ? s : 'paused'));
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      next();
    };
    const onError = () => {
      setStatus('error');
      setErrorMessage('The stream failed to load. Try again, or check Settings → connection.');
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [audio, next]);

  // Prefetch the next track into the cache once playback starts
  useEffect(() => {
    if (status !== 'playing') return;
    const q = queueRef.current;
    const n = indexRef.current + 1;
    const nextTrack = q[n];
    if (!nextTrack) return;
    const t = window.setTimeout(() => {
      void getStreamUrl(nextTrack)
        .then((s) => {
          if (s?.kind === 'progressive') void prefetchTrack(nextTrack.id, s.url);
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [status, index]);

  // Media Session API — lock-screen / OS-media-key integration
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.user?.username ?? 'SoundCloud',
        artwork: current.artwork_url
          ? [
              { src: current.artwork_url.replace(/-(large|original|t\d+x\d+)(?=\.)/i, '-t300x300'), sizes: '300x300', type: 'image/jpeg' },
            ]
          : [],
      });
      navigator.mediaSession.setActionHandler('play', () => void audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
    } catch {
      /* media session is best effort */
    }
  }, [current, audio, next, prev]);

  // Keyboard shortcuts (space / arrows), ignored while typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowRight':
          seekTo((audio.currentTime || 0) + 5);
          break;
        case 'ArrowLeft':
          seekTo((audio.currentTime || 0) - 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(volume + 0.06);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(volume - 0.06);
          break;
        case 'KeyL':
          if (current) toggleLike(current.id);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, toggle, seekTo, setVolume, volume, current, toggleLike]);

  const value: PlayerContextValue = {
    audio,
    queue,
    index,
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
    playQueue,
    toggle,
    next,
    prev,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    isCurrent,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
