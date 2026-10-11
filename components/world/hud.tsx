'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ZoneId } from './store';
import { useUi, setUi, getUi, stationByZone, vehicle, input, stations } from './store';
import { projects } from '@/lib/projects';

/* ---------- Keyboard + touch wiring ---------- */

export function useControls(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') input.forward = 1;
      if (key === 's' || key === 'arrowdown') input.reverse = 1;
      if (key === 'a' || key === 'arrowleft') input.left = true;
      if (key === 'd' || key === 'arrowright') input.right = true;
      if (key === ' ') {
        input.brake = true;
        event.preventDefault();
      }
      if (key === 'e') {
        const zone = getUi().nearestZone;
        if (zone) openZone(zone);
      }
      if (key === 'r') resetVehicle();
      if (key === 'h') honk();
      if (key === 'm') setUi({ mapOpen: !getUi().mapOpen });
      if (key === 'escape') { setUi({ panelZone: null, mapOpen: false }); }
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
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      Object.assign(input, { forward: 0, reverse: 0, brake: false, left: false, right: false });
    };
  }, [enabled]);
}

export function resetVehicle() {
  vehicle.x = 0;
  vehicle.z = 14;
  vehicle.yaw = Math.PI;
  vehicle.speed = 0;
  vehicle.steer = 0;
  setUi({ autopilotRequest: null, autopilotLabel: null, panelZone: null });
}

export function openZone(zone: ZoneId) {
  setUi({ panelZone: zone });
}

export function honk() {
  vehicle.honkAge = 0;
  setUi({ honkTick: getUi().honkTick + 1 });
}

/* ---------- Dossier content (all verified, no percentages or invented metrics) ---------- */

type Dossier = {
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  actionLabel: string;
  actionHref?: string;
  caseSlug?: string;
};

function dossierFor(zone: ZoneId): Dossier | null {
  if (zone.startsWith('project:')) {
    const slug = zone.split(':')[1];
    const project = projects.find((p) => p.slug === slug);
    if (!project) return null;
    return {
      eyebrow: project.category,
      title: project.title,
      body: project.summary,
      tags: project.stack,
      actionLabel: 'Open project record',
      actionHref: `/work/${project.slug}`,
      caseSlug: project.slug,
    };
  }
  if (zone === 'about') {
    return {
      eyebrow: 'Archive',
      title: 'Systems with a reason to exist.',
      body: 'Soburr builds products where design, engineering, and real operating constraints meet — across AI, fintech, healthcare, community, and culture. The world is a map of that work, not a decorative cover.',
      tags: ['Product thinking', 'Full-stack engineering', 'Creative technology'],
      actionLabel: 'Continue exploring',
    };
  }
  if (zone === 'skills') {
    return {
      eyebrow: 'Systems',
      title: 'From product questions to robust systems.',
      body: 'Interaction design, front-end systems, and full-stack product engineering. TypeScript, React, Next.js, and Three.js power the experiences; protocol design, platform thinking, and plain language power the decisions.',
      tags: ['TypeScript', 'React', 'Next.js', 'Three.js / R3F', 'Product design'],
      actionLabel: 'Continue exploring',
    };
  }
  if (zone === 'contact') {
    return {
      eyebrow: 'Signal Room',
      title: 'Have a difficult, useful thing to build?',
      body: 'The GitHub profile is the current verified public route for Soburr. Issues and pull requests are the best way to start a conversation.',
      tags: ['GitHub', 'Collaboration'],
      actionLabel: 'Open GitHub profile',
      actionHref: 'https://github.com/AbdulSobur1',
    };
  }
  if (zone === 'home') {
    return {
      eyebrow: 'Arrival plaza',
      title: 'Experience that connects.',
      body: 'You are parked at the arrival plaza. Five project stations ring the landmark, with Archive and Systems on the west and east edges. Press W to drive, E to inspect a station, M for the map.',
      tags: ['Drive', 'Inspect', 'Explore'],
      actionLabel: 'Continue exploring',
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
        {dossier.actionHref?.startsWith('/') && (
          <Link className="world-link" href={dossier.actionHref}>{dossier.actionLabel}</Link>
        )}
        {dossier.actionHref && !dossier.actionHref.startsWith('/') && (
          <a className="world-link" href={dossier.actionHref} target="_blank" rel="noreferrer">{dossier.actionLabel}</a>
        )}
        <button className="world-button" onClick={close}>Close</button>
      </div>
    </aside>
  );
}

/* ---------- Proximity prompt ---------- */

function ZonePrompt() {
  const { nearestZone, panelZone, autopilotLabel } = useUi();
  if (panelZone) return null;
  if (autopilotLabel) {
    return <p className="world-prompt" aria-live="polite">Guided drive — {autopilotLabel}…</p>;
  }
  if (!nearestZone) return null;
  const station = stationByZone(nearestZone);
  if (!station) return null;
  return (
    <p className="world-prompt" aria-live="polite">
      {station.label} — press <kbd>E</kbd> to inspect
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
        Drive the city. Each station holds work, background, skills, or a way to reach Soburr.
      </p>
      <div className="world-panel__tags">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive</span>
        <span><kbd>E</kbd> inspect</span>
        <span><kbd>H</kbd> horn</span>
        <span><kbd>R</kbd> reset</span>
        <span><kbd>M</kbd> map</span>
      </div>
      <div className="world-panel__actions">
        <button className="world-button world-button--primary" onClick={() => setUi({ onboarding: false })}>Start driving</button>
        <button className="world-button" onClick={() => { setUi({ onboarding: false }); navigate('contact'); }}>Take me somewhere</button>
      </div>
    </div>
  );
}

/* ---------- Map / destination menu ---------- */

export function navigate(zone: ZoneId) {
  const station = stationByZone(zone);
  if (!station) return;
  setUi({ panelZone: null, autopilotRequest: { zone, label: station.label }, autopilotLabel: station.label, mode: 'autopilot' });
}

function MapMenu() {
  const { mapOpen, nearestZone } = useUi();
  return (
    <aside className="world-map" data-open={mapOpen}>
      <p className="world-map__label">Destinations</p>
      <div className="world-map__list">
        {stations.map((station) => (
          <button
            key={station.zone}
            onClick={() => navigate(station.zone)}
            aria-current={nearestZone === station.zone || undefined}
          >
            <span>{station.label}</span>
            <span>{station.sub}</span>
          </button>
        ))}
      </div>
      <div className="world-map__foot">
        <button className="world-button" onClick={resetVehicle}>Return to start</button>
        <button className="world-button" onClick={honk}>Horn</button>
      </div>
      <button className="world-map__toggle" onClick={() => setUi({ mapOpen: !getUi().mapOpen })}>{mapOpen ? 'Close map' : 'Map'}</button>
    </aside>
  );
}

/* ---------- Mobile touch controls ---------- */

function TouchControls() {
  const hold = (power: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); vehicle.touchPower = power; vehicle.touchActive = true; },
    onPointerUp: () => { vehicle.touchPower = 0; vehicle.touchActive = false; },
    onPointerLeave: () => { vehicle.touchPower = 0; },
    onPointerCancel: () => {vehicle.touchPower = 0; },
  });
  const steerHold = ( dir: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); vehicle.touchSteer = dir; vehicle.touchActive = true; },
    onPointerUp: () => { vehicle.touchSteer = 0; },
    onPointerLeave: () => { vehicle.touchSteer = 0; },
    onPointerCancel: () => { vehicle.touchSteer = 0; },
  });
  return (
    <div className="world-touch">
      <div className="world-touch__group">
        <button aria-label="Steer left" {...steerHold(-1)}>◀</button>
        <button aria-label="Forward" {...hold(1)}>▲</button>
        <button aria-label="Steer right" {...steerHold(1)}>▶</button>
        <button aria-label="Reverse" {...hold(-1)}>▼</button>
      </div>
      <button className="world-touch__interact" onClick={() => { const zone = getUi().nearestZone; if (zone) openZone(zone); }}>
        Inspect (E)
      </button>
    </div>
  );
}

/* ---------- Root HUD ---------- */

export function Hud() {
  const { panelZone, onboarding, autopilotLabel } = useUi();
  useControls(true);

  return (
    <>
      <header className="world-topbar">
        <Link href="/" className="world-mark">SOBURR<span>/03</span></Link>
        <nav>
          <button onClick={() => navigate('about')}>Archive</button>
          <button onClick={() => navigate('skills')}>Systems</button>
          <button onClick={() => navigate('contact')}>Contact</button>
        </nav>
        <div className="world-status"><i />interactive world</div>
      </header>

      {!panelZone && !onboarding && <ZonePrompt />}
      {panelZone && <Dossier zone={panelZone} close={() => setUi({ panelZone: null })} />}
      {onboarding && <Onboarding />}
      <MapMenu />
      <TouchControls />

      <footer className="world-footer">
        <p>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>E</kbd> inspect · <kbd>H</kbd> horn · <kbd>R</kbd> reset · <kbd>M</kbd> map
        </p>
        <div className="world-controls">
          <button className="world-button" onClick={() => navigate('home')}>Home</button>
          <button className="world-button" onClick={resetVehicle}>Reset</button>
          <button className="world-button" onClick={() => openZone('contact')}>Contact</button>
        </div>
      </footer>
    </>
  );
}
