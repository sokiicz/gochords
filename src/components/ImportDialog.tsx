import { useEffect, useRef, useState } from 'react';
import type { Visibility } from '../lib/supabase';
import { Icon } from './Icon';

export interface SongDraft {
  id?: string;
  title: string;
  artist: string;
  originalKey: string;
  source: string;
  visibility: Visibility;
}

interface Props {
  open: boolean;
  initial?: SongDraft | null;
  /** When true, the visibility checkbox is enabled (signed-in user). */
  cloudWritable: boolean;
  onCancel: () => void;
  onSubmit: (data: SongDraft) => void;
  onDelete?: (id: string) => void;
}

const empty: SongDraft = { title: '', artist: '', originalKey: '', source: '', visibility: 'public' };

const same = (a: SongDraft, b: SongDraft) =>
  a.title === b.title &&
  a.artist === b.artist &&
  a.originalKey === b.originalKey &&
  a.source === b.source &&
  a.visibility === b.visibility;

export function ImportDialog({ open, initial, cloudWritable, onCancel, onSubmit, onDelete }: Props) {
  const [draft, setDraft] = useState<SongDraft>(initial ?? empty);
  const baselineRef = useRef<SongDraft>(initial ?? empty);

  useEffect(() => {
    if (open) {
      const base = initial ?? empty;
      setDraft(base);
      baselineRef.current = base;
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (draft.title.trim() && draft.source.trim()) {
          onSubmit({
            id: initial?.id,
            title: draft.title.trim(),
            artist: draft.artist.trim(),
            originalKey: draft.originalKey.trim(),
            source: draft.source,
            visibility: draft.visibility,
          });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, draft, initial, onSubmit]);

  if (!open) return null;
  const isEdit = !!initial?.id;
  const dirty = !same(draft, baselineRef.current);

  const requestCancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    onCancel();
  };

  const submit = () => {
    if (!draft.title.trim() || !draft.source.trim()) return;
    onSubmit({
      id: initial?.id,
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      originalKey: draft.originalKey.trim(),
      source: draft.source,
      visibility: draft.visibility,
    });
  };

  return (
    <div className="modal-backdrop" onClick={requestCancel}>
      <div className="import-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="import-header">
          <h2>{isEdit ? 'Edit song' : 'Import song'}</h2>
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
          <button className="icon-btn" onClick={requestCancel} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="import-row">
          <label>
            Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Song title" autoFocus />
          </label>
          <label>
            Artist
            <input value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} placeholder="Artist" />
          </label>
          <label>
            Key
            <input value={draft.originalKey} onChange={(e) => setDraft({ ...draft, originalKey: e.target.value })} placeholder="e.g. G, Em, Bb" />
          </label>
        </div>
        <textarea
          value={draft.source}
          onChange={(e) => setDraft({ ...draft, source: e.target.value })}
          placeholder="Paste chord sheet here. Supports [Am]inline, {Am} / (Am), chord-above-lyric, and tab blocks."
          rows={14}
          spellCheck={false}
        />
        {cloudWritable && (
          <div className="visibility-row">
            <label className="visibility-toggle">
              <input
                type="checkbox"
                checked={draft.visibility === 'public'}
                onChange={(e) => setDraft({ ...draft, visibility: e.target.checked ? 'public' : 'private' })}
              />
              <span>
                <strong>Publish to catalog</strong>
                <small>{draft.visibility === 'public'
                  ? 'Everyone will see and can fork this song.'
                  : 'Stays in your library only. You can publish later.'}</small>
              </span>
            </label>
          </div>
        )}
        <div className="import-footer">
          {isEdit && onDelete && initial?.id && (
            <button
              className="ghost-btn danger"
              onClick={() => {
                if (confirm(`Delete "${initial.title}"?`)) onDelete(initial.id!);
              }}
            >
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <span className="hint">⌘↵ to save</span>
          <button className="ghost-btn" onClick={requestCancel}>Cancel</button>
          <button className="primary-btn" onClick={submit} disabled={!draft.title.trim() || !draft.source.trim() || (isEdit && !dirty)}>
            {isEdit ? 'Save' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
