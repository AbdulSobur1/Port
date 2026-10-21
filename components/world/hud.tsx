'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RouteGraph } from '@/lib/geo/graph';
import { destinationByZone, destinations, dossierFor } from '@/lib/world/destinations';
import { MapPanel } from './map-panel';
import { VehicleSelect } from './vehicle-select';
import { cancelNavigation, navigateTo } from './navigation';
import { DEFAULT_VEHICLE_ID, vehicleById } from '@/lib/world/vehicles';
import {
  auto,
  getTelemetry,
  getUi,
  input,
  openDestination,
  resetAuto,
  runtime,
  setUi,
  storedVehicleId,
  toast,
  touchInput,
  useTelemetry,
  useUi,
} from './store';

/* ------------------------------------------------------------------ */
/* Keyboard                                                            */
/* ------------------------------------------------------------------ */

export function useKeyboardControls(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') input.forward = true;
      if (key === 's' || key === 'arrowdown') input.reverse = true;
      if (key === 'a' || key === 'arrowleft') input.left = true;
      if (key === 'd' || key === 'arrowright') input.right = true;
      if (key === ' ') input.brake = true;
      if (['w', 'a', 's', 'd', ' '].includes(key) && key !== ' ') event.preventDefault();
      if (key === 'e') {
        const zone = getUi().nearby;
        if (zone) openDestination(zone);
      }
      if (key === 'r') resetCar();
      if (key === 'm') setUi({ mapOpen: !getUi().mapOpen, mapExpanded: false });
      if (key === 'escape') {
        if (getUi().vehicleSelect && storedVehicleId()) setUi({ vehicleSelect: false });
        else if (getUi().panel) setUi({ panel: null });
        else if (getUi().mapOpen) setUi({ mapOpen: false });
        else if (getUi().autopilot?.status === 'driving') cancelNavigation('Autopilot cancelled.');
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') input.forward = false;
      if (key === 's' || key === 'arrowdown') input.reverse = false;
      if (key === 'a' || key === 'arrowleft') input.left = false;
      if (key === 'd' || key === 'arrowright') input.right = false;
      if (key === ' ') input.brake = false;
    };
    const blur = () => {
      Object.assign(input, { forward: false, reverse: false, brake: false, left: false, right: false });
      Object.assign(touchInput, { throttle: 0, brake: 0, steer: 0, active: false });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      blur();
    };
  }, [enabled]);
}

export function resetCar() {
  const rt = runtime.current;
  if (!rt || !rt.world.spawn) return;
  rt.car.x = rt.world.spawn.x;
  rt.car.z = rt.world.spawn.z;
  rt.car.yaw = rt.world.spawn.yaw;
  rt.car.speed = 0;
  rt.car.steer = 0;
  resetAuto();
  setUi({ panel: null, autopilot: null, nearby: null });
  toast('Returned to the arrival point.');
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function TopBar() {
  const { mapOpen, autopilot, rail, vehicleId } = useUi();
  const { speed } = useTelemetry();
  const vehicle = vehicleById(vehicleId);

  return (
    <header className="hud-top">
      <div className="hud-brand">
        <span className="hud-brand__mark">SOBURR</span>
        <span className="hud-brand__sub">Lagos Island / Glover</span>
      </div>

      <div className="hud-top__center">
        <button
          className="hud-pill"
          onClick={() => setUi({ rail: !rail })}
          aria-expanded={rail}
          aria-controls="destination-rail"
        >
          <span className="hud-pill__dot" />
          Destinations
          <span className="hud-pill__count">{destinations.length}</span>
        </button>
        {autopilot?.status === 'driving' && (
          <button className="hud-pill hud-pill--warn" onClick={() => cancelNavigation('Autopilot cancelled.')}>
            Autopilot · {autopilot.label} · cancel
          </button>
        )}
      </div>

      <div className="hud-top__right">
        <span className="hud-speed" aria-label={`${Math.round(speed * 3.6)} kilometres per hour`}>
          {String(Math.round(speed * 3.6)).padStart(2, '0')}
          <small>km/h</small>
        </span>
        <button
          className="hud-car"
          onClick={() => setUi({ vehicleSelect: true, mapOpen: false })}
          aria-label={`Change car (current: ${vehicle.make} ${vehicle.model})`}
        >
          <span style={{ background: vehicle.paint.base }} aria-hidden />
          <span className="hud-car__text">
            <strong>{vehicle.model}</strong>
            <small>change car</small>
          </span>
        </button>
        <button
          className="hud-icon"
          onClick={() => setUi({ mapOpen: !mapOpen, mapExpanded: false })}
          aria-label={mapOpen ? 'Hide map' : 'Show map'}
          aria-pressed={mapOpen}
        >
          <span aria-hidden>◎</span>
        </button>
        <Link className="hud-icon" href="/work/bytebank" aria-label="Open the latest case record">
          <span aria-hidden>↗</span>
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Destination rail                                                    */
/* ------------------------------------------------------------------ */

function DestinationRail({ graph }: { graph: RouteGraph | null }) {
  const { nearby, autopilot, rail } = useUi();
  const rt = runtime.current;

  if (!rail) return null;
  return (
    <aside className="rail" id="destination-rail" aria-label="Destinations">
      <header className="rail__head">
        <p className="rail__eyebrow">Drive or inspect</p>
        <button className="rail__close" onClick={() => setUi({ rail: false })} aria-label="Close destinations">✕</button>
      </header>
      <ol className="rail__list">
        {destinations.map((dest, index) => {
          const station = rt?.stations.find((s) => s.zone === dest.zone);
          const isNear = nearby === dest.zone;
          const isTarget = autopilot?.zone === dest.zone && autopilot.status === 'driving';
          return (
            <li key={dest.zone} data-active={isNear || isTarget}>
              <button
                className="rail__item"
                onClick={() => openDestination(dest.zone)}
                aria-label={`Inspect ${dest.label}`}
              >
                <span className="rail__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="rail__text">
                  <strong>{dest.label}</strong>
                  <small>{station?.road ?? dest.sub}</small>
                </span>
                <span className="rail__swatch" style={{ background: dest.color }} />
              </button>
              <button
                className="rail__drive"
                onClick={() => station && graph && navigateTo(dest.zone, graph, rt?.stations ?? [])}
                aria-label={`Drive to ${dest.label}`}
                disabled={!station || !graph}
              >
                Drive
              </button>
            </li>
          );
        })}
      </ol>
      <footer className="rail__foot">
        <button className="world-button" onClick={resetCar}>Return to arrival</button>
      </footer>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Dossier sheet                                                       */
/* ------------------------------------------------------------------ */

function DossierSheet({ zone, graph }: { zone: string; graph: RouteGraph | null }) {
  const dossier = dossierFor(zone);
  const ref = useRef<HTMLDivElement | null>(null);
  const dest = destinationByZone(zone);
  const rt = runtime.current;

  useEffect(() => {
    ref.current?.focus();
  }, [zone]);

  if (!dossier) return null;
  const station = rt?.stations.find((s) => s.zone === zone);

  return (
    <div className="dossier-backdrop" onClick={() => setUi({ panel: null })}>
      <aside
        className="dossier"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={{ ['--accent' as string]: dest?.color ?? '#d8f851' }}
      >
        <header className="dossier__head">
          <p className="dossier__eyebrow">{dossier.eyebrow}</p>
          <button className="dossier__close" onClick={() => setUi({ panel: null })} aria-label="Close">✕</button>
        </header>
        <h1 id="dossier-title">{dossier.title}</h1>
        <p className="dossier__lede">{dossier.lede}</p>

        {station && (
          <p className="dossier__place">
            <span aria-hidden>◉</span> Station on {station.road ?? 'an unnamed service road'} · {station.roadClass}
          </p>
        )}

        {dossier.facts && (
          <dl className="dossier__facts">
            {dossier.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {dossier.body?.map((paragraph) => (
          <p className="dossier__copy" key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}

        {dossier.tags && (
          <ul className="dossier__tags">
            {dossier.tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        )}

        <div className="dossier__actions">
          {dossier.primaryHref && (
            <Link className="world-button world-button--primary" href={dossier.primaryHref}>
              {dossier.primaryLabel}
            </Link>
          )}
          {dossier.externalHref && (
            <a className="world-button world-button--primary" href={dossier.externalHref} target="_blank" rel="noreferrer">
              Open GitHub profile
            </a>
          )}
          {station && graph && (
            <button
              className="world-button"
              onClick={() => navigateTo(zone, graph, rt?.stations ?? [])}
            >
              Drive here
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prompts, intro, speed strip                                         */
/* ------------------------------------------------------------------ */

function PromptBar() {
  const { nearby, panel, autopilot, mapOpen } = useUi();
  const telemetry = useTelemetry();
  if (panel) return null;

  if (autopilot?.status === 'planning') {
    return <p className="prompt" aria-live="polite">Planning a road route to {autopilot.label}…</p>;
  }
  if (autopilot?.status === 'failed') {
    return (
      <p className="prompt prompt--error" role="alert">
        No route to {autopilot.label}. {autopilot.message}
        <button onClick={() => setUi({ autopilot: null })}>Dismiss</button>
      </p>
    );
  }
  if (autopilot?.status === 'driving') {
    const remaining = Math.round(getTelemetry().routeRemaining);
    const stateLabel: Record<string, string> = {
      SLOW_DOWN: 'slowing down',
      STOP_FOR_OBSTACLE: 'stopping for an obstruction',
      WAIT_OR_REPLAN: 'waiting / re-planning',
      REVERSE_RECOVERY: 'reversing to a clear position',
      REORIENT: 'rejoining the route',
      RESUME_ROUTE: 'resuming route',
      SAFE_FAILURE: 'stopped — manual intervention needed',
    };
    const note = autopilot.message ?? (autopilot.state ? stateLabel[autopilot.state] : null);
    return (
      <p className="prompt" aria-live="polite">
        Autopilot → {autopilot.label}{remaining > 0 ? ` · ${remaining} m` : ''}
        {note ? ` · ${note}` : ''} · any input takes over
      </p>
    );
  }
  if (autopilot?.status === 'arrived') {
    return <p className="prompt" aria-live="polite">Arrived at {autopilot.label}.</p>;
  }
  if (nearby) {
    const dest = destinationByZone(nearby);
    return (
      <p className="prompt" aria-live="polite">
        {dest?.label ?? nearby} · press <kbd>E</kbd> to inspect · <kbd>M</kbd> for the map
      </p>
    );
  }
  if (mapOpen) return null;
  return (
    <p className="prompt prompt--quiet">
      {telemetry.road ? <>On <strong>{telemetry.road}</strong> · </> : null}
      <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>M</kbd> map · <kbd>R</kbd> reset
    </p>
  );
}

function Intro() {
  const { intro } = useUi();
  if (!intro) return null;
  return (
    <div className="intro">
      <div className="intro__card">
        <p className="dossier__eyebrow">Soburr / interactive portfolio</p>
        <h1>Lagos Island, at street scale.</h1>
        <p>
          A real neighbourhood built from OpenStreetMap data: {''}
          <strong>real streets, real building footprints</strong>, one drivable world. Pick a
          destination, drive there, or let the autopilot follow the road network.
        </p>
        <ul className="intro__keys">
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive</li>
          <li><kbd>E</kbd> inspect</li>
          <li><kbd>M</kbd> map</li>
          <li><kbd>R</kbd> reset</li>
        </ul>
        <div className="intro__actions">
          <button className="world-button world-button--primary" onClick={() => setUi({ intro: false })}>
            Start driving
          </button>
          <button
            className="world-button"
            onClick={() => {
              setUi({ intro: false });
              openDestination('about');
            }}
          >
            Browse the work
          </button>
        </div>
        <p className="intro__note">Data © OpenStreetMap contributors (ODbL). World and tiles built from the 2026-10-15 snapshot.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Touch controls                                                      */
/* ------------------------------------------------------------------ */

function TouchControls() {
  const { touch, panel, intro, mapOpen } = useUi();
  const [steer, setSteerState] = useState(0);
  const [throttle, setThrottleState] = useState(0);

  if (!touch || panel || intro || mapOpen) return null;

  const press = (setter: (v: number) => void, apply: (v: number) => void) => (value: number) => {
    setter(value);
    apply(value);
    touchInput.active = value !== 0;
  };

  const steerTo = press(setSteerState, (v) => { touchInput.steer = v; });
  const throttleTo = press(setThrottleState, (v) => { touchInput.throttle = v; });
  const brakeTo = press(setThrottleState, (v) => { touchInput.brake = v; });

  return (
    <div className="touch" aria-hidden={false}>
      <div className="touch__steer">
        <button
          aria-label="Steer left"
          className={steer < 0 ? 'is-active' : ''}
          onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); steerTo(-1); }}
          onPointerUp={() => steerTo(0)}
          onPointerCancel={() => steerTo(0)}
          onPointerLeave={() => steerTo(0)}
        >
          ◀
        </button>
        <button
          aria-label="Steer right"
          className={steer > 0 ? 'is-active' : ''}
          onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); steerTo(1); }}
          onPointerUp={() => steerTo(0)}
          onPointerCancel={() => steerTo(0)}
          onPointerLeave={() => steerTo(0)}
        >
          ▶
        </button>
      </div>
      <div className="touch__pedals">
        <button
          className={`touch__brake ${throttle === -1 ? 'is-active' : ''}`}
          aria-label="Brake"
          onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); brakeTo(1); }}
          onPointerUp={() => brakeTo(0)}
          onPointerCancel={() => brakeTo(0)}
          onPointerLeave={() => brakeTo(0)}
        >
          BRAKE
        </button>
        <button
          className={`touch__gas ${throttle === 1 ? 'is-active' : ''}`}
          aria-label="Accelerate"
          onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); throttleTo(1); }}
          onPointerUp={() => throttleTo(0)}
          onPointerCancel={() => throttleTo(0)}
          onPointerLeave={() => throttleTo(0)}
        >
          DRIVE
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

/** The playable rectangle, not the larger extraction margin around it. */
function playableLabel(): string {
  const playable = runtime.current?.world.meta.playable;
  if (!playable) return 'compact neighbourhood';
  const width = Math.round(playable.size.width);
  const depth = Math.round(playable.size.depth);
  return `${width} × ${depth} m`;
}

export function Hud({ graph }: { graph: RouteGraph | null }) {
  const { panel, touch, nearby, vehicleSelect, phase, toast: toastState } = useUi();
  useKeyboardControls(phase === 'ready' && !vehicleSelect);

  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saved = storedVehicleId();
    setUi({
      touch: isTouch,
      reducedMotion: reduced,
      intro: !isTouch,
      vehicleId: saved ?? DEFAULT_VEHICLE_ID,
      // A first-time visitor picks a car before the intro; returning visitors
      // go straight back to the street with their saved choice.
      vehicleSelect: !saved,
    });
  }, []);

  return (
    <>
      <a className="skip-link" href="#portfolio-fallback">Skip to the project list</a>
      {phase === 'ready' && <VehicleSelect />}
      <TopBar />
      <DestinationRail graph={graph} />
      <PromptBar />
      <MapPanel />
      <TouchControls />
      {panel && <DossierSheet zone={panel} graph={graph} />}
      <Intro />
      <div id="world-live-region" className="sr-only" aria-live="polite" />
      {toastState && <div className="toast" role="status">{toastState.text}</div>}
      {!touch && (
        <div className="hud-corner" aria-hidden>
          <span>OSM / ODbL</span>
          <span>{playableLabel()}</span>
        </div>
      )}
    </>
  );
}
