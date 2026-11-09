import { Cloud } from "./Icons";
import { art } from "@/lib/format";

type Props = {
  src: string | null;
  size: "t500x500" | "t300x300" | "t200x200" | "t120x120";
  className?: string;
  rounded?: boolean;
};

export function Cover({ src, size, className = "", rounded = false }: Props) {
  const url = art(src, size);
  return (
    <div className={`relative overflow-hidden bg-[#e5e5e5] ${rounded ? "rounded-full" : ""} ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[#ccc]">
          <Cloud className="h-1/3 w-1/3" />
        </div>
      )}
    </div>
  );
}
