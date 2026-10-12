'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { Project } from '@/lib/projects';

const filters = [
  { label: 'All work', value: 'all' },
  { label: 'Web apps', value: 'web' },
  { label: 'AI / ML', value: 'ai' },
  { label: 'Fintech', value: 'fintech' },
  { label: 'Platforms', value: 'platform' },
  { label: 'Commerce', value: 'commerce' },
  { label: 'Community', value: 'community' },
  { label: 'Media', value: 'media' },
  { label: 'Education', value: 'education' },
  { label: 'Health', value: 'health' },
] as const;
type Filter = (typeof filters)[number]['value'];

function matches(project: Project, filter: Filter) {
  return filter === 'all' || project.filters.includes(filter);
}

export default function WorkGallery({ projects }: { projects: Project[] }) {
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const visibleProjects = useMemo(() => projects.filter((project) => matches(project, activeFilter)), [projects, activeFilter]);

  return <>
    <div className="work-filter" aria-label="Filter projects by category" role="group">
      {filters.map((filter) => <button key={filter.value} type="button" className={activeFilter === filter.value ? 'is-selected' : ''} aria-pressed={activeFilter === filter.value} onClick={() => setActiveFilter(filter.value)}>{filter.label}</button>)}
    </div>
    <p className="work-results" aria-live="polite">Showing {visibleProjects.length} of {projects.length} projects</p>
    <div className="project-grid" id="project-grid">
      {visibleProjects.map((project) => {
        const index = projects.findIndex((item) => item.slug === project.slug);
        const demo = project.links?.demo;
        const repo = project.links?.repo;
        return <article className={`project-card project-card--${index + 1}`} key={project.slug} style={{ '--project-accent': project.color, '--card-index': index } as CSSProperties}>
          <Link className="project-card__hit" href={`/work/${project.slug}`} aria-label={`Open the ${project.title} case study`} />
          <div className={`project-visual project-visual--${index + 1}`} aria-hidden="true">
            <span className="project-visual__number">{project.number} / SOBURR ARCHIVE</span><div className="project-visual__scene"><span className="project-visual__orb"/><span className="project-visual__panel project-visual__panel--one"/><span className="project-visual__panel project-visual__panel--two"/><span className="project-visual__platform"/><span className="project-visual__glyph">{project.title.slice(0, 1)}</span></div><span className="project-visual__type">{project.category}</span>
          </div>
          <div className="project-card__content"><div><p className="project-card__category">{project.category}</p><h3>{project.title}</h3><p className="project-card__summary">{project.summary}</p></div><span className="project-card__arrow" aria-hidden="true">↗</span></div>
          <div className="project-card__tags">{project.stack.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <div className="project-card__actions">
            <Link className="project-card__action" href={`/work/${project.slug}`}>Case study <span aria-hidden="true">→</span></Link>
            {demo && <a className="project-card__action project-card__action--live" href={demo} target="_blank" rel="noreferrer">Live demo <span aria-hidden="true">↗</span></a>}
            {repo && <a className="project-card__action" href={repo} target="_blank" rel="noreferrer">Source <span aria-hidden="true">↗</span></a>}
          </div>
        </article>;
      })}
    </div>
    {visibleProjects.length === 0 && <p className="empty-projects">No projects match this category yet.</p>}
  </>;
}
