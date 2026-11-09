"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type Props = {
  value: number; // 0..1
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  className?: string;
  /** Total height of the hit area in px */
  hit?: number;
  /** Visible track height in px */
  thickness?: number;
};

export function Scrubber({ value, onChange, onCommit, label, className = "", hit = 18, thickness = 3 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  const fraction = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };

  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    onChange(fraction(e));
  };
  const move = (e: PointerEvent) => {
    if (drag) onChange(fraction(e));
  };
  const up = (e: PointerEvent) => {
    if (!drag) return;
    setDrag(false);
    const f = fraction(e);
    onChange(f);
    onCommit?.(f);
  };
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.02 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.02 : 0;
    if (!step) return;
    e.preventDefault();
    const v = Math.min(1, Math.max(0, value + step));
    onChange(v);
    onCommit?.(v);
  };

  const pct = `${Math.min(1, Math.max(0, value)) * 100}%`;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      style={{ height: hit }}
      className={`group relative flex cursor-pointer touch-none items-center outline-none ${className}`}
    >
      <div className="relative w-full rounded-full bg-[#ccc]" style={{ height: thickness }}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#f50]" style={{ width: pct }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f50] bg-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ left: pct, opacity: drag ? 1 : undefined }}
        />
      </div>
    </div>
  );
}
