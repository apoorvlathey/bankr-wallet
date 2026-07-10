import { useMemo, useState } from "react";
import {
  mascotPresets,
  mascotStateOrder,
  WalletChanMascot,
  type MascotState,
  type MascotStateName,
} from "./mascot";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatState(state: MascotState) {
  return JSON.stringify(
    {
      mood: state.mood,
      action: state.action,
      intensity: Number(state.intensity.toFixed(2)),
      gaze: [Number(state.gazeX.toFixed(2)), Number(state.gazeY.toFixed(2))],
      accessory: state.accessory,
      reducedMotion: state.reducedMotion,
    },
    null,
    2,
  );
}

export default function App() {
  const [stateName, setStateName] = useState<MascotStateName>("idle");
  const [intensity, setIntensity] = useState(mascotPresets.idle.state.intensity);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [followPointer, setFollowPointer] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const preset = mascotPresets[stateName];
  const state = useMemo<MascotState>(
    () => ({
      ...preset.state,
      intensity,
      gazeX: followPointer ? gaze.x : preset.state.gazeX,
      gazeY: followPointer ? gaze.y : preset.state.gazeY,
      reducedMotion,
    }),
    [followPointer, gaze.x, gaze.y, intensity, preset, reducedMotion],
  );

  function chooseState(nextState: MascotStateName) {
    setStateName(nextState);
    setIntensity(mascotPresets[nextState].state.intensity);
    setReplayKey((value) => value + 1);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!followPointer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setGaze({
      x: clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1),
      y: clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1),
    });
  }

  return (
    <div className="app-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <p className="eyebrow">Experimental character system</p>
            <h1>WalletChan Mascot Lab</h1>
          </div>
        </div>
        <div className="header-note">
          <span className="status-dot" />
          Approved layered-art pilot
        </div>
      </header>

      <main className="lab-main">
        <section className="hero-lab" aria-labelledby="character-stage-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Character stage</p>
              <h2 id="character-stage-title">One mascot, semantic behaviors</h2>
            </div>
            <button
              className="replay-button"
              type="button"
              onClick={() => setReplayKey((value) => value + 1)}
            >
              Replay motion
            </button>
          </div>

          <div
            className="character-stage"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setGaze({ x: 0, y: 0 })}
          >
            <div className="stage-grid" aria-hidden="true" />
            <div className="amber-orbit amber-orbit--large" aria-hidden="true" />
            <div className="amber-orbit amber-orbit--small" aria-hidden="true" />
            <WalletChanMascot state={state} replayKey={replayKey} />
            <div className="stage-caption">
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </div>
          </div>

          <div className="state-controls" aria-label="Mascot states">
            {mascotStateOrder.map((name) => (
              <button
                key={name}
                type="button"
                className={name === stateName ? "state-button is-active" : "state-button"}
                aria-pressed={name === stateName}
                onClick={() => chooseState(name)}
              >
                <span className={`state-glyph state-glyph--${name}`} aria-hidden="true" />
                {mascotPresets[name].label}
              </button>
            ))}
          </div>
        </section>

        <aside className="control-rail" aria-label="Mascot controls and state output">
          <section className="control-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Runtime contract</p>
                <h2>Steer the performance</h2>
              </div>
              <span className="live-chip">Live</span>
            </div>

            <label className="range-control">
              <span>
                <strong>Intensity</strong>
                <output>{Math.round(intensity * 100)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </label>

            <label className="toggle-row">
              <span>
                <strong>Follow pointer</strong>
                <small>Maps pointer position to semantic gaze.</small>
              </span>
              <input
                type="checkbox"
                checked={followPointer}
                onChange={(event) => setFollowPointer(event.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <span>
                <strong>Reduced motion</strong>
                <small>Freezes non-essential character movement.</small>
              </span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
              />
            </label>

            <pre className="state-output" aria-label="Current semantic mascot state">
              <code>{formatState(state)}</code>
            </pre>
          </section>

          <section className="layer-panel">
            <p className="section-kicker">Named artwork layers</p>
            <h2>Prepared for rigging</h2>
            <div className="layer-list">
              {["Neutral face base", "Open eye pair", "Closed eye pair", "Mouth library", "Manpu effect", "Semantic contract"].map(
                (layer, index) => (
                  <div className="layer-row" key={layer}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{layer}</strong>
                    <i aria-hidden="true" />
                  </div>
                ),
              )}
            </div>
          </section>
        </aside>

        <section className="product-preview" aria-labelledby="product-preview-title">
          <div className="section-heading section-heading--preview">
            <div>
              <p className="section-kicker">Product reality check</p>
              <h2 id="product-preview-title">Extension-sized unlock moment</h2>
            </div>
            <p>Same character API, intentionally quieter motion.</p>
          </div>

          <div className="preview-workbench">
            <div className="wallet-frame">
              <header className="wallet-header">
                <strong>WALLETCHAN</strong>
                <button type="button" aria-label="Open menu">☰</button>
              </header>
              <div className="wallet-content">
                <WalletChanMascot
                  className="wallet-mascot"
                  state={{ ...state, intensity: Math.min(state.intensity, 0.4) }}
                  replayKey={replayKey}
                  label="WalletChan unlock mascot"
                />
                <h3>Enter password to unlock</h3>
                <label className="wallet-field">
                  <span className="sr-only">Password</span>
                  <input type="password" placeholder="Password" />
                  <b aria-hidden="true">◉</b>
                </label>
                <button className="wallet-unlock" type="button">Unlock</button>
                <button className="wallet-biometric" type="button">
                  <span aria-hidden="true">◎</span>
                  Use biometric unlock
                </button>
              </div>
            </div>

            <div className="preview-notes">
              <span className="note-number">01</span>
              <div>
                <h3>Canonical art stays intact</h3>
                <p>The immutable face base preserves the silhouette, bow, warm palette, sparkles, and intended pixel texture while approved expression layers swap above it.</p>
              </div>
              <span className="note-number">02</span>
              <div>
                <h3>Motion communicates state</h3>
                <p>The mascot settles during reading and saves expressive movement for attention, success, or recovery.</p>
              </div>
              <span className="note-number">03</span>
              <div>
                <h3>Ready for a real Rive pass</h3>
                <p>The named face, eye, mouth, and Manpu layers now provide a concrete editor hierarchy instead of asking an animator to reconstruct the character.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
