/** SoundCloud image URLs end in a size token such as -large; swap it for the size we want. */
export function art(url: string | null | undefined, size: "t500x500" | "t300x300" | "t200x200" | "t120x120" | "badge" = "t300x300"): string | null {
  if (!url) return null;
  return url.replace(/-(large|original|crop|t\d+x\d+|badge|small|tiny)\.(jpg|jpeg|png)/i, `-${size}.$2`);
}

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function formatLongDuration(ms: number): string {
  const total = Math.round(ms / 60000);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return n.toLocaleString("en-US");
  return String(n);
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days < 1) return "today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * Turns whatever the user typed (a full URL, "soundcloud.com/name", or just "name")
 * into an internal route.
 */
export function routeFromInput(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  value = value.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.)/i, "");
  value = value.replace(/^soundcloud\.com\/?/i, "");
  value = value.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  if (!value) return null;
  const parts = value.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const user = encodeURIComponent(parts[0].replace(/^@/, ""));
  if (parts[1] === "sets" && parts[2]) {
    return `/u/${user}/sets/${encodeURIComponent(parts[2])}`;
  }
  return `/u/${user}`;
}
