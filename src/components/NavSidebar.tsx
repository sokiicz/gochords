import { navigate, routeHref, type Route } from '../lib/router';
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

function NavLink({
  to,
  active,
  onClose,
  children,
}: {
  to: Route;
  active: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const href = routeHref(to);
  return (
    <a
      className={`nav-link ${active ? 'nav-link-active' : ''}`}
      href={href}
      onClick={(e) => {
        // Let plain clicks update via hashchange; suppress for modifier-clicks (new tab etc.).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        navigate(to);
        onClose();
      }}
    >
      {children}
    </a>
  );
}

export function NavSidebar({ route, cloudEnabled, signedIn, open, onClose, onImport, onSignInRequest }: Props) {
  const is = (n: Route['name']) => route.name === n;

  return (
    <>
      {open && <div className="nav-backdrop" onClick={onClose} />}
      <aside className={`nav-sidebar ${open ? 'nav-sidebar-open' : ''}`}>
        <a
          className="nav-brand"
          href={routeHref({ name: 'browse' })}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
            e.preventDefault();
            navigate({ name: 'browse' });
            onClose();
          }}
          aria-label="GoChords home"
        >
          <span className="brand-mark">♪</span>
          <span className="brand-text">GoChords</span>
        </a>

        <nav className="nav-list">
          <div className="nav-section">Browse</div>
          <NavLink to={{ name: 'browse' }} active={is('browse') || is('artist')} onClose={onClose}>
            <Icon name="star" size={16} />
            <span>Catalog</span>
          </NavLink>
          <NavLink to={{ name: 'communities' }} active={is('communities') || is('community')} onClose={onClose}>
            <Icon name="users" size={16} />
            <span>Communities</span>
          </NavLink>

          <div className="nav-section">Your stuff</div>
          <NavLink to={{ name: 'library' }} active={is('library')} onClose={onClose}>
            <Icon name="heart" size={16} />
            <span>My Library</span>
          </NavLink>
          <NavLink to={{ name: 'playlists' }} active={is('playlists') || is('playlist')} onClose={onClose}>
            <Icon name="list" size={16} />
            <span>Playlists</span>
            {!signedIn && cloudEnabled && <span className="nav-lock">·</span>}
          </NavLink>
          <NavLink to={{ name: 'contributions' }} active={is('contributions')} onClose={onClose}>
            <Icon name="edit" size={16} />
            <span>My Contributions</span>
          </NavLink>
        </nav>

        <button className="nav-import" onClick={onImport}>
          <Icon name="plusCircle" size={16} />
          <span>Add a song</span>
        </button>

        <div className="nav-footer">
          {cloudEnabled ? <AuthMenu onSignInRequest={onSignInRequest} /> : <span className="nav-offline">Offline mode</span>}
          <a
            className="nav-affiliate"
            href="https://resonantlabs.online"
            target="_blank"
            rel="noopener noreferrer"
          >
            by Resonant Labs ↗
          </a>
        </div>
      </aside>
    </>
  );
}
