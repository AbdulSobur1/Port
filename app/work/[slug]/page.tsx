import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { projectBySlug, projects } from '@/lib/projects';

export function generateStaticParams() { return projects.map(({ slug }) => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = projectBySlug((await params).slug);
  if (!project) return {};
  const description = project.summary;
  return {
    title: project.title,
    description,
    alternates: { canonical: `/work/${project.slug}` },
    openGraph: { type: 'article', title: `${project.title} — Soburr`, description, url: `/work/${project.slug}` },
    twitter: { card: 'summary_large_image', title: `${project.title} — Soburr`, description },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = projectBySlug((await params).slug);
  if (!project) notFound();
  const currentIndex = projects.findIndex((item) => item.slug === project.slug);
  const previous = projects[(currentIndex - 1 + projects.length) % projects.length];
  const next = projects[(currentIndex + 1) % projects.length];
  const demo = project.links?.demo;
  const repo = project.links?.repo;
  const hasStory = Boolean(project.problem || project.direction || project.decisions?.length);

  return <main className="portfolio-page detail-page" style={{ '--project-accent': project.color } as CSSProperties}>
    <a className="skip-link" href="#project-content">Skip to project details</a>
    <header className="portfolio-header">
      <Link href="/" className="brand-lockup" aria-label="Soburr home"><span className="brand-symbol" aria-hidden="true">S</span><span>SOBURR</span></Link>
      <nav className="portfolio-nav" aria-label="Main navigation"><Link href="/">Home</Link><Link href="/work">Work</Link><Link className="is-active" href="/work/archive" aria-current="page">Archive</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link></nav>
      <Link className="header-cta" href="/"> <i /> Explore my world <span aria-hidden="true">↗</span></Link>
    </header>
    <article className="project-detail" id="project-content">
      <Link className="back-to-work" href="/work">← <span>Back to work</span></Link>
      <div className="detail-divider" />
      <section className="detail-overview">
        <div className="detail-copy"><p className="eyebrow"><span /> {project.category}</p><p className="detail-index">PROJECT {project.number} / {project.status === 'live' ? 'LIVE' : 'BUILT'} · {project.year}</p><h1>{project.title}<span>.</span></h1><p className="detail-lede">{project.summary}</p>{project.direction && <p className="detail-description">{project.direction}</p>}<div className="detail-actions">{demo && <a className="button-primary" href={demo} target="_blank" rel="noreferrer">Live demo <span>↗</span></a>}{repo && <a className="button-quiet" href={repo} target="_blank" rel="noreferrer">Source <span>↗</span></a>}<Link className="button-quiet" href="/work/archive">All projects <span>→</span></Link></div></div>
        <aside className="detail-facts"><p className="detail-facts__title">Project overview</p><div><span>Discipline</span><strong>{project.category}</strong></div>{project.role && <div><span>Role</span><strong>{project.role}</strong></div>}{project.team && <div><span>Team</span><strong>{project.team}</strong></div>}<div><span>Technology</span><strong>{project.stack.join(' · ')}</strong></div><div><span>Status</span><strong>{project.status === 'live' ? 'Live' : 'Built'}</strong></div></aside>
      </section>
      <section className={`detail-showcase detail-showcase--${currentIndex + 1}`} aria-label={`${project.title} visual overview`}>
        <div className="detail-showcase__backdrop"><span/><i/><b/></div><div className="showcase-window"><div className="showcase-window__bar"><span/><span/><span/><p>{project.title.toLowerCase().replace(/\s/g, '')} / overview</p></div><div className="showcase-window__body"><div className="showcase-window__sidebar"><i/><i/><i/><i/></div><div className="showcase-window__main"><p className="showcase-window__eyebrow">PROJECT SPACE / {project.number}</p><h2>{project.title}</h2><p>{project.summary}</p><div className="showcase-window__metrics"><span/><span/><span/></div><div className="showcase-window__rows"><i/><i/><i/><i/></div></div></div></div><div className="detail-showcase__caption"><span>01 / CONCEPTUAL PROJECT ARTWORK</span><span>VISUALIZATION · NOT A PRODUCT SCREENSHOT</span></div>
      </section>
      {hasStory && <section className="detail-content-grid"><div className="detail-story">{project.problem && <><p className="eyebrow">01 / The challenge</p><h2>{project.problem}</h2></>}{project.direction && <p>{project.direction}</p>}{project.decisions?.length ? <><div className="detail-story__rule"/><p className="eyebrow">02 / Decisions that matter</p><ol className="decision-list">{project.decisions.map((decision, index) => <li key={decision}><span>0{index + 1}</span><p>{decision}</p></li>)}</ol></> : null}</div><aside className="detail-stack"><p className="eyebrow">Built with / explored through</p><h2>Tools &amp; disciplines</h2><div className="detail-stack__tags">{project.stack.map((item) => <span key={item}>{item}</span>)}</div><div className="detail-note"><span>↗</span><p>This case study summarizes the current project record. Specific implementation outcomes and performance metrics are not claimed unless independently documented.</p></div></aside></section>}
      <nav className="detail-pagination" aria-label="Browse other projects"><Link href={`/work/${previous.slug}`}><span>← PREVIOUS PROJECT</span><strong>{previous.title}</strong></Link><div className="detail-pagination__line"/><Link href={`/work/${next.slug}`}><span>NEXT PROJECT →</span><strong>{next.title}</strong></Link></nav>
    </article>
    <footer className="portfolio-footer"><span>© {new Date().getFullYear()} SOBURR</span><span>PRODUCT THINKING / SOFTWARE ENGINEERING</span><Link href="/work/archive">Back to archive ↑</Link></footer>
  </main>;
}
