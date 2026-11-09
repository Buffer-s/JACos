export type Track = {
  id: number;
  title: string;
  artist: string;
  artistPermalink: string;
  artwork: string | null;
  duration: number; // ms
  url: string;
  playable: boolean;
};

export type Profile = {
  id: number;
  username: string;
  fullName: string;
  permalink: string;
  url: string;
  avatar: string | null;
  banner: string | null;
  description: string;
  city: string | null;
  country: string | null;
  followers: number;
  following: number;
  trackCount: number;
  playlistCount: number;
  verified: boolean;
};

export type Playlist = {
  id: number;
  title: string;
  slug: string;
  url: string;
  artwork: string | null;
  description: string;
  trackCount: number;
  duration: number; // ms
  isAlbum: boolean;
  createdAt: string;
  ownerPermalink: string;
  ownerName: string;
  /** Tracks that came back hydrated. May be a partial list in profile listings. */
  tracks: Track[];
};

export type StreamInfo = {
  url: string;
  type: "hls" | "progressive";
};
