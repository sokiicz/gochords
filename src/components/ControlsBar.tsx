import { INSTRUMENTS, type Instrument } from '../lib/chords';
import { ALL_KEYS, keyDelta } from '../lib/transpose';
import { Icon } from './Icon';

interface Props {
  transpose: number;
  capo: number;
  defaultCapo: number;
  originalKey?: string;
  displayKey: string | null;
  fontSize: 0 | 1 | 2;
  darkMode: boolean;
  scrollSpeed: number;
  scrollPlaying: boolean;
  instrument: Instrument;
  simplify: boolean;
  onTransposeChange: (v: number) => void;
  onCapoChange: (v: number) => void;
  onFontSizeChange: (v: 0 | 1 | 2) => void;
  onToggleDark: () => void;
  onScrollSpeedChange: (v: number) => void;
  onToggleScroll: () => void;
  onInstrumentChange: (v: Instrument) => void;
  onToggleSimplify: () => void;
  onResetAll: () => void;
  onMenu: () => void;
  canReset: boolean;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const clampTranspose = (n: number) => clamp(n, -11, 11);

export function ControlsBar(p: Props) {
  const transposeLabel = p.transpose === 0 ? '0' : p.transpose > 0 ? `+${p.transpose}` : `${p.transpose}`;
  const keysForPicker = ALL_KEYS;
  const keyPickerEnabled = !!p.originalKey;

  return (
    <div className="controls">
      <button className="icon-btn menu-btn" onClick={p.onMenu} aria-label="Menu">
        <Icon name="menu" />
      </button>

      <div className="control-group">
        <span className="control-label">Instrument</span>
        <select
          className="select"
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
        <span className="control-value">{transposeLabel}</span>
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
          value={p.displayKey ?? ''}
          disabled={!keyPickerEnabled}
          onChange={(e) => {
            if (!p.originalKey) return;
            const target = e.target.value;
            if (!target) return;
            // Solve: effectiveShift(transpose, capo, defaultCapo) = keyDelta(original, target)
            // => transpose = delta - (defaultCapo - capo)
            const desired = keyDelta(p.originalKey, target);
            const next = clampTranspose(desired - (p.defaultCapo - p.capo));
            p.onTransposeChange(next);
          }}
          title={keyPickerEnabled ? 'Transpose to key' : 'Original key unknown — set it on the song'}
        >
          {!keyPickerEnabled && <option value="">—</option>}
          {keysForPicker.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <span className="control-label">Capo</span>
        <select
          className="select"
          value={p.capo}
          onChange={(e) => p.onCapoChange(Number(e.target.value))}
          title={`Default capo for this song: ${p.defaultCapo}`}
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
        title="Reset transpose, capo, and simplify (R)"
        aria-label="Reset"
      >
        <Icon name="reset" />
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
        <button className="play-btn" onClick={p.onToggleScroll} aria-label="Toggle auto-scroll" title="Auto-scroll (Space)">
          <Icon name={p.scrollPlaying ? 'pause' : 'play'} size={16} />
        </button>
        <span className="control-label">Speed</span>
        <button
          className="step-btn"
          onClick={() => p.onScrollSpeedChange(clamp(p.scrollSpeed - 1, 1, 10))}
          disabled={p.scrollSpeed <= 1}
          aria-label="Slower"
        >
          <Icon name="minus" size={14} />
        </button>
        <span className="control-value">{p.scrollSpeed}</span>
        <button
          className="step-btn"
          onClick={() => p.onScrollSpeedChange(clamp(p.scrollSpeed + 1, 1, 10))}
          disabled={p.scrollSpeed >= 10}
          aria-label="Faster"
        >
          <Icon name="plus" size={14} />
        </button>
      </div>

      <button className="icon-btn theme-btn" onClick={p.onToggleDark} aria-label="Toggle dark mode" title="Toggle theme">
        <Icon name={p.darkMode ? 'sun' : 'moon'} />
      </button>
    </div>
  );
}
