import { useCallback, useEffect, useState } from 'react';
import {
  getUser,
  getUserPlaylists,
  getUserTracks,
  avatar,
  artwork as artworkUrl,
  ClientIdUnavailableError,
  type SCUser,
  type SCPlaylist,
  type SCTrack,
} from '../lib/soundcloud';
import { fmtCount, fmtFullCount } from '../lib/format';
import { readJSON, writeJSON } from '../lib/storage';
import TrackRow from '../components/TrackRow';
import PlaylistCard from '../components/PlaylistCard';
import ErrorPanel from '../components/ErrorPanel';
import { UserHeaderSkeleton, CardGridSkeleton } from '../components/Skeleton';
import { toast } from '../lib/toast';
import type { PlaySource } from '../state/PlayerContext';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; isClientIdIssue: boolean }
  | { status: 'ready'; user: SCUser; playlists: SCPlaylist[]; tracks: SCTrack[]; trackLimitHit: boolean };

export default function UserPage({ permalink }: { permalink: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState<'playlists' | 'tracks'>('playlists');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const user = await getUser(permalink);
      const [playlists, tracks] = await Promise.all([
        getUserPlaylists(user.id).catch(() => [] as SCPlaylist[]),
        getUserTracks(user.id).catch(() => [] as SCTrack[]),
      ]);
      setState({ status: 'ready', user, playlists, tracks, trackLimitHit: tracks.length >= 100 });
      // remember for the homepage "Recently viewed" chips
      try {
        const prev = readJSON<{ permalink: string; username: string; avatar: string | null }[]>('recent', []);
        const next = [
          { permalink: user.permalink, username: user.username, avatar: avatar(user.avatar_url, 't120x120') },
          ...prev.filter((r) => r.permalink !== user.permalink),
        ].slice(0, 6);
        writeJSON('recent', next);
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      const isClientIdIssue = err instanceof ClientIdUnavailableError;
      setState({
        status: 'error',
        message: isClientIdIssue
          ? 'JACos could not detect a SoundCloud client_id automatically. Open Settings and paste one to connect.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong while loading this profile.',
        isClientIdIssue,
      });
    }
  }, [permalink]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="page container">
        <UserHeaderSkeleton />
        <div className="tabs"><div className="tab is-active">Playlists</div></div>
        <CardGridSkeleton />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page container">
        <ErrorPanel
          title="Couldn't load this profile"
          message={state.message}
          onRetry={() => void load()}
          externalHref={`https://soundcloud.com/${permalink}`}
          externalLabel="Open on soundcloud.com"
        />
      </div>
    );
  }

  const { user, playlists, tracks } = state;
  const avatarSrc = avatar(user.avatar_url, 't120x120') ?? undefined;
  const tracksSource: PlaySource = { type: 'tracks', id: user.id, title: `${user.username} — uploads` };

  const copyProfile = async () => {
    try {
      await navigator.clipboard.writeText(user.permalink_url);
      toast('Profile link copied.');
    } catch {
      toast('Could not copy to clipboard.');
    }
  };

  return (
    <div className="page container">
      {/* ---------- profile header ---------- */}
      <header className="user-header">
        <div className="user-avatar">
          {avatarSrc ? (
            <img src={artworkUrl(user.avatar_url, 't300x300') ?? avatarSrc} alt={user.username} width={132} height={132} />
          ) : (
            <div className="user-avatar-fallback">{user.username.slice(0, 2).toUpperCase()}</div>
          )}
        </div>
        <div className="user-header-info">
          <h1 className="user-name">{user.username}</h1>
          <a className="user-permalink" href={user.permalink_url} target="_blank" rel="noreferrer">
            soundcloud.com/{user.permalink}
            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3M12 3h5v5M17 3l-8.2 8.2"/></svg>
          </a>
          <dl className="user-stats">
            <div className="user-stat"><dt>Followers</dt><dd>{fmtFullCount(user.followers_count)}</dd></div>
            <div className="user-stat"><dt>Followings</dt><dd>{fmtCount(user.followings_count)}</dd></div>
            <div className="user-stat"><dt>Tracks</dt><dd>{fmtCount(user.track_count)}</dd></div>
            <div className="user-stat"><dt>Playlists</dt><dd>{fmtCount(user.playlist_count ?? playlists.length)}</dd></div>
          </dl>
          {user.description && <p className="user-bio">{user.description}</p>}
          <div className="user-actions">
            <a className="btn btn-outline btn-sm" href={user.permalink_url} target="_blank" rel="noreferrer">Follow on SoundCloud</a>
            <button className="btn btn-ghost btn-sm" onClick={() => void copyProfile()}>Copy link</button>
          </div>
        </div>
      </header>

      {/* ---------- tabs ---------- */}
      <div className="tabs" role="tablist" aria-label="Profile content">
        <button role="tab" aria-selected={tab === 'playlists'} className={`tab${tab === 'playlists' ? ' is-active' : ''}`} onClick={() => setTab('playlists')}>
          Playlists <span className="tab-count">{playlists.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'tracks'} className={`tab${tab === 'tracks' ? ' is-active' : ''}`} onClick={() => setTab('tracks')}>
          Tracks <span className="tab-count">{user.track_count ?? tracks.length}</span>
        </button>
      </div>

      {tab === 'playlists' ? (
        playlists.length > 0 ? (
          <div className="card-grid">
            {playlists.map((pl) => <PlaylistCard key={pl.id} playlist={pl} />)}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>No public playlists yet</h2>
            <p>{user.username} hasn&rsquo;t published any public playlists. {user.track_count > 0 ? `They do have ${user.track_count} track${user.track_count === 1 ? '' : 's'} uploaded.` : ''}</p>
            {user.track_count > 0 && (
              <button className="btn btn-orange-solid btn-sm" onClick={() => setTab('tracks')}>See their tracks</button>
            )}
          </div>
        )
      ) : (
        <div className="track-list">
          {tracks.map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} queueTracks={tracks} source={tracksSource} />
          ))}
          {tracks.length === 0 && (
            <div className="empty-panel">
              <h2>No public tracks</h2>
              <p>{user.username} hasn&rsquo;t uploaded any public tracks.</p>
            </div>
          )}
          {state.trackLimitHit && (
            <p className="list-note">Showing the first {tracks.length} uploads. <a href={user.permalink_url} target="_blank" rel="noreferrer">Continue on soundcloud.com ↗</a></p>
          )}
        </div>
      )}
    </div>
  );
}
