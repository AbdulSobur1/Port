import { projects } from '@/lib/projects';

/**
 * Destinations are the portfolio's stops in the world.
 *
 * The *placement* comes from the extracted OSM road network (see
 * scripts/geo-config.mjs STATIONS); everything here is copy and colour. The
 * five project stops map 1:1 to `lib/projects.ts` so a project can never be
 * described in the world differently from its case page.
 */

export type DestinationKind = 'project' | 'page';

export type Destination = {
  zone: string;
  label: string;
  sub: string;
  color: string;
  kind: DestinationKind;
  /** Case-record route for projects. */
  href?: string;
};

const projectDestinations: Destination[] = projects.map((project) => ({
  zone: `project:${project.slug}`,
  label: project.title,
  sub: project.category,
  color: project.color,
  kind: 'project',
  href: `/work/${project.slug}`,
}));

export const destinations: Destination[] = [
  ...projectDestinations,
  { zone: 'about', label: 'Archive', sub: 'About Soburr', color: '#cdd5ce', kind: 'page' },
  { zone: 'skills', label: 'Systems', sub: 'How the work is made', color: '#cdd5ce', kind: 'page' },
  { zone: 'contact', label: 'Signal Room', sub: 'Contact', color: '#d8f851', kind: 'page' },
];

export const destinationByZone = (zone: string | null | undefined) =>
  zone ? destinations.find((d) => d.zone === zone) : undefined;

export const destinationColor = (zone: string): string => destinationByZone(zone)?.color ?? '#d8f851';

export type Dossier = {
  eyebrow: string;
  title: string;
  lede: string;
  facts?: { label: string; value: string }[];
  body?: string[];
  tags?: string[];
  primaryHref?: string;
  primaryLabel?: string;
  externalHref?: string;
};

export function dossierFor(zone: string): Dossier | null {
  if (zone.startsWith('project:')) {
    const slug = zone.slice('project:'.length);
    const project = projects.find((p) => p.slug === slug);
    if (!project) return null;
    return {
      eyebrow: `${project.number} / ${project.category}`,
      title: project.title,
      lede: project.summary,
      facts: [
        { label: 'Role', value: project.role },
        { label: 'Team', value: project.team },
        { label: 'Stack', value: project.stack.join(' · ') },
      ],
      body: [project.problem, project.direction],
      primaryHref: `/work/${project.slug}`,
      primaryLabel: 'Open the case record',
    };
  }

  if (zone === 'about') {
    return {
      eyebrow: 'Archive / about',
      title: 'Systems with a reason to exist.',
      lede: 'Soburr builds products where design, engineering and real operating constraints meet — across AI, fintech, healthcare, community and culture.',
      body: [
        'The city is the index. Every stop is a piece of work, and the drive between stops is the point: this is a portfolio you move through, not a page you scroll.',
        'Everything you see here is built from real geographic data — OpenStreetMap road and building geometry for a compact Lagos Island neighbourhood around Glover and Oshodi streets, projected into a single world coordinate system and rendered locally.',
      ],
      tags: ['Product thinking', 'Full-stack engineering', 'Creative technology'],
    };
  }

  if (zone === 'skills') {
    return {
      eyebrow: 'Systems / practice',
      title: 'From product questions to robust systems.',
      lede: 'Interaction design, front-end systems and full-stack product engineering.',
      body: [
        'TypeScript, React, Next.js and Three.js power this world. Protocol design, platform thinking and plain language power the decisions behind it.',
        'The map and the 3D scene share one coordinate system derived from a verified OSM snapshot, so a road drawn on the map is the road the car drives on.',
      ],
      tags: ['TypeScript', 'React', 'Next.js', 'Three.js / R3F', 'MapLibre', 'Product design'],
    };
  }

  if (zone === 'contact') {
    return {
      eyebrow: 'Signal room',
      title: 'Have a difficult, useful thing to build?',
      lede: 'The GitHub profile is the current verified public route for Soburr.',
      body: ['Issues and pull requests are the best way to start a conversation. No contact form, no invented availability.'],
      tags: ['GitHub', 'Collaboration'],
      externalHref: 'https://github.com/AbdulSobur1',
    };
  }

  return null;
}
