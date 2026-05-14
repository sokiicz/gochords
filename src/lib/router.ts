import { useEffect, useState } from 'react';

export type Route =
  | { name: 'browse' }
  | { name: 'library' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'communities' }
  | { name: 'community'; slug: string }
  | { name: 'join'; code: string }
  | { name: 'import'; from?: string | null }
  | { name: 'edit'; id: string }
  | { name: 'song'; id: string }
  | { name: 'artist'; slug: string }
  | { name: 'contributions' }
  | { name: 'following' }
  | { name: 'updates' }
  | { name: 'user'; handle: string }
  | { name: 'profile' };

function parseHash(raw: string): Route {
  const h = raw.replace(/^#\/?/, '').split('?')[0];
  const params = new URLSearchParams(raw.split('?')[1] || '');
  if (h === '' || h === 'browse') return { name: 'browse' };
  if (h === 'library') return { name: 'library' };
  if (h === 'playlists') return { name: 'playlists' };
  if (h === 'communities') return { name: 'communities' };
  if (h === 'profile') return { name: 'profile' };
  if (h === 'contributions') return { name: 'contributions' };
  if (h === 'following') return { name: 'following' };
  if (h === 'updates') return { name: 'updates' };
  if (h.startsWith('artist/')) return { name: 'artist', slug: decodeURIComponent(h.slice(7)) };
  if (h.startsWith('u/')) return { name: 'user', handle: decodeURIComponent(h.slice(2)) };
  if (h === 'import') return { name: 'import', from: params.get('from') };
  if (h.startsWith('playlist/'))  return { name: 'playlist',  id: decodeURIComponent(h.slice(9)) };
  if (h.startsWith('community/')) return { name: 'community', slug: decodeURIComponent(h.slice(10)) };
  if (h.startsWith('join/'))      return { name: 'join',      code: decodeURIComponent(h.slice(5)) };
  if (h.startsWith('edit/'))      return { name: 'edit',      id: decodeURIComponent(h.slice(5)) };
  if (h.startsWith('song/'))      return { name: 'song',      id: decodeURIComponent(h.slice(5)) };
  return { name: 'browse' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route): void {
  let hash = '';
  switch (route.name) {
    case 'browse':      hash = '#/browse'; break;
    case 'library':     hash = '#/library'; break;
    case 'playlists':   hash = '#/playlists'; break;
    case 'playlist':    hash = `#/playlist/${encodeURIComponent(route.id)}`; break;
    case 'communities': hash = '#/communities'; break;
    case 'community':   hash = `#/community/${encodeURIComponent(route.slug)}`; break;
    case 'profile':     hash = '#/profile'; break;
    case 'contributions': hash = '#/contributions'; break;
    case 'following': hash = '#/following'; break;
    case 'updates': hash = '#/updates'; break;
    case 'artist':      hash = `#/artist/${encodeURIComponent(route.slug)}`; break;
    case 'user':        hash = `#/u/${encodeURIComponent(route.handle)}`; break;
    case 'join':        hash = `#/join/${encodeURIComponent(route.code)}`; break;
    case 'import':      hash = '#/import' + (route.from ? `?from=${encodeURIComponent(route.from)}` : ''); break;
    case 'edit':        hash = `#/edit/${encodeURIComponent(route.id)}`; break;
    case 'song':        hash = `#/song/${encodeURIComponent(route.id)}`; break;
  }
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function navigateBack(fallback: Route = { name: 'browse' }): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}

/**
 * Read query params from the current hash (e.g. `#/song/abc?t=2&c=1`).
 * Returns an empty URLSearchParams when there is no query portion.
 */
export function parseHashQuery(): URLSearchParams {
  const raw = typeof window === 'undefined' ? '' : window.location.hash;
  return new URLSearchParams(raw.split('?')[1] || '');
}

/** Hash-based href for a Route, suitable for <a href={...}>. */
export function routeHref(route: Route): string {
  switch (route.name) {
    case 'browse':      return '#/browse';
    case 'library':     return '#/library';
    case 'playlists':   return '#/playlists';
    case 'playlist':    return `#/playlist/${encodeURIComponent(route.id)}`;
    case 'communities': return '#/communities';
    case 'community':   return `#/community/${encodeURIComponent(route.slug)}`;
    case 'profile':     return '#/profile';
    case 'contributions': return '#/contributions';
    case 'following': return '#/following';
    case 'updates': return '#/updates';
    case 'artist':      return `#/artist/${encodeURIComponent(route.slug)}`;
    case 'user':        return `#/u/${encodeURIComponent(route.handle)}`;
    case 'join':        return `#/join/${encodeURIComponent(route.code)}`;
    case 'import':      return '#/import' + (route.from ? `?from=${encodeURIComponent(route.from)}` : '');
    case 'edit':        return `#/edit/${encodeURIComponent(route.id)}`;
    case 'song':        return `#/song/${encodeURIComponent(route.id)}`;
  }
}
