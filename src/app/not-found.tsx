import Link from "next/link";
import { Cloud } from "@/components/Icons";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col items-center px-5 py-24 text-center">
      <Cloud className="h-14 w-14 text-[#ddd]" />
      <h1 className="mt-4 text-2xl font-light text-[#333]">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-md text-sm text-[#999]">
        The profile or playlist doesn&apos;t exist, was removed, or is private. Check the link and try again.
      </p>
      <Link href="/" className="mt-6 rounded-[3px] bg-[#f50] px-5 py-2 text-sm font-bold text-white hover:bg-[#e04600]">
        Back to search
      </Link>
    </div>
  );
}
