'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { WorldId } from './world-cities';

/**
 * The 3D world pulls in three.js, so it is loaded on the client after first paint. The
 * fallback keeps the site chrome (and navigation) usable while the canvas boots.
 */
const WorldScene = dynamic(() => import('./world-scene').then((mod) => mod.WorldScene), {
  ssr: false,
  loading: () => <WorldLoading />,
});

function WorldLoading() {
  return (
    <div className="world-experience">
      <a className="skip-link" href="#world-main">Skip to controls</a>
      <header className="world-topbar">
        <Link href="/" className="world-mark" aria-label="Soburr home">SOBURR<span aria-hidden="true">/03</span></Link>
        <nav aria-label="Primary">
          <Link href="/work" className="world-navlink">Work</Link>
          <Link href="/about" className="world-navlink">Gardens</Link>
          <Link href="/contact" className="world-navlink">Signal</Link>
        </nav>
        <div className="world-status"><i aria-hidden="true" />Warming up the engine</div>
      </header>
      <div className="world-loading" role="status" aria-live="polite"><i /></div>
    </div>
  );
}

export function WorldLoader({ worldId = 'hub' }: { worldId?: WorldId }) {
  return <WorldScene worldId={worldId} />;
}
