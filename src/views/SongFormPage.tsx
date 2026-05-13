import { useEffect, useMemo, useState } from 'react';
import { parse } from '../lib/parser';
import { Icon } from '../components/Icon';
import { ChordSheet } from '../components/ChordSheet';
import type { Visibility } from '../lib/supabase';
import type { Song } from '../lib/songModel';
import { navigateBack } from '../lib/router';
import { fetchArtistList } from '../lib/cloudSongs';
import { cloudEnabled } from '../lib/supabase';

export interface SongFormDraft {
  id?: string;
  title: string;
  artist: string;
  originalKey: string;
  defaultCapo: number;
  tempo: string;          // string in form, parsed on submit
  tags: string;           // comma-separated in form
  source: string;
  visibility: Visibility;
}

const empty: SongFormDraft = {
  title: '', artist: '', originalKey: '', defaultCapo: 0, tempo: '', tags: '', source: '', visibility: 'public',
};

const fromSong = (s: Song): SongFormDraft => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  originalKey: s.originalKey ?? '',
  defaultCapo: s.defaultCapo,
  tempo: s.tempo ? String(s.tempo) : '',
  tags: (s.tags ?? []).join(', '),
  source: s.source,
  visibility: s.visibility === 'local' ? 'private' : s.visibility,
});

interface Props {
  mode: 'import' | 'edit';
  initial?: Song | null;
  cloudWritable: boolean;
  onSubmit: (draft: SongFormDraft) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
}

export function SongFormPage({ mode, initial, cloudWritable, onSubmit, onDelete, onCancel }: Props) {
  const [draft, setDraft] = useState<SongFormDraft>(initial ? fromSong(initial) : empty);
  const [showHelp, setShowHelp] = useState(false);
  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!cloudEnabled) return;
    fetchArtistList().then(setArtistSuggestions).catch(() => {});
  }, []);

  useEffect(() => {
    if (initial) setDraft(fromSong(initial));
  }, [initial]);

  // Live preview — parse the source as the user types.
  const previewSong = useMemo(() => {
    if (!draft.source.trim()) return null;
    try { return parse(draft.source); } catch { return null; }
  }, [draft.source]);

  const titleErr = !draft.title.trim();
  const sourceErr = !draft.source.trim();
  const tempoErr = draft.tempo && (isNaN(Number(draft.tempo)) || Number(draft.tempo) < 30 || Number(draft.tempo) > 300);
  const valid = !titleErr && !sourceErr && !tempoErr;

  const set = <K extends keyof SongFormDraft>(k: K, v: SongFormDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    if (!valid) return;
    onSubmit(draft);
  };

  // ⌘/Ctrl+Enter saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        if (!(document.activeElement instanceof HTMLTextAreaElement)) onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page form-page">
      <div className="form-page-header">
        <button className="ghost-btn back-btn" onClick={() => navigateBack()}>← Back</button>
        <h1>{mode === 'edit' ? 'Edit song' : 'Add a song'}</h1>
        <span style={{ flex: 1 }} />
        {mode === 'edit' && onDelete && initial?.id && (
          <button
            className="ghost-btn danger"
            onClick={() => { if (confirm(`Delete "${initial.title}"?`)) onDelete(initial.id!); }}
          >
            <Icon name="trash" size={14} /> Delete
          </button>
        )}
        <button className="ghost-btn" onClick={onCancel}>Cancel</button>
        <button className="primary-btn" onClick={submit} disabled={!valid}>
          {mode === 'edit' ? 'Save changes' : (cloudWritable && draft.visibility === 'public' ? 'Publish' : 'Save')}
        </button>
      </div>

      <div className="form-grid">
        <section className="form-fields">
          <div className="form-row">
            <label className={titleErr ? 'has-err' : ''}>
              <span>Title <em>*</em></span>
              <input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Wonderwall" autoFocus />
            </label>
            <label>
              <span>Artist</span>
              <input
                value={draft.artist}
                onChange={(e) => set('artist', e.target.value)}
                placeholder="e.g. Oasis (or 'Oasis ft. Noel Gallagher')"
                list="artist-suggestions"
                autoComplete="off"
              />
              <datalist id="artist-suggestions">
                {artistSuggestions.map((a) => <option key={a} value={a} />)}
              </datalist>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Original key</span>
              <input value={draft.originalKey} onChange={(e) => set('originalKey', e.target.value)} placeholder="e.g. G, Em, Bb" />
            </label>
            <label>
              <span>Default capo</span>
              <select value={draft.defaultCapo} onChange={(e) => set('defaultCapo', Number(e.target.value))}>
                {Array.from({ length: 13 }, (_, i) => (
                  <option key={i} value={i}>{i === 0 ? 'No capo' : `Fret ${i}`}</option>
                ))}
              </select>
            </label>
            <label className={tempoErr ? 'has-err' : ''}>
              <span>Tempo (BPM)</span>
              <input value={draft.tempo} onChange={(e) => set('tempo', e.target.value)} placeholder="e.g. 120" inputMode="numeric" />
            </label>
          </div>

          <label>
            <span>Tags <em className="hint-em">(comma separated)</em></span>
            <input value={draft.tags} onChange={(e) => set('tags', e.target.value)} placeholder="e.g. rock, 90s, easy" />
          </label>

          <label className={sourceErr ? 'has-err' : ''}>
            <div className="source-label">
              <span>Chord sheet <em>*</em></span>
              <button type="button" className="text-btn" onClick={() => setShowHelp((v) => !v)}>
                {showHelp ? 'Hide format help' : 'Format help'}
              </button>
            </div>
            <textarea
              value={draft.source}
              onChange={(e) => set('source', e.target.value)}
              placeholder="Paste lyrics with chords here…"
              rows={20}
              spellCheck={false}
            />
          </label>

          {showHelp && <FormatHelp />}

          {cloudWritable && (
            <fieldset className="form-visibility">
              <legend>Visibility</legend>
              <label className="radio">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={draft.visibility === 'public'}
                  onChange={() => set('visibility', 'public')}
                />
                <div>
                  <strong>Public — share with everyone</strong>
                  <small>Lands in the catalog. Others can browse, fork, and add to playlists.</small>
                </div>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={draft.visibility === 'private'}
                  onChange={() => set('visibility', 'private')}
                />
                <div>
                  <strong>Private — only me</strong>
                  <small>Stays in your library. You can change this later.</small>
                </div>
              </label>
            </fieldset>
          )}

          {!cloudWritable && (
            <div className="banner banner-info">
              You aren't signed in — the song will be saved on this device only.
              <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 12 }}>
                Sign in later to sync.
              </span>
            </div>
          )}
        </section>

        <aside className="form-preview">
          <h3>Live preview</h3>
          {previewSong ? (
            <div className="preview-frame">
              <ChordSheet song={previewSong} onChordClick={() => {}} />
            </div>
          ) : (
            <div className="preview-empty">
              Paste chord sheet text on the left to see how it will render.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function FormatHelp() {
  return (
    <div className="format-help">
      <h4>Supported formats</h4>
      <ul>
        <li><strong>Inline chords:</strong> <code>[Am]Hello [G]world</code> — square brackets, curly braces, or parentheses.</li>
        <li><strong>Chord above lyrics:</strong> chord line aligned by character position over the lyrics line.
          <pre>{`G       D        Em\nHey there friend, hello`}</pre>
        </li>
        <li><strong>Section labels:</strong> <code>[Verse 1]</code>, <code>[Chorus]</code>, <code>[Bridge]</code> on their own line.</li>
        <li><strong>Tab blocks:</strong> consecutive rows like <code>e|--0--3--|</code> are detected and rendered as tab.</li>
      </ul>
      <p className="hint">Mix any of the above. The live preview on the right updates as you type.</p>
    </div>
  );
}
