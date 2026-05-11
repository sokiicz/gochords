import { useEffect, useRef } from 'react';
import { drawChordDiagram, hasDiagram, type Instrument, type DiagramTheme } from '../lib/chords';
import { Icon } from './Icon';

interface Props {
  chord: string | null;
  instrument: Instrument;
  darkMode: boolean;
  onClose: () => void;
}

export function ChordDiagramPopup({ chord, instrument, darkMode, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawable = chord ? hasDiagram(chord, instrument) : false;

  useEffect(() => {
    if (!chord || !drawable || !canvasRef.current) return;
    const theme: DiagramTheme = darkMode
      ? { bg: '#1a1a1d', line: '#a3a3a8', text: '#f5f5f7', accent: '#7aa2f7', muted: '#a3a3a8' }
      : { bg: '#ffffff', line: '#222227', text: '#222227', accent: '#3b6cb8', muted: '#888' };
    drawChordDiagram(canvasRef.current, chord, instrument, theme);
  }, [chord, instrument, drawable, darkMode]);

  useEffect(() => {
    if (!chord) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chord, onClose]);

  if (!chord) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="diagram-popup" onClick={(e) => e.stopPropagation()}>
        <div className="diagram-header">
          <span className="diagram-name">{chord}</span>
          <span className="diagram-inst">{instrument}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {drawable ? (
          <canvas ref={canvasRef} className={`diagram-canvas ${instrument === 'piano' ? 'diagram-canvas-piano' : ''}`} />
        ) : (
          <div className="diagram-missing">No {instrument} diagram available for this chord yet.</div>
        )}
      </div>
    </div>
  );
}
