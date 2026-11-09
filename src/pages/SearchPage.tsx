import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  searchTracks,
  searchPlaylists,
  searchUsers,
  avatar,
  ApiError,
  ClientIdUnavailableError,
  type SCTrack,
  type SCPlaylist,
  type SCUser,
} from '../lib/soundcloud';
import { fmtFullCount } from '../lib/format';
import { navigate } from '../lib/router';
import TrackRow from '../components/TrackRow';
import PlaylistCard from '../components/PlaylistCard';
import Artwork from '../components/Artwork';
import ErrorPanel from '../components/ErrorPanel';
import { hashString } from '../lib/waveform';
import type { PlaySource } from '../state/PlayerContext';

type Tab = 'tracks' | 'playlists' | 'people';
const TABS: { id: Tab; label: string }[] = [
  { id: 'tracks', label: 'Tracks' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'people', label: 'People' },
];

export default function SearchPage({ q }: { q: string }) {
  const [tab, setTab] = useState<Tab>('tracks');
  const [tracks, setTracks] = useState<SCTrack[] | null>(null);
  const [playlists, setPlaylists] = useState<SCPlaylist[] | null>(null);
  const [people, setPeople] = useState<SCUser[] | null>(null);
  const [hasMore, setHasMore] = useState<Record<Tab, boolean>>({ tracks: false, playlists: false, people: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const source: PlaySource = useMemo(
    () => ({ type: 'tracks', id: 1_500_000_000 + (hashString(`search:${q.toLowerCase()}`) % 400_000_000), title: `Search: ${q}` }),
    [q],
  );

  const load = useCallback(
    async (which: Tab, offset: number) => {
      setLoading(true);
      setError(null);
      try {
        if (which === 'tracks') {
          const r = await searchTracks(q, offset);
          setTracks((prev) => (offset > 0 && prev ? [...prev, ...r.items] : r.items));
          setHasMore((h) => ({ ...h, tracks: r.hasMore }));
        } else if (which === 'playlists') {
          const r = await searchPlaylists(q, offset);
          setPlaylists((prev) => (offset > 0 && prev ? [...prev, ...r.items] : r.items));
          setHasMore((h) => ({ ...h, playlists: r.hasMore }));
        } else {
          const r = await searchUsers(q, offset);
          setPeople((prev) => (offset > 0 && prev ? [...prev, ...r.items] : r.items));
          setHasMore((h) => ({ ...h, people: r.hasMore }));
        }
      } catch (err) {
        const isCreds = err instanceof ClientIdUnavailableError || (err instanceof ApiError && [0, 401, 403].includes(err.status));
        setError(isCreds ? 'SoundCloud rejected the connection. Open Settings to fix it.' : err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setLoading(false);
      }
    },
    [q],
  );

  // reset + load the active tab whenever the query changes
  useEffect(() => {
    setTracks(null);
    setPlaylists(null);
    setPeople(null);
    setError(null);
    setHasMore({ tracks: false, playlists: false, people: false });
    void load(tab, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // lazily fetch a tab the first time it's opened
  useEffect(() => {
    const missing =
      (tab === 'tracks' && tracks === null) ||
      (tab === 'playlists' && playlists === null) ||
      (tab === 'people' && people === null);
    if (missing) void load(tab, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const current = tab === 'tracks' ? tracks : tab === 'playlists' ? playlists : people;
  const offset = current?.length ?? 0;

  return (
    <div className="page container search-page">
      <div className="search-head">
        <h1>Results for “{q}”</h1>
        <p className="search-sub">From the whole SoundCloud catalog — tracks, playlists and people.</p>
      </div>

      <div className="search-tabs" role="tablist" aria-label="Result type">
        {TABS.map((t) => {
          const count = t.id === 'tracks' ? tracks : t.id === 'playlists' ? playlists : people;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`search-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {count && <span className="search-tab-count">{count.length}{hasMore[t.id] ? '+' : ''}</span>}
            </button>
          );
        })}
      </div>

      {error && <ErrorPanel title="Search failed" message={error} onRetry={() => void load(tab, 0)} />}

      {!error && loading && current === null && (
        <div className="search-loading" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel" style={{ height: 44, marginBottom: 10 }} />
          ))}
        </div>
      )}

      {!error && current !== null && current.length === 0 && (
        <div className="empty-panel">
          <h2>No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} found</h2>
          <p>Nothing public on SoundCloud matches “{q}”. Try a different spelling or a broader term.</p>
        </div>
      )}

      {!error && tab === 'tracks' && tracks && tracks.length > 0 && (
        <div className="track-list">
          {tracks.map((t, i) => (
            <TrackRow key={`${t.id}-${i}`} track={t} index={i} queueTracks={tracks} source={source} />
          ))}
        </div>
      )}

      {!error && tab === 'playlists' && playlists && playlists.length > 0 && (
        <div className="card-grid">
          {playlists.map((pl) => (
            <PlaylistCard key={pl.id} playlist={pl} />
          ))}
        </div>
      )}

      {!error && tab === 'people' && people && people.length > 0 && (
        <ul className="people-list">
          {people.map((u) => (
            <li key={u.id}>
              <button className="person-row" onClick={() => navigate(`/user/${encodeURIComponent(u.permalink)}`)}>
                <Artwork src={avatar(u.avatar_url, 't120x120')} title={u.username} size={56} className="person-avatar" />
                <span className="person-meta">
                  <span className="person-name">{u.username}</span>
                  <span className="person-sub">
                    soundcloud.com/{u.permalink}
                    {typeof u.followers_count === 'number' && (
                      <> · <strong>{fmtFullCount(u.followers_count)}</strong> follower{u.followers_count === 1 ? '' : 's'}</>
                    )}
                  </span>
                </span>
                <span className="person-go" aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!error && hasMore[tab] && current !== null && current.length > 0 && (
        <button className="btn btn-outline load-more" onClick={() => void load(tab, offset)} disabled={loading}>
          {loading ? 'Loading…' : 'Show more'}
        </button>
      )}
    </div>
  );
}
