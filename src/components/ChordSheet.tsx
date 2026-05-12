import { memo } from 'react';
import type { Song } from '../lib/parser';

interface Props {
  song: Song;
  onChordClick: (chord: string) => void;
}

function ChordSheetImpl({ song, onChordClick }: Props) {
  return (
    <div className="sheet">
      {song.sections.map((section, si) => (
        <section key={si} className="sheet-section">
          {section.label && (
            <h3 className="sheet-section-label">
              {section.label}
              {section.annotation && (
                <span className="sheet-section-annotation"> {section.annotation}</span>
              )}
            </h3>
          )}
          {section.lines.map((line, li) => {
            if (line.kind === 'tab') {
              return (
                <pre key={li} className="sheet-tab" aria-label="Tablature">
                  {line.rows.join('\n')}
                </pre>
              );
            }
            const isBlank =
              line.units.length === 1 && line.units[0].chord === null && line.units[0].lyric === '';
            if (isBlank) return <div key={li} className="sheet-line sheet-line-blank" />;
            const cls = 'sheet-line' + (line.chordOnly ? ' sheet-line-chord-only' : '');
            return (
              <div key={li} className={cls}>
                {line.units.map((u, ui) => (
                  <span key={ui} className="unit">
                    <span className="unit-chord">
                      {u.chord && (
                        <button
                          type="button"
                          className="chord-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChordClick(u.chord!);
                          }}
                        >
                          {u.chord}
                        </button>
                      )}
                      {u.annot && <span className="unit-annot">{u.annot}</span>}
                    </span>
                    {!line.chordOnly && <span className="unit-lyric">{u.lyric || ' '}</span>}
                  </span>
                ))}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export const ChordSheet = memo(ChordSheetImpl);
