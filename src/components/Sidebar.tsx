import type { ReactNode } from 'react';
import { Icon } from './Icon';

export type SidebarTab = 'catalog' | 'library';

interface Props {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  search: string;
  onSearchChange: (s: string) => void;
  open: boolean;
  onImport: () => void;
  onClose: () => void;
  authSlot?: ReactNode;
  children: ReactNode;
}

export function Sidebar({ tab, onTabChange, search, onSearchChange, open, onImport, onClose, authSlot, children }: Props) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <h1 className="brand">GoChords</h1>
            {authSlot}
          </div>
          <button className="primary-btn" onClick={onImport} title="Import (⌘I)">
            <Icon name="plusCircle" size={16} /> Import song
          </button>
        </div>
        <nav className="sidebar-tabs" role="tablist">
          <button
            className={`sidebar-tab ${tab === 'catalog' ? 'sidebar-tab-active' : ''}`}
            onClick={() => onTabChange('catalog')}
            role="tab"
            aria-selected={tab === 'catalog'}
          >
            Catalog
          </button>
          <button
            className={`sidebar-tab ${tab === 'library' ? 'sidebar-tab-active' : ''}`}
            onClick={() => onTabChange('library')}
            role="tab"
            aria-selected={tab === 'library'}
          >
            My library
          </button>
        </nav>
        <div className="sidebar-search">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={tab === 'catalog' ? 'Search catalog…' : 'Search your library…'}
          />
        </div>
        <div className="sidebar-list">{children}</div>
      </aside>
    </>
  );
}
