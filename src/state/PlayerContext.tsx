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
import { hydrateTrack, type SCTrack } from '../lib/soundcloud';
import { toast } from '../lib/toast';
import { readString, writeString } from '../lib/storage';
import { getLikedTracks, toggleLikedTrack } from '../lib/localLibrary';
import { getCachedAudio, putCachedAudio, removeCachedAudio } from '../lib/audioCache';
import { buildAudioChain, cacheTrackAudio, rememberSourceResult, type AudioSource } from '../lib/mediaSources';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaySource {
  type: 'playlist' | 'tracks' | 'single' | 'local';
  id?: number;
  title?: string;
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
  toggleLike: (track: SCTrack) => void;
  isCurrent: (trackId: number) => boolean;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const isFullTrack = (t: SCTrack | { kind?: string; id: number }): t is SCTrack =>
  !!t && typeof t === 'object' && typeof (t as SCTrack).duration === 'number';

/** Precise wording for "we tried nothing because SoundCloud offered nothing". */
function noSourceReason(track: SCTrack): string {
  if (track.streamable === false) {
    return 'The uploader disabled streaming for this track.';
  }
  if (track.policy === 'BLOCK' || track.policy === 'DENY') {
    return 'SoundCloud blocks streaming for this track in your region.';
  }
  return 'SoundCloud listed no stream formats for this track (it may be region-locked or unavailable).';
}

/** How long a source gets to produce audio before the next one is tried. */
const SOURCE_TIMEOUT_MS = 12_000;
/** Sanity cap on automatic source switches for one track. */
const MAX_FALLBACKS = 6;

interface LoadOptions {
  /** sources (and `cache`) already tried for this track */
  skip?: Set<string>;
  /** fallback depth — 0 for a normal user-initiated play */
  attempt?: number;
}

/** Resolve as soon as the media element can actually play, reject on error/timeout. */
function waitForPlayable(audio: HTMLAudioElement, timeoutMs = SOURCE_TIMEOUT_MS): { promise: Promise<void>; cancel: () => void } {
  let cleanup = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error('the audio element reported an error'));
    const timer = setTimeout(() => finish(new Error('timed out waiting for audio')), timeoutMs);
    cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('error', onError);
    };
    audio.addEventListener('canplay', onReady);
    audio.addEventListener('loadeddata', onReady);
    audio.addEventListener('error', onError);
  });
  return {
    promise,
    cancel: () => {
      cleanup();
      promise.catch(() => {
        /* abandoned probe */
      });
    },
  };
}

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
    const raw = readString('volume');
    const v = raw === null ? NaN : Number(raw);
    // default is 50% — Number(null) === 0 is what used to mute the player
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.5;
  });
  const [muted, setMuted] = useState<boolean>(() => readString('muted') === '1');
  const [shuffle, setShuffle] = useState<boolean>(() => readString('shuffle') === '1');
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    const r = readString('repeat');
    return r === 'all' || r === 'one' ? r : 'off';
  });
  const [likedArr, setLikedArr] = useState<number[]>(() => getLikedTracks().map((t) => t.id));
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
  const objectUrlRef = useRef<string | null>(null);
  /** true while the fallback chain is probing — the global error handler stays quiet */
  const attemptingRef = useRef(false);
  /** the source currently attached, e.g. `hls:aac_160k` or `cache` */
  const activeKeyRef = useRef<string | null>(null);
  const currentTrackRef = useRef<SCTrack | null>(null);
  const skipRef = useRef<Set<string>>(new Set());
  const fallbackDepthRef = useRef(0);
  const loadRef = useRef<(track: SCTrack, opts?: LoadOptions) => Promise<void>>(async () => {});

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

  const scSourceUrl = useCallback((t: SCTrack): string => {
    if (t.permalink_url) return t.permalink_url;
    const u = t.user?.permalink;
    const p = t.permalink;
    return u && p ? `https://soundcloud.com/${u}/${p}` : 'https://soundcloud.com';
  }, []);

  const reportFailure = useCallback(
    (track: SCTrack, message: string) => {
      setStatus('error');
      setErrorMessage(message);
      toast(message, {
        actionLabel: 'Open on SoundCloud',
        onAction: () => window.open(scSourceUrl(track), '_blank', 'noopener'),
      });
    },
    [scSourceUrl],
  );

  /** Tear down whatever source is attached, without touching `current`. */
  const releaseSource = useCallback(() => {
    destroyHls();
    if (objectUrlRef.current) {
      try {
        URL.revokeObjectURL(objectUrlRef.current);
      } catch {
        /* ignore */
      }
      objectUrlRef.current = null;
    }
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      /* ignore */
    }
    activeKeyRef.current = null;
  }, [audio, destroyHls]);

  /**
   * Attach one URL to the audio element and wait until it is actually
   * playable. Resolves on success, throws when this source is a dud so the
   * caller can move on to the next one.
   */
  const attachSource = useCallback(
    async (
      track: SCTrack,
      url: string,
      kind: AudioSource['kind'],
      sourceKey: string,
      token: number,
      skip: Set<string>,
      attempt: number,
    ): Promise<void> => {
      if (kind === 'hls') {
        let attached = false;
        try {
          const { default: HlsJs } = await import('hls.js'); // code-split: only loaded for HLS sources
          if (token !== loadToken.current) throw new Error('superseded');
          if (HlsJs.isSupported()) {
            const hls = new HlsJs({ enableWorker: true, lowLatencyMode: false });
            hlsRef.current = hls;
            await new Promise<void>((resolve, reject) => {
              let settled = false;
              let switched = false;
              const fail = (message: string) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error(message));
              };
              const timer = setTimeout(() => fail('the HLS playlist did not load in time'), SOURCE_TIMEOUT_MS);
              const switchToNext = () => {
                if (switched || token !== loadToken.current || attempt >= MAX_FALLBACKS) return;
                switched = true;
                const nextSkip = new Set(skip);
                nextSkip.add(sourceKey);
                void loadRef.current(track, { skip: nextSkip, attempt: attempt + 1 });
              };
              hls.on(HlsJs.Events.MANIFEST_PARSED, () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve();
              });
              hls.on(HlsJs.Events.ERROR, (_evt, data) => {
                if (!data?.fatal) return;
                // before playback starts this is just a bad source; afterwards
                // it means the stream died mid-track — retry on another one.
                if (!settled) fail(`HLS error: ${data.details ?? 'fatal'}`);
                else switchToNext();
              });
              hls.loadSource(url);
              hls.attachMedia(audio);
            });
            attached = true;
          }
        } catch (err) {
          if (token !== loadToken.current) throw err;
          /* hls.js missing or unusable — Safari plays HLS natively */
        }
        if (attached) {
          const probe = waitForPlayable(audio);
          try {
            await probe.promise;
          } catch (err) {
            probe.cancel();
            throw err;
          }
          return;
        }
        audio.src = url;
        audio.load();
      } else {
        // progressive MP3 / external file: <audio> does not need CORS to play
        audio.src = url;
        audio.load();
      }

      const probe = waitForPlayable(audio);
      try {
        await probe.promise;
      } catch (err) {
        probe.cancel();
        throw err;
      }
    },
    [audio],
  );

  const loadAndPlay = useCallback(
    async (track: SCTrack, opts: LoadOptions = {}) => {
      const token = ++loadToken.current;
      const skip = new Set(opts.skip ?? []);
      const attempt = opts.attempt ?? 0;
      const superseded = () => token !== loadToken.current;

      skipRef.current = skip;
      fallbackDepthRef.current = Math.max(fallbackDepthRef.current, attempt);
      if (attempt === 0) fallbackDepthRef.current = 0;

      attemptingRef.current = true;
      releaseSource();
      currentTrackRef.current = track;
      setCurrent(track);
      setStatus('loading');
      setErrorMessage(null);
      setDuration((track.duration || 0) / 1000);

      const play = async () => {
        try {
          await audio.play();
        } catch {
          if (!superseded()) setStatus('paused');
        }
      };

      const tried: string[] = [];

      try {
        /* ---- 1. the cache: instant, offline, known to have worked before ---- */
        if (!skip.has('cache')) {
          const cached = await getCachedAudio(track.id);
          if (superseded()) return;
          if (cached) {
            const url = URL.createObjectURL(cached);
            objectUrlRef.current = url;
            activeKeyRef.current = 'cache';
            audio.src = url;
            audio.load();
            const probe = waitForPlayable(audio, 8_000);
            try {
              await probe.promise;
              if (superseded()) {
                probe.cancel();
                return;
              }
              attemptingRef.current = false;
              await play();
              return;
            } catch {
              probe.cancel();
              if (superseded()) return;
              // a damaged cache entry must never block the track
              await removeCachedAudio(track.id);
              releaseSource();
            }
          }
        }

        /* ---- 2. the network chain, best-known source first ---- */
        // Search rows arrive without stream formats, so ask SoundCloud for the
        // full track (by id, then by permalink) before deciding it is dead.
        const full = await hydrateTrack(track).catch(() => track);
        if (superseded()) return;
        const chain = await buildAudioChain(full);
        if (superseded()) return;
        if (chain.length === 0) {
          reportFailure(track, noSourceReason(full));
          return;
        }

        for (const source of chain) {
          if (superseded()) return;
          if (skip.has(source.key)) continue;
          try {
            const url = await source.resolveUrl();
            if (superseded()) return;
            activeKeyRef.current = source.key;
            await attachSource(track, url, source.kind, source.key, token, skip, attempt);
            if (superseded()) return;

            rememberSourceResult(track.id, source.key, true);
            if (tried.length > 0) {
              toast(`That stream failed — playing from a backup source (${source.label}).`);
            }
            attemptingRef.current = false;
            fallbackDepthRef.current = attempt;
            // Fill the cache from whichever source is delivering audio.
            void cacheTrackAudio(full, source);
            await play();
            return;
          } catch {
            if (superseded()) return;
            rememberSourceResult(track.id, source.key, false);
            tried.push(source.label);
            releaseSource();
          }
        }

        if (superseded()) return;

        /* ---- 3. last resort: download the audio and play it from memory ---- */
        // Streaming can fail while downloading works (HLS quirks, CORS on
        // media, half-broken presets). Join the file ourselves, play the blob
        // and keep it in the cache so this track never has to be fetched again.
        for (const source of chain) {
          if (superseded()) return;
          if (skip.has(source.key)) continue;
          try {
            const blob = await source.download();
            if (superseded()) return;
            if (!blob || blob.size === 0) continue;
            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            activeKeyRef.current = `${source.key} (download)`;
            audio.src = url;
            audio.load();
            const probe = waitForPlayable(audio, 12_000);
            try {
              await probe.promise;
            } catch (err) {
              probe.cancel();
              releaseSource();
              throw err;
            }
            if (superseded()) return;
            rememberSourceResult(track.id, source.key, true);
            if (tried.length > 0) {
              toast(`Streamed playback failed — downloaded the track instead (${source.label}).`);
            }
            // keep what we just downloaded
            void putCachedAudio(track.id, blob, { title: track.title, source: source.key });
            attemptingRef.current = false;
            await play();
            return;
          } catch {
            if (superseded()) return;
            releaseSource();
          }
        }

        if (superseded()) return;
        reportFailure(
          track,
          `No working source for “${track.title}” — tried ${tried.length} of ${chain.length} (${tried.join(', ')}).`,
        );
      } catch (err) {
        if (superseded()) return;
        const message = err instanceof Error ? err.message : 'Could not load this track.';
        setStatus('error');
        setErrorMessage(message);
      } finally {
        if (!superseded()) attemptingRef.current = false;
      }
    },
    [attachSource, audio, releaseSource, reportFailure],
  );

  loadRef.current = loadAndPlay;

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
    // pressing play on a failed track retries the whole source chain
    if (status === 'error') {
      void loadAndPlay(current);
      return;
    }
    if (status === 'playing') audio.pause();
    else void audio.play().catch(() => setStatus('paused'));
  }, [audio, current, status, loadAndPlay]);

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

  const toggleLike = useCallback((track: SCTrack) => {
    toggleLikedTrack(track);
    setLikedArr(getLikedTracks().map((t) => t.id));
  }, []);

  const isCurrent = useCallback((trackId: number) => current?.id === trackId, [current]);

  /* ---------------- audio element wiring ---------------- */

  useEffect(() => {
    audio.volume = muted ? 0 : volume;
  }, [audio, volume, muted]);

  // release the object URL / hls instance when the app unmounts
  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        try {
          URL.revokeObjectURL(objectUrlRef.current);
        } catch {
          /* ignore */
        }
        objectUrlRef.current = null;
      }
      destroyHls();
    },
    [destroyHls],
  );

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
      const t = currentTrackRef.current;
      // mid-probe or tearing the element down (empty src) — not a real failure
      if (attemptingRef.current || !t) return;

      // a source that dies mid-playback: walk to the next one, then to the cache
      const key = activeKeyRef.current;
      if (fallbackDepthRef.current < MAX_FALLBACKS) {
        const nextSkip = new Set(skipRef.current);
        if (key) nextSkip.add(key);
        fallbackDepthRef.current += 1;
        void loadRef.current(t, { skip: nextSkip, attempt: fallbackDepthRef.current });
        return;
      }

      const message = 'The stream failed to load. Try again, or check Settings → connection.';
      setStatus('error');
      setErrorMessage(message);
      toast(message, {
        actionLabel: 'Open on SoundCloud',
        onAction: () => window.open(scSourceUrl(t), '_blank', 'noopener'),
      });
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
  }, [audio, next, scSourceUrl]);

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
          if (current) toggleLike(current);
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
