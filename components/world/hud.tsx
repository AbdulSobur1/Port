'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RouteGraph } from '@/lib/geo/graph';
import { destinationByZone, destinations, dossierFor } from '@/lib/world/destinations';
import { districtById, districts, streetPlan } from '@/lib/works';
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
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if ((getUi().vehicleSelect || getUi().intro) && key !== 'escape') return;
      if (key === 'w' || key === 'arrowup') input.forward = true;
      if (key === 's' || key === 'arrowdown') input.reverse = true;
      if (key === 'a' || key === 'arrowleft') input.left = true;
      if (key === 'd' || key === 'arrowright') input.right = true;
      if (key === ' ') input.brake = true;
      if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && !(target && /button|a/i.test(target.tagName) && key === ' ')) event.preventDefault();
      if (key === 'e') {
        const zone = getUi().nearby;
        if (zone) openDestination(zone);
      }
      if (key === 'r') resetCar();
      if (key === 'm') setUi({ mapOpen: !getUi().mapOpen, mapExpanded: false });
      if (key === 'escape') {
        if (getUi().vehicleSelect) setUi({ vehicleSelect: false });
        else if (getUi().rail) setUi({ rail: false });
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
        <span className="hud-brand__sub">Portfolio map</span>
      </div>

      <div className="hud-top__center">
        <button
          className="hud-pill"
          onClick={() => setUi({ rail: !rail })}
          aria-expanded={rail}
          aria-controls="destination-rail"
        >
          <span className="hud-pill__dot" />
          Street guide
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
        <Link className="hud-icon" href="/work" aria-label="Read all work as a plain list">
          <span aria-hidden>☰</span>
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
    <aside className="rail" id="destination-rail" aria-label="Street guide">
      <header className="rail__head">
        <div>
          <p className="rail__eyebrow">Street guide</p>
          <p className="rail__how">Each street holds one kind of work. Tap a name to read it. Tap Drive and the car takes you there.</p>
        </div>
        <button className="rail__close" onClick={() => setUi({ rail: false })} aria-label="Close street guide">✕</button>
      </header>
      <div className="rail__scroll">
        {streetPlan.map((plan) => {
          const district = districtById(plan.district);
          const items = plan.zones.map((z) => destinationByZone(z)).filter(Boolean) as NonNullable<ReturnType<typeof destinationByZone>>[];
          return (
            <section key={district.id} className="rail__street" style={{ ['--street' as string]: district.color }}>
              <h2 className="rail__streethead">
                <StreetMark shape={district.shape} color={district.color} />
                <span>
                  <strong>{district.name}</strong>
                  <small>{district.street}</small>
                </span>
              </h2>
              <p className="rail__streetblurb">{district.blurb}</p>
              <ul className="rail__list">
                {items.map((dest) => {
                  const station = rt?.stations.find((s) => s.zone === dest.zone);
                  const isNear = nearby === dest.zone;
                  const isTarget = autopilot?.zone === dest.zone && autopilot.status === 'driving';
                  return (
                    <li key={dest.zone} data-active={isNear || isTarget}>
                      <button className="rail__item" onClick={() => openDestination(dest.zone)} aria-label={`Read about ${dest.label}`}>
                        <span className="rail__text">
                          <strong>{dest.label}</strong>
                          <small>{dest.sub}{dest.status ? ` · ${dest.status}` : ''}</small>
                        </span>
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
              </ul>
            </section>
          );
        })}
      </div>
      <footer className="rail__foot">
        <button className="world-button" onClick={resetCar}>Back to the start</button>
        <Link className="world-button" href="/work">Plain list</Link>
      </footer>
    </aside>
  );
}

export function StreetMark({ shape, color, size = 18 }: { shape: string; color: string; size?: number }) {
  const common = { fill: color, stroke: '#0f1c2e', strokeWidth: 1.5 } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden focusable="false" className="street-mark">
      {shape === 'circle' && <circle cx="10" cy="10" r="8" {...common} />}
      {shape === 'square' && <rect x="2.5" y="2.5" width="15" height="15" {...common} />}
      {shape === 'triangle' && <polygon points="10,2 18.5,17.5 1.5,17.5" {...common} />}
      {shape === 'diamond' && <polygon points="10,1.5 18.5,10 10,18.5 1.5,10" {...common} />}
      {shape === 'hexagon' && <polygon points="5.5,2.5 14.5,2.5 19,10 14.5,17.5 5.5,17.5 1,10" {...common} />}
    </svg>
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
  const showGaps = process.env.NEXT_PUBLIC_SHOW_GAPS !== '0';

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
        style={{ ['--accent' as string]: dest?.color ?? '#f2b300' }}
      >
        <header className="dossier__head">
          <p className="dossier__eyebrow">{dossier.eyebrow}</p>
          <button className="dossier__close" onClick={() => setUi({ panel: null })} aria-label="Close">✕</button>
        </header>
        <h1 id="dossier-title">{dossier.title}</h1>
        {dossier.status && <p className="dossier__status">{dossier.status}{dossier.confidential ? ' · Details are confidential' : ''}</p>}
        <p className="dossier__lede">{dossier.lede}</p>

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

        {dossier.story?.map((part) => (
          <div className="dossier__copy" key={part.heading}>
            <h2>{part.heading}</h2>
            <p>{part.body}</p>
          </div>
        ))}
        {dossier.body?.map((paragraph) => (
          <p className="dossier__copy" key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}

        {showGaps && dossier.gaps && dossier.gaps.length > 0 && (
          <div className="gaps" role="note">
            <strong>Still to add (only you see this)</strong>
            <ul>{dossier.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          </div>
        )}

        <div className="dossier__actions">
          {dossier.primaryHref && (
            <Link className="world-button world-button--primary" href={dossier.primaryHref}>
              {dossier.primaryLabel}
            </Link>
          )}
          {dossier.links?.map((l) => (
            <a key={l.href} className="world-button world-button--primary" href={l.href} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          ))}
          {station && graph && (
            <button className="world-button" onClick={() => navigateTo(zone, graph, rt?.stations ?? [])}>
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
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro__card">
        <p className="dossier__eyebrow">Abdulsobur’s portfolio</p>
        <h1 id="intro-title">A street map of everything I have built.</h1>
        <p>
          Each street holds one kind of work. Each building on a street is one project, with its
          name on the sign. Drive between them, or open the street guide and tap a name.
        </p>
        <ul className="intro__streets">
          {districts.map((d) => (
            <li key={d.id}>
              <StreetMark shape={d.shape} color={d.color} size={22} />
              <span>
                <strong>{d.name}</strong>
                <small>{d.street}. {d.blurb}</small>
              </span>
            </li>
          ))}
        </ul>
        <p className="intro__keys-line">
          Drive with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys. Press <kbd>E</kbd> at a building to read about it.
        </p>
        <div className="intro__actions">
          <button className="world-button world-button--primary" onClick={() => setUi({ intro: false })}>
            Start driving
          </button>
          <button className="world-button" onClick={() => setUi({ intro: false, rail: true })}>
            Open the street guide
          </button>
          <Link className="world-button" href="/work">See a plain list</Link>
        </div>
        <p className="intro__note">Streets and buildings come from OpenStreetMap data © OpenStreetMap contributors (ODbL). The project buildings are mine.</p>
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
  useKeyboardControls(phase === 'ready');

  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saved = storedVehicleId();
    setUi({
      touch: isTouch,
      reducedMotion: reduced,
      intro: !isTouch,
      vehicleId: saved ?? DEFAULT_VEHICLE_ID,
      // Nobody should have to pick a car before they can read the work. The
      // garage is one tap away from the top bar.
      vehicleSelect: false,
    });
  }, []);

  return (
    <>
      <a className="skip-link" href="/work">Skip to the plain list of work</a>
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
