import { useEffect, useRef } from 'react';
import { drawChordDiagram, hasDiagram, type Instrument, type DiagramTheme } from '../lib/chords';
import type { DiagramSize } from '../lib/storage';

interface Props {
  chords: string[];
  instrument: Instrument;
  darkMode: boolean;
  size?: DiagramSize;
  sticky?: boolean;
  onChordClick: (chord: string) => void;
}

export function UsedChordsStrip({ chords, instrument, darkMode, size = 'md', sticky = false, onChordClick }: Props) {
  if (chords.length === 0) return null;
  const cls = ['chords-strip', `chords-strip-${size}`, sticky ? 'chords-strip-sticky' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} role="region" aria-label="Chords used in this song">
      <div className="chords-strip-inner">
        {chords.map((c) => (
          <ChordTile
            key={c}
            chord={c}
            instrument={instrument}
            darkMode={darkMode}
            onClick={() => onChordClick(c)}
          />
        ))}
      </div>
    </div>
  );
}

function ChordTile({
  chord,
  instrument,
  darkMode,
  onClick,
}: {
  chord: string;
  instrument: Instrument;
  darkMode: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const has = hasDiagram(chord, instrument);

  useEffect(() => {
    if (!canvasRef.current || !has) return;
    const theme: DiagramTheme = darkMode
      ? { bg: '#1d1d24', line: '#a3a3a8', text: '#f5f5f7', accent: '#7aa2f7', muted: '#a3a3a8' }
      : { bg: '#ffffff', line: '#444', text: '#222', accent: '#3b6cb8', muted: '#888' };
    drawChordDiagram(canvasRef.current, chord, instrument, theme);
  }, [chord, instrument, darkMode, has]);

  return (
    <button type="button" className="chord-tile" onClick={onClick} aria-label={`Show ${chord} diagram`}>
      <span className="chord-tile-name">{chord}</span>
      {has ? (
        <canvas ref={canvasRef} className="chord-tile-canvas" />
      ) : (
        <div className="chord-tile-missing">—</div>
      )}
    </button>
  );
}
