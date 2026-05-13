import { INSTRUMENTS, type Instrument } from '../lib/chords';
import { ALL_KEYS, effectiveKey, effectiveShift, keyDelta, parseRoot } from '../lib/transpose';
import type { DiagramSize } from '../lib/storage';
import { Icon } from './Icon';

interface Props {
  transpose: number;
  capo: number;
  defaultCapo: number;
  originalKey?: string;
  fontSize: 0 | 1 | 2;
  darkMode: boolean;
  scrollSpeed: number;
  scrollPlaying: boolean;
  instrument: Instrument;
  diagramSize: DiagramSize;
  stickyChords: boolean;
  simplify: boolean;
  onTransposeChange: (v: number) => void;
  onCapoChange: (v: number) => void;
  onFontSizeChange: (v: 0 | 1 | 2) => void;
  onDiagramSizeChange: (v: DiagramSize) => void;
  onToggleStickyChords: () => void;
  onToggleDark: () => void;
  onScrollSpeedChange: (v: number) => void;
  onToggleScroll: () => void;
  onInstrumentChange: (v: Instrument) => void;
  onToggleSimplify: () => void;
  onResetAll: () => void;
  onMenu: () => void;
  canReset: boolean;
}

const DIAGRAM_SIZES: DiagramSize[] = ['sm', 'md', 'lg'];
function nextDiagramSize(s: DiagramSize): DiagramSize {
  return DIAGRAM_SIZES[(DIAGRAM_SIZES.indexOf(s) + 1) % DIAGRAM_SIZES.length];
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const clampTranspose = (n: number) => clamp(n, -11, 11);

function isMinor(key: string): boolean {
  const p = parseRoot(key);
  return !!p && /^m(?!aj)/.test(p.suffix);
}

export function ControlsBar(p: Props) {
  const transposeLabel = p.transpose === 0 ? '0' : p.transpose > 0 ? `+${p.transpose}` : `${p.transpose}`;
  const shift = effectiveShift(p.transpose, p.capo, p.defaultCapo);
  const displayKey = effectiveKey(p.originalKey, shift);
  const keyPickerEnabled = !!p.originalKey;
  const sourceMinor = p.originalKey ? isMinor(p.originalKey) : false;
  const keyOptions = keyPickerEnabled
    ? ALL_KEYS.filter((k) => isMinor(k) === sourceMinor)
    : [];

  const capoTitle =
    p.defaultCapo > 0
      ? `Chords are written for capo ${p.defaultCapo}. Move the capo to re-shape; the sounding pitch stays the same.`
      : 'Choose a capo position. Chords re-shape so the sounding pitch stays the same.';

  return (
    <div className="controls">
      <button className="icon-btn menu-btn" onClick={p.onMenu} aria-label="Menu">
        <Icon name="menu" />
      </button>

      <div className="control-group">
        <span className="control-label">Instrument</span>
        <select
          className="select"
          aria-label="Instrument"
          value={p.instrument}
          onChange={(e) => p.onInstrumentChange(e.target.value as Instrument)}
        >
          {INSTRUMENTS.map((i) => (
            <option key={i.id} value={i.id}>{i.label}</option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <span className="control-label">Transpose</span>
        <button
          className="step-btn"
          onClick={() => p.onTransposeChange(clampTranspose(p.transpose - 1))}
          disabled={p.transpose <= -11}
          aria-label="Transpose down"
        >
          <Icon name="minus" size={14} />
        </button>
        <span className="control-value" aria-live="polite">{transposeLabel}</span>
        <button
          className="step-btn"
          onClick={() => p.onTransposeChange(clampTranspose(p.transpose + 1))}
          disabled={p.transpose >= 11}
          aria-label="Transpose up"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="control-group">
        <span className="control-label">Key</span>
        <select
          className="select"
          aria-label="Transpose to key"
          value={displayKey ?? ''}
          disabled={!keyPickerEnabled}
          onChange={(e) => {
            if (!p.originalKey) return;
            const target = e.target.value;
            if (!target) return;
            const desired = keyDelta(p.originalKey, target);
            // Solve effectiveShift(t, capo, defaultCapo) = desired  =>  t = desired + capo - defaultCapo
            p.onTransposeChange(clampTranspose(desired + p.capo - p.defaultCapo));
          }}
          title={keyPickerEnabled ? 'Transpose so the song plays in this key' : 'Set Original Key on the song to enable'}
        >
          {!keyPickerEnabled && <option value="">—</option>}
          {keyOptions.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <span className="control-label">Capo</span>
        <select
          className="select"
          aria-label="Capo position"
          value={p.capo}
          onChange={(e) => p.onCapoChange(Number(e.target.value))}
          title={capoTitle}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>{i === 0 ? 'None' : `Fret ${i}`}</option>
          ))}
        </select>
      </div>

      <button
        className={`pill-btn ${p.simplify ? 'pill-btn-on' : ''}`}
        onClick={p.onToggleSimplify}
        title="Reduce chords to their basic triad (S)"
      >
        Simplify
      </button>

      <button
        className="icon-btn"
        onClick={p.onResetAll}
        disabled={!p.canReset}
        title="Reset to the song's notation (R)"
        aria-label="Reset"
      >
        <Icon name="reset" />
      </button>

      <button
        className="pill-btn"
        onClick={() => p.onDiagramSizeChange(nextDiagramSize(p.diagramSize))}
        title="Cycle chord diagram size"
        aria-label={`Diagram size: ${p.diagramSize}. Click to change.`}
      >
        Diagrams {p.diagramSize === 'sm' ? 'S' : p.diagramSize === 'md' ? 'M' : 'L'}
      </button>

      <div className="control-group">
        <span className="control-label">A</span>
        <button
          className="step-btn"
          onClick={() => p.onFontSizeChange(Math.max(0, p.fontSize - 1) as 0 | 1 | 2)}
          disabled={p.fontSize === 0}
          aria-label="Decrease font size"
        >
          <Icon name="minus" size={14} />
        </button>
        <button
          className="step-btn"
          onClick={() => p.onFontSizeChange(Math.min(2, p.fontSize + 1) as 0 | 1 | 2)}
          disabled={p.fontSize === 2}
          aria-label="Increase font size"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="control-group control-scroll">
        <button className="play-btn" onClick={p.onToggleScroll} aria-label={p.scrollPlaying ? 'Pause auto-scroll' : 'Start auto-scroll'} title="Auto-scroll (Space)">
          <Icon name={p.scrollPlaying ? 'pause' : 'play'} size={16} />
        </button>
        <input
          type="range"
          className="speed-slider"
          min={1}
          max={50}
          step={1}
          value={p.scrollSpeed}
          onChange={(e) => p.onScrollSpeedChange(clamp(Number(e.target.value), 1, 50))}
          aria-label="Auto-scroll speed"
          title={`Speed ${p.scrollSpeed}`}
        />
      </div>

      <button
        className={`icon-btn ${p.stickyChords ? 'icon-btn-on' : ''}`}
        onClick={p.onToggleStickyChords}
        aria-pressed={p.stickyChords}
        aria-label="Pin chord strip while scrolling"
        title="Pin chord diagrams to the top while scrolling"
      >
        <Icon name="pin" size={14} />
      </button>

      <button className="icon-btn theme-btn" onClick={p.onToggleDark} aria-label="Toggle dark mode" title="Toggle theme">
        <Icon name={p.darkMode ? 'sun' : 'moon'} />
      </button>
    </div>
  );
}
