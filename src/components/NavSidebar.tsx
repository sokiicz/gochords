import { navigate, type Route } from '../lib/router';
import { Icon } from './Icon';
import { AuthMenu } from './AuthMenu';

interface Props {
  route: Route;
  cloudEnabled: boolean;
  signedIn: boolean;
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  onSignInRequest: () => void;
}

export function NavSidebar({ route, cloudEnabled, signedIn, open, onClose, onImport, onSignInRequest }: Props) {
  const go = (r: Route) => { navigate(r); onClose(); };
  const is = (n: Route['name']) => route.name === n;

  return (
    <>
      {open && <div className="nav-backdrop" onClick={onClose} />}
      <aside className={`nav-sidebar ${open ? 'nav-sidebar-open' : ''}`}>
        <div className="nav-brand">
          <span className="brand-mark">♪</span>
          <span className="brand-text">GoChords</span>
        </div>

        <nav className="nav-list">
          <div className="nav-section">Browse</div>
          <button className={`nav-link ${is('browse') ? 'nav-link-active' : ''}`} onClick={() => go({ name: 'browse' })}>
            <Icon name="star" size={16} />
            <span>Catalog</span>
          </button>
          <button className={`nav-link ${is('communities') ? 'nav-link-active' : ''}`} onClick={() => go({ name: 'communities' })}>
            <Icon name="users" size={16} />
            <span>Communities</span>
          </button>

          <div className="nav-section">Your stuff</div>
          <button className={`nav-link ${is('library') ? 'nav-link-active' : ''}`} onClick={() => go({ name: 'library' })}>
            <Icon name="heart" size={16} />
            <span>My Library</span>
          </button>
          <button className={`nav-link ${is('playlists') || is('playlist') ? 'nav-link-active' : ''}`} onClick={() => go({ name: 'playlists' })}>
            <Icon name="list" size={16} />
            <span>Playlists</span>
            {!signedIn && cloudEnabled && <span className="nav-lock">·</span>}
          </button>
        </nav>

        <button className="nav-import" onClick={onImport}>
          <Icon name="plusCircle" size={16} />
          <span>Add a song</span>
        </button>

        <div className="nav-footer">
          {cloudEnabled ? <AuthMenu onSignInRequest={onSignInRequest} /> : <span className="nav-offline">Offline mode</span>}
        </div>
      </aside>
    </>
  );
}
