import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { projectBySlug, projects } from '@/lib/projects';

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const project = projectBySlug((await params).slug);
  return project ? { title: `${project.title} | Soburr` , description: project.summary } : {};
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const project = projectBySlug((await params).slug);
  if (!project) notFound();

  return <main className="case-page">
    <header className="case-header">
      <Link href="/">Back to world</Link>
      <a href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub profile</a>
    </header>
    <article className="case">
      <p className="case-index">{project.number} / {project.category}</p>
      <h1>{project.title}</h1>
      <p className="case-lede">{project.summary}</p>
      <dl className="case-facts">
        <div><dt>ROLE</dt><dd>{project.role}</dd></div>
        <div><dt>TEAM</dt><dd>{project.team}</dd></div>
        <div><dt>SOURCE</dt><dd>Private repository</dd></div>
      </dl>
      <section>
        <p className="case-label">THE PROBLEM</p>
        <h2>{project.problem}</h2>
      </section>
      <section className="case-direction">
        <p className="case-label">PRODUCT DIRECTION</p>
        <p>{project.direction}</p>
      </section>
      <section>
        <p className="case-label">DECISIONS THAT MATTER</p>
        <ol>{project.decisions.map((decision, index) => <li key={decision}><span>0{index + 1}</span>{decision}</li>)}</ol>
      </section>
      <section className="source-note">
        <p className="case-label">SOURCE ACCESS</p>
        <p>This public case record documents scope and team context without exposing private code, credentials, or internal implementation details.</p>
        <a className="case-button" href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">Visit GitHub profile</a>
      </section>
    </article>
  </main>;
}
