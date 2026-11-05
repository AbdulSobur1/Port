'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { Journey } from './journey/journey';

const WorldScene = dynamic(() => import('./world/world-scene').then((m) => m.WorldScene), { ssr: false });

/** A big screen with a mouse gets the drivable map; everything else gets the scroll journey. */
const QUERY = '(min-width: 900px) and (hover: hover) and (pointer: fine)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function Experience() {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
  return desktop ? <WorldScene /> : <Journey />;
}
