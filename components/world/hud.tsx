'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Station, WorldLayout, ZoneId } from './world-layout';
import { useUi, setUi, getUi, vehicle, input, resetVehiclePose } from './store';
import { unlockAudio, setSoundEnabled, playHorn } from './audio';
import { projects } from '@/lib/projects';

/* ---------- Keyboard + touch wiring ---------- */

function shouldIgnoreKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], button, a[href], [role="button"]')
  );
}

type ControlsCallbacks = {
  openZoneOrPortal: (zone: ZoneId) => void;
  resetVehicle: () => void;
};

export function useControls(enabled: boolean, world: WorldLayout, callbacks: ControlsCallbacks) {
  const { openZoneOrPortal, resetVehicle } = callbacks;
  useEffect(() => {
    if (!enabled) return;

    const releaseDriveInput = () => {
      Object.assign(input, { forward: 0, reverse: 0, brake: false, left: false, right: false });
    };

    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      unlockAudio();
      const ui = getUi();
      const interactiveTarget = shouldIgnoreKeyboardTarget(event.target);
      const driveKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '];

      // Never let portfolio shortcuts hijack text entry or repeat-toggle menus while held.
      // Preserve native keyboard activation and navigation for focused UI controls.
      if (interactiveTarget) return;
      if (event.repeat && !driveKeys.includes(key)) return;

      if (key === 'w' || key === 'arrowup') { input.forward = 1; event.preventDefault(); }
      if (key === 's' || key === 'arrowdown') { input.reverse = 1; event.preventDefault(); }
      if (key === 'a' || key === 'arrowleft') { input.left = true; event.preventDefault(); }
      if (key === 'd' || key === 'arrowright') { input.right = true; event.preventDefault(); }
      if (key === ' ') { input.brake = true; event.preventDefault(); }
      if (key === 'e' && !ui.onboarding && !ui.panelZone) {
        const zone = ui.nearestZone;
        if (zone) openZoneOrPortal(zone);
      }
      if (key === 'r') resetVehicle();
      if (key === 'h') honk();
      if (key === 'm') setUi({ mapOpen: !ui.mapOpen, onboarding: false, panelZone: null });
      if (key === 'escape') {
        setUi({ panelZone: null, mapOpen: false, onboarding: false });
        releaseDriveInput();
      }
    };

    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') input.forward = 0;
      if (key === 's' || key === 'arrowdown') input.reverse = 0;
      if (key === 'a' || key === 'arrowleft') input.left = false;
      if (key === 'd' || key === 'arrowright') input.right = false;
      if (key === ' ') input.brake = false;
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', releaseDriveInput);
    window.addEventListener('pointerdown', unlockAudio);
    const onVisibilityChange = () => { if (document.hidden) releaseDriveInput(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', releaseDriveInput);
      window.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseDriveInput();
    };
  }, [enabled, world, openZoneOrPortal, resetVehicle]);
}

export function honk() {
  vehicle.honkAge = 0;
  playHorn();
  setUi({ honkTick: getUi().honkTick + 1 });
}

export function toggleSound() {
  unlockAudio();
  const next = !getUi().soundOn;
  setSoundEnabled(next);
  setUi({ soundOn: next });
}

/* ---------- Dossier content (all verified, no percentages or invented metrics) ---------- */

type DossierAction = { label: string; href: string; external?: boolean };

type Dossier = {
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  actions: DossierAction[];
};

function dossierFor(zone: ZoneId): Dossier | null {
  if (zone.startsWith('project:')) {
    const slug = zone.split(':')[1];
    const project = projects.find((p) => p.slug === slug);
    if (!project) return null;
    const actions: DossierAction[] = [{ label: 'Open project record', href: `/work/${project.slug}` }];
    if (project.links?.demo) actions.push({ label: 'Live demo', href: project.links.demo, external: true });
    if (project.links?.repo) actions.push({ label: 'Source', href: project.links.repo, external: true });
    return {
      eyebrow: project.category,
      title: project.title,
      body: project.summary,
      tags: project.stack,
      actions,
    };
  }
  if (zone === 'work') {
    return {
      eyebrow: 'The archive',
      title: `${projects.length} projects, live demos included.`,
      body: 'Open the full work archive to browse every build — with category filters, case studies, and live-demo links wherever they exist.',
      tags: ['Projects', 'Live demos', 'Forks'],
      actions: [{ label: 'Open work archive', href: '/work/archive' }],
    };
  }
  if (zone === 'about') {
    return {
      eyebrow: 'About',
      title: 'Systems with a reason to exist.',
      body: 'Soburr builds products where design, engineering, and real operating constraints meet — across AI, fintech, healthcare, community, and culture. The world is a map of that work, not a decorative cover.',
      tags: ['Product thinking', 'Full-stack engineering', 'Creative technology'],
      actions: [{ label: 'Open work archive', href: '/work/archive' }],
    };
  }
  if (zone === 'skills') {
    return {
      eyebrow: 'Systems',
      title: 'From product questions to robust systems.',
      body: 'Interaction design, front-end systems, and full-stack product engineering. TypeScript, React, Next.js, and Three.js power the experiences; protocol design, platform thinking, and plain language power the decisions.',
      tags: ['TypeScript', 'React', 'Next.js', 'Three.js / R3F', 'Product design'],
      actions: [],
    };
  }
  if (zone === 'contact') {
    return {
      eyebrow: 'Signal Room',
      title: 'Have a difficult, useful thing to build?',
      body: 'The GitHub profile is the current verified public route for Soburr. Issues and pull requests are the best way to start a conversation.',
      tags: ['GitHub', 'Collaboration'],
      actions: [{ label: 'Open GitHub profile', href: 'https://github.com/AbdulSobur1', external: true }],
    };
  }
  if (zone === 'home') {
    return {
      eyebrow: 'Arrival plaza',
      title: 'Experience that connects.',
      body: 'You are parked at the arrival plaza. Featured project stations ring the landmark, and portals on the edge lead to the Work, Gardens, and Signal cities. Press W to drive, E to inspect a station, M for the map.',
      tags: ['Drive', 'Inspect', 'Explore'],
      actions: [],
    };
  }
  return null;
}

/* ---------- Panels ---------- */

function Dossier({ zone, close }: { zone: ZoneId; close: () => void }) {
  const dossier = dossierFor(zone);
  if (!dossier) return null;
  return (
    <aside className="world-panel" role="dialog" aria-label={dossier.title}>
      <p className="world-panel__eyebrow">{dossier.eyebrow}</p>
      <h1>{dossier.title}</h1>
      <p className="world-panel__copy">{dossier.body}</p>
      <div className="world-panel__tags">{dossier.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="world-panel__actions">
        {dossier.actions.map((action) => action.external
          ? <a key={action.label} className="world-link" href={action.href} target="_blank" rel="noreferrer">{action.label} <span aria-hidden="true">↗</span></a>
          : <Link key={action.label} className="world-link" href={action.href}>{action.label} <span aria-hidden="true">→</span></Link>)}
        <button className="world-button" onClick={close}>Close</button>
      </div>
    </aside>
  );
}

/* ---------- Proximity prompt ---------- */

function ZonePrompt({ world }: { world: WorldLayout }) {
  const { nearestZone, panelZone, autopilotLabel } = useUi();
  if (panelZone) return null;
  if (autopilotLabel) {
    return <p className="world-prompt" aria-live="polite">Guided drive — {autopilotLabel}…</p>;
  }
  if (!nearestZone) return null;
  const station = world.stations.find((s) => s.zone === nearestZone);
  if (!station) return null;
  const verb = station.kind === 'portal' ? 'enter the city' : 'inspect';
  return (
    <p className="world-prompt" aria-live="polite">
      {station.label} — press <kbd>E</kbd> to {verb}
    </p>
  );
}

/* ---------- Transient notice ---------- */

function NoticeBanner() {
  const { notice } = useUi();
  if (!notice) return null;
  return (
    <p className="world-prompt" role="status" aria-live="polite">
      {notice}{' '}
      <button className="world-button" onClick={() => setUi({ notice: null })}>Dismiss</button>
    </p>
  );
}

/* ---------- Onboarding ---------- */

function Onboarding() {
  const { onboarding } = useUi();
  if (!onboarding) return null;
  return (
    <div className="world-welcome">
      <p className="world-panel__eyebrow">Soburr / interactive portfolio</p>
      <h1>The world is the interface.</h1>
      <p className="world-panel__copy">
        Drive the city. Portals lead to the Work, Gardens, and Signal cities; every station opens work, background, skills, or a way to reach Soburr.
      </p>
      <div className="world-panel__tags">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive</span>
        <span><kbd>E</kbd> inspect / enter</span>
        <span><kbd>H</kbd> horn</span>
        <span><kbd>R</kbd> reset</span>
        <span><kbd>M</kbd> map</span>
      </div>
      <div className="world-panel__actions">
        <button className="world-button world-button--primary" onClick={() => setUi({ onboarding: false })}>Start driving</button>
        <Link className="world-button" href="/contact">Take me somewhere</Link>
      </div>
    </div>
  );
}

/* ---------- Map / destination menu ---------- */

function MapMenu({ world, driveTo, onInteract }: { world: WorldLayout; driveTo: (station: Station) => void; onInteract: () => void }) {
  const { mapOpen, nearestZone } = useUi();
  return (
    <aside className="world-map" data-open={mapOpen}>
      <p className="world-map__label">Destinations · {world.name}</p>
      <div className="world-map__list" id="world-destination-list">
        {world.stations.map((station) => (
          <button
            key={station.zone}
            onClick={() => driveTo(station)}
            aria-current={nearestZone === station.zone || undefined}
          >
            <span>{station.label}{station.kind === 'portal' ? ' →' : ''}</span>
            <span>{station.sub}</span>
          </button>
        ))}
      </div>
      <div className="world-map__foot">
        <button className="world-button" onClick={onInteract}>Inspect nearest</button>
        <button className="world-button" onClick={honk}>Horn</button>
      </div>
      <button className="world-map__toggle" aria-expanded={mapOpen} aria-controls="world-destination-list" onClick={() => setUi({ mapOpen: !getUi().mapOpen, onboarding: false, panelZone: null })}>{mapOpen ? 'Close map' : 'Map'}</button>
    </aside>
  );
}

/* ---------- Mobile touch controls ---------- */

function TouchControls({ openZoneOrPortal }: { openZoneOrPortal: (zone: ZoneId) => void }) {
  const activeControls = useRef(new Set<string>());

  const syncTouchState = () => {
    vehicle.touchActive = activeControls.current.size > 0;
  };

  const hold = (control: string, power: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      activeControls.current.add(control);
      vehicle.touchPower = power;
      syncTouchState();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      activeControls.current.delete(control);
      if (vehicle.touchPower === power) vehicle.touchPower = 0;
      syncTouchState();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel: () => {
      activeControls.current.delete(control);
      if (vehicle.touchPower === power) vehicle.touchPower = 0;
      syncTouchState();
    },
    onLostPointerCapture: () => {
      activeControls.current.delete(control);
      if (vehicle.touchPower === power) vehicle.touchPower = 0;
      syncTouchState();
    },
  });

  const steerHold = (control: string, dir: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      activeControls.current.add(control);
      vehicle.touchSteer = dir;
      syncTouchState();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      activeControls.current.delete(control);
      if (vehicle.touchSteer === dir) vehicle.touchSteer = 0;
      syncTouchState();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    },
    onPointerCancel: () => {
      activeControls.current.delete(control);
      if (vehicle.touchSteer === dir) vehicle.touchSteer = 0;
      syncTouchState();
    },
    onLostPointerCapture: () => {
      activeControls.current.delete(control);
      if (vehicle.touchSteer === dir) vehicle.touchSteer = 0;
      syncTouchState();
    },
  });

  return (
    <div className="world-touch" aria-label="Vehicle touch controls">
      <div className="world-touch__group">
        <button aria-label="Steer left" {...steerHold('steer-left', -1)}>◀</button>
        <button aria-label="Accelerate" {...hold('forward', 1)}>▲</button>
        <button aria-label="Steer right" {...steerHold('steer-right', 1)}>▶</button>
        <button aria-label="Reverse" {...hold('reverse', -1)}>▼</button>
      </div>
      <button className="world-touch__interact" onClick={() => { const zone = getUi().nearestZone; if (zone) openZoneOrPortal(zone); }}>
        Inspect / Enter
      </button>
    </div>
  );
}

/* ---------- Root HUD ---------- */

const TOP_NAV: { href: string; label: string }[] = [
  { href: '/work', label: 'Work' },
  { href: '/about', label: 'Gardens' },
  { href: '/contact', label: 'Signal' },
];

export function Hud({ world }: { world: WorldLayout }) {
  const { panelZone, onboarding, soundOn } = useUi();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setSoundEnabled(soundOn); }, [soundOn]);

  const openZoneOrPortal = (zone: ZoneId) => {
    const station = world.stations.find((s) => s.zone === zone);
    if (station?.kind === 'portal' && station.href) {
      router.push(station.href);
      return;
    }
    setUi({ panelZone: zone, onboarding: false, mapOpen: false, autopilotRequest: null, autopilotLabel: null, mode: 'drive', notice: null });
  };

  const driveTo = (station: Station) => {
    if (station.kind === 'portal' && station.href) {
      router.push(station.href);
      return;
    }
    setUi({ onboarding: false, panelZone: null, mapOpen: false, notice: null, autopilotRequest: { zone: station.zone, label: station.label }, autopilotLabel: station.label, mode: 'autopilot' });
  };

  const resetVehicle = () => resetVehiclePose(world.spawn);
  const openZoneOrPortalNearest = () => { const zone = getUi().nearestZone; if (zone) openZoneOrPortal(zone); };

  useControls(true, world, { openZoneOrPortal, resetVehicle });

  return (
    <>
      <header className="world-topbar">
        <Link href="/" className="world-mark">SOBURR<span>/03</span></Link>
        <nav>
          {TOP_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? 'world-navlink world-navlink--active' : 'world-navlink'}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="world-status"><i />{world.name}</div>
      </header>

      {!panelZone && !onboarding && <ZonePrompt world={world} />}
      {!panelZone && !onboarding && <NoticeBanner />}
      {panelZone && <Dossier zone={panelZone} close={() => setUi({ panelZone: null })} />}
      {onboarding && <Onboarding />}
      <MapMenu world={world} driveTo={driveTo} onInteract={openZoneOrPortalNearest} />
      <TouchControls openZoneOrPortal={openZoneOrPortal} />

      <footer className="world-footer">
        <p>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>E</kbd> inspect/enter · <kbd>H</kbd> horn · <kbd>R</kbd> reset · <kbd>M</kbd> map
        </p>
        <div className="world-controls">
          <Link className="world-button" href="/">Hub</Link>
          <button className="world-button" onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
          <button className="world-button" onClick={resetVehicle}>Reset</button>
          <Link className="world-button" href="/contact">Contact</Link>
        </div>
      </footer>
    </>
  );
}