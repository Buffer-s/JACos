import { PlayerProvider } from './state/PlayerContext';
import { useHashRoute } from './lib/router';
import TopNav, { GITHUB_URL } from './components/TopNav';
import PlayerBar from './components/PlayerBar';
import Toasts from './components/Toasts';
import Logo from './components/Logo';
import GitHubMark from './components/GitHubMark';
import { version } from '../package.json';
import Home from './pages/Home';
import UserPage from './pages/UserPage';
import PlaylistPage from './pages/PlaylistPage';
import NotFound from './pages/NotFound';
import ResolvePage from './pages/ResolvePage';

function Routed() {
  const route = useHashRoute();
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'user':
      return <UserPage key={route.permalink} permalink={route.permalink} />;
    case 'playlist':
      return <PlaylistPage key={route.id} id={route.id} />;
    case 'resolve':
      return <ResolvePage key={route.scPath} scPath={route.scPath} />;
    default:
      return <NotFound />;
  }
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Logo size={26} />
          <p>JACo&rsquo;s Soundcloud — Just Another Copy of Sweden&rsquo;s Soundcloud.<br />Made by Buffer. Open source under the MIT license.</p>
        </div>
        <div className="footer-col">
          <h4>Project</h4>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><GitHubMark size={12} /> View on GitHub</a>
          <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer">Report an issue</a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT License</a>
        </div>
        <div className="footer-col">
          <h4>Legal</h4>
          <p className="footer-legal">
            Not affiliated with or endorsed by SoundCloud AB. All audio streams from SoundCloud&rsquo;s CDN and remains the property of its respective owners and uploaders. JACos is a client, not a host.
          </p>
        </div>
      </div>
      <div className="container footer-base">
        <span>© {new Date().getFullYear()} Buffer · JACos v{version}</span>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">github.com/bufferclick/JACos</a>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <TopNav />
      <main className="main">
        <Routed />
      </main>
      <Footer />
      <PlayerBar />
      <Toasts />
    </PlayerProvider>
  );
}
