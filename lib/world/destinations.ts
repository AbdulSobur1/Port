import { districtById, pageStops, works, type DistrictId, type WorkStatus } from '@/lib/works';

/**
 * Destinations are the stops in the world. Placement comes from the road data
 * (scripts/place-streets.mjs); every word comes from lib/works.ts.
 */

export type DestinationKind = 'project' | 'page';

export type Destination = {
  zone: string;
  label: string;
  /** What kind of thing it is, in plain words. */
  sub: string;
  line: string;
  color: string;
  kind: DestinationKind;
  district: DistrictId;
  status?: WorkStatus;
  href?: string;
};

const workDestinations: Destination[] = works.map((w) => ({
  zone: `project:${w.slug}`,
  label: w.title,
  sub: w.kind,
  line: w.line,
  color: districtById(w.district).color,
  kind: 'project',
  district: w.district,
  status: w.status,
  href: `/work/${w.slug}`,
}));

const pageDestinations: Destination[] = pageStops.map((p) => ({
  zone: p.zone,
  label: p.title,
  sub: p.kind,
  line: p.line,
  color: districtById(p.district).color,
  kind: 'page',
  district: p.district,
}));

export const destinations: Destination[] = [...pageDestinations.filter((p) => p.zone === 'home'), ...workDestinations, ...pageDestinations.filter((p) => p.zone !== 'home')];

export const destinationByZone = (zone: string | null | undefined) =>
  zone ? destinations.find((d) => d.zone === zone) : undefined;

export const destinationColor = (zone: string): string => destinationByZone(zone)?.color ?? '#f2b300';

export type Dossier = {
  eyebrow: string;
  title: string;
  lede: string;
  status?: WorkStatus;
  facts?: { label: string; value: string }[];
  story?: { heading: string; body: string }[];
  body?: string[];
  gaps?: string[];
  confidential?: boolean;
  primaryHref?: string;
  primaryLabel?: string;
  links?: { label: string; href: string }[];
};

export function dossierFor(zone: string): Dossier | null {
  if (zone.startsWith('project:')) {
    const w = works.find((x) => `project:${x.slug}` === zone);
    if (!w) return null;
    const d = districtById(w.district);
    return {
      eyebrow: `${d.name} on ${d.street}`,
      title: w.title,
      lede: w.line,
      status: w.status,
      facts: [
        { label: 'What it is', value: w.kind },
        { label: 'My role', value: w.role },
        { label: 'Team', value: w.team },
        ...(w.stack.length ? [{ label: 'Built with', value: w.stack.join(', ') }] : []),
      ],
      story: w.story.slice(0, 2),
      gaps: w.gaps,
      confidential: w.confidential,
      links: w.links,
      primaryHref: `/work/${w.slug}`,
      primaryLabel: 'Read the full story',
    };
  }
  const p = pageStops.find((x) => x.zone === zone);
  if (!p) return null;
  const d = districtById(p.district);
  return {
    eyebrow: zone === 'home' ? 'Start of the street' : `${d.name} on ${d.street}`,
    title: p.title,
    lede: p.line,
    body: p.body,
    gaps: p.gaps,
    links: p.links,
  };
}
