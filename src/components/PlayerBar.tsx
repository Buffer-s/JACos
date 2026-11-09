"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { Scrubber } from "./Scrubber";
import { Next, Pause, Play, Prev, Repeat, Shuffle, Spinner, Volume } from "./Icons";
import { art, formatTime } from "@/lib/format";

export function PlayerBar() {
  const { audioRef, track, playing, loading, error, shuffle, repeat, toggle, next, prev, toggleShuffle, cycleRepeat } = usePlayer();

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem("jaco:volume"));
    if (localStorage.getItem("jaco:volume") !== null && Number.isFinite(saved)) {
      setVolume(Math.min(1, Math.max(0, saved)));
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [audioRef, volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setTime(audio.currentTime * 1000);
    const onDur = () => setDuration(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("loadedmetadata", onDur);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("loadedmetadata", onDur);
    };
  }, [audioRef]);

  useEffect(() => {
    setTime(0);
    setDuration(0);
    setScrub(null);
  }, [track?.id]);

  if (!track) return null;

  const total = duration || track.duration;
  const progress = total > 0 ? Math.min(1, (scrub ?? time / total)) : 0;
  const shownTime = scrub !== null ? scrub * total : time;
  const cover = art(track.artwork, "t120x120");

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ccc] bg-[#f2f2f2]">
      <div className="mx-auto flex h-12 max-w-[1240px] items-center gap-2 px-3 sm:gap-4 sm:px-5">
        <div className="flex items-center">
          <button type="button" onClick={prev} aria-label="Previous track" className="flex h-8 w-8 items-center justify-center text-[#333] hover:text-black">
            <Prev className="h-5 w-5" />
          </button>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 items-center justify-center text-[#333] hover:text-black">
            {loading && !playing ? <Spinner className="h-5 w-5" /> : playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>
          <button type="button" onClick={next} aria-label="Next track" className="flex h-8 w-8 items-center justify-center text-[#333] hover:text-black">
            <Next className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={`ml-1 hidden h-8 w-8 items-center justify-center sm:flex ${shuffle ? "text-[#f50]" : "text-[#999] hover:text-[#333]"}`}
          >
            <Shuffle className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            aria-pressed={repeat !== "off"}
            className={`hidden h-8 w-8 items-center justify-center sm:flex ${repeat !== "off" ? "text-[#f50]" : "text-[#999] hover:text-[#333]"}`}
          >
            <Repeat className="h-[18px] w-[18px]" one={repeat === "one"} />
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] tabular-nums">
          <span className="w-10 text-right text-[#f50]">{formatTime(shownTime)}</span>
          <Scrubber
            className="min-w-0 flex-1"
            label="Seek"
            value={progress}
            onChange={setScrub}
            onCommit={(f) => {
              const audio = audioRef.current;
              if (audio && total > 0) audio.currentTime = (f * total) / 1000;
              setTime(f * total);
              setScrub(null);
            }}
          />
          <span className="w-10 text-[#333]">{formatTime(total)}</span>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} className="flex h-8 w-8 items-center justify-center text-[#333] hover:text-black">
            <Volume className="h-5 w-5" muted={muted || volume === 0} />
          </button>
          <Scrubber
            className="w-20"
            label="Volume"
            value={muted ? 0 : volume}
            onChange={(v) => {
              setMuted(false);
              setVolume(v);
            }}
            onCommit={(v) => localStorage.setItem("jaco:volume", String(v))}
          />
        </div>

        <div className="flex min-w-0 items-center gap-3 md:w-[270px]">
          <div className="h-8 w-8 shrink-0 bg-[#ddd]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={cover} alt="" className="h-8 w-8 object-cover" />}
          </div>
          <div className="hidden min-w-0 leading-tight sm:block">
            {error ? (
              <div className="truncate text-xs text-[#f50]">{error}</div>
            ) : (
              <>
                <Link href={`/u/${track.artistPermalink}`} className="block truncate text-xs text-[#999] hover:text-[#333]">
                  {track.artist}
                </Link>
                <a href={track.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-[#333] hover:text-black" title={track.title}>
                  {track.title}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
