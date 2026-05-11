import { INSTRUMENTS, type Instrument } from '../lib/chords';
import { Icon } from './Icon';

interface Props {
  transpose: number;
  capo: number;
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

const wrap12 = (n: number) => ((n % 12) + 12) % 12;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function ControlsBar(p: Props) {
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
        <button className="step-btn" onClick={() => p.onTransposeChange(wrap12(p.transpose - 1))} aria-label="Transpose down">
          <Icon name="minus" size={14} />
        </button>
        <span className="control-value">{p.transpose === 0 ? '0' : `+${p.transpose}`}</span>
        <button className="step-btn" onClick={() => p.onTransposeChange(wrap12(p.transpose + 1))} aria-label="Transpose up">
          <Icon name="plus" size={14} />
        </button>
      </div>

      <div className="control-group">
        <span className="control-label">Capo</span>
        <select
          className="select"
          value={p.capo}
          onChange={(e) => p.onCapoChange(Number(e.target.value))}
        >
          {Array.from({ length: 8 }, (_, i) => (
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
