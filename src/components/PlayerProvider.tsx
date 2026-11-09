"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type Hls from "hls.js";
import type { Playlist, StreamInfo, Track } from "@/lib/types";
import { art } from "@/lib/format";

export type RepeatMode = "off" | "all" | "one";

type PlayerContextValue = {
  audioRef: RefObject<HTMLAudioElement | null>;
  track: Track | null;
  queue: Track[];
  playing: boolean;
  loading: boolean;
  error: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
  busyPlaylistId: number | null;
  sourceId: number | null;
  playQueue: (tracks: Track[], startId?: number, sourceId?: number) => void;
  playPlaylist: (playlistId: number, startTrackId?: number) => Promise<void>;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const loadToken = useRef(0);
  const failures = useRef(0);

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [busyPlaylistId, setBusyPlaylistId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(null);

  // Mirrors for event handlers that must not go stale.
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const shuffleRef = useRef(false);
  const repeatRef = useRef<RepeatMode>("off");
  const history = useRef<number[]>([]);

  useEffect(() => {
    queueRef.current = queue;
    indexRef.current = index;
    shuffleRef.current = shuffle;
    repeatRef.current = repeat;
  }, [queue, index, shuffle, repeat]);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const pickNext = useCallback((direction: 1 | -1, auto: boolean): number | null => {
    const q = queueRef.current;
    const cur = indexRef.current;
    if (q.length === 0) return null;

    if (auto && repeatRef.current === "one") return cur;

    if (shuffleRef.current && direction === 1) {
      const options = q.map((t, i) => (t.playable && i !== cur ? i : -1)).filter((i) => i >= 0);
      if (options.length === 0) return repeatRef.current === "all" && q[cur]?.playable ? cur : null;
      return options[Math.floor(Math.random() * options.length)];
    }

    let i = cur;
    for (let step = 0; step < q.length; step++) {
      i += direction;
      if (i >= q.length || i < 0) {
        if (repeatRef.current === "all" || !auto) i = (i + q.length) % q.length;
        else return null;
      }
      if (q[i].playable) return i;
    }
    return null;
  }, []);

  const startTrack = useCallback(
    async (trackIndex: number) => {
      const audio = audioRef.current;
      const t = queueRef.current[trackIndex];
      if (!audio || !t) return;

      const token = ++loadToken.current;
      indexRef.current = trackIndex;
      setIndex(trackIndex);
      setError(null);
      setLoading(true);
      destroyHls();
      audio.pause();

      const fail = (message: string) => {
        if (token !== loadToken.current) return;
        setLoading(false);
        setPlaying(false);
        setError(message);
        failures.current += 1;
        if (failures.current < queueRef.current.length) {
          const n = pickNext(1, true);
          if (n !== null && n !== trackIndex) {
            window.setTimeout(() => {
              if (token === loadToken.current) void startTrack(n);
            }, 900);
          }
        }
      };

      try {
        const res = await fetch(`/api/stream/${t.id}`);
        if (token !== loadToken.current) return;
        if (!res.ok) return fail("This track isn't available for streaming.");
        const info = (await res.json()) as StreamInfo;
        if (token !== loadToken.current) return;

        if (info.type === "hls") {
          const { default: HlsLib } = await import("hls.js");
          if (token !== loadToken.current) return;
          if (HlsLib.isSupported()) {
            const hls = new HlsLib({ enableWorker: true, lowLatencyMode: false });
            hlsRef.current = hls;
            hls.on(HlsLib.Events.ERROR, (_e, data) => {
              if (data.fatal) fail("Playback failed.");
            });
            hls.loadSource(info.url);
            hls.attachMedia(audio);
          } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
            audio.src = info.url;
          } else {
            return fail("Your browser can't play this stream.");
          }
        } else {
          audio.src = info.url;
        }

        await audio.play();
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if ((e as Error)?.name === "NotAllowedError") {
          if (token === loadToken.current) {
            setLoading(false);
            setPlaying(false);
          }
          return;
        }
        fail("Couldn't start playback.");
      }
    },
    [destroyHls, pickNext],
  );

  const playQueue = useCallback(
    (tracks: Track[], startId?: number, source?: number) => {
      if (tracks.length === 0) return;
      let start = startId !== undefined ? tracks.findIndex((t) => t.id === startId) : tracks.findIndex((t) => t.playable);
      if (start < 0) start = tracks.findIndex((t) => t.playable);
      if (start < 0) return;
      queueRef.current = tracks;
      setQueue(tracks);
      setSourceId(source ?? null);
      history.current = [];
      failures.current = 0;
      void startTrack(start);
    },
    [startTrack],
  );

  const playPlaylist = useCallback(
    async (playlistId: number, startTrackId?: number) => {
      setBusyPlaylistId(playlistId);
      try {
        const res = await fetch(`/api/playlists/${playlistId}`);
        if (!res.ok) throw new Error("failed");
        const playlist = (await res.json()) as Playlist;
        playQueue(playlist.tracks, startTrackId, playlistId);
      } catch {
        setError("Couldn't load that playlist.");
      } finally {
        setBusyPlaylistId(null);
      }
    },
    [playQueue],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || indexRef.current < 0) return;
    if (audio.paused) {
      if (!audio.src && !hlsRef.current) void startTrack(indexRef.current);
      else void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [startTrack]);

  const next = useCallback(() => {
    const n = pickNext(1, false);
    if (n === null) return;
    history.current.push(indexRef.current);
    void startTrack(n);
  }, [pickNext, startTrack]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (shuffleRef.current && history.current.length > 0) {
      void startTrack(history.current.pop() as number);
      return;
    }
    const n = pickNext(-1, false);
    if (n !== null) void startTrack(n);
  }, [pickNext, startTrack]);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")), []);

  // Wire up audio element events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onPlaying = () => {
      failures.current = 0;
      setLoading(false);
      setPlaying(true);
    };
    const onWaiting = () => setLoading(true);
    const onEnded = () => {
      const n = pickNext(1, true);
      if (n === null) {
        setPlaying(false);
        return;
      }
      if (n !== indexRef.current) history.current.push(indexRef.current);
      void startTrack(n);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("ended", onEnded);
    };
  }, [pickNext, startTrack]);

  useEffect(() => () => destroyHls(), [destroyHls]);

  const track = index >= 0 ? (queue[index] ?? null) : null;

  // Media Session (hardware keys, lock screen)
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;
    const cover = art(track.artwork, "t500x500");
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: cover ? [{ src: cover, sizes: "500x500" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => toggle());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  }, [track, toggle, next, prev]);

  useEffect(() => {
    document.title = track ? `${track.title} · ${track.artist} · JACo's Soundcloud` : "JACo's Soundcloud";
  }, [track]);

  // Space bar toggles playback
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON" || el.isContentEditable)) return;
      if (indexRef.current < 0) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      audioRef,
      track,
      queue,
      playing,
      loading,
      error,
      shuffle,
      repeat,
      busyPlaylistId,
      sourceId,
      playQueue,
      playPlaylist,
      toggle,
      next,
      prev,
      toggleShuffle,
      cycleRepeat,
    }),
    [track, queue, playing, loading, error, shuffle, repeat, busyPlaylistId, sourceId, playQueue, playPlaylist, toggle, next, prev, toggleShuffle, cycleRepeat],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" />
    </PlayerContext.Provider>
  );
}
