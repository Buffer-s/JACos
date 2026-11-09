import { ExternalLink, Pin } from "./Icons";
import { formatCount } from "@/lib/format";
import type { Profile } from "@/lib/types";

export function ProfileSidebar({ profile }: { profile: Profile }) {
  const place = [profile.city, profile.country].filter(Boolean).join(", ");
  return (
    <aside className="w-full shrink-0 lg:w-[300px]">
      <dl className="flex border-r border-[#e5e5e5] lg:border-r-0">
        {[
          ["Followers", profile.followers],
          ["Following", profile.following],
          ["Tracks", profile.trackCount],
        ].map(([label, n], i) => (
          <div key={label as string} className={`flex-1 pr-3 ${i > 0 ? "border-l border-[#e5e5e5] pl-4" : ""}`}>
            <dt className="text-xs font-bold uppercase tracking-wide text-[#999]">{label}</dt>
            <dd className="mt-1 text-[22px] font-light leading-none text-[#333]">{formatCount(n as number)}</dd>
          </div>
        ))}
      </dl>

      {place && (
        <p className="mt-5 flex items-center gap-1.5 text-xs text-[#666]">
          <Pin className="h-3.5 w-3.5 text-[#999]" />
          {place}
        </p>
      )}

      {profile.description && <p className="mt-5 whitespace-pre-line break-words text-[13px] leading-relaxed text-[#333]">{profile.description}</p>}

      <a
        href={profile.url}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 text-xs text-[#999] hover:text-[#333]"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View on SoundCloud
      </a>
    </aside>
  );
}
