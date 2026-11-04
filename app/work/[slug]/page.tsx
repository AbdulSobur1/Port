import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { districtById, workBySlug, works } from '@/lib/works';
import { StreetMark } from '@/components/journey/journey';

export function generateStaticParams() {
  return works.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const work = workBySlug((await params).slug);
  return work ? { title: `${work.title} | Abdulsobur`, description: work.line } : {};
}

export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const work = workBySlug((await params).slug);
  if (!work) notFound();
  const d = districtById(work.district);
  const showGaps = process.env.NEXT_PUBLIC_SHOW_GAPS !== '0';

  return (
    <main className="case-page">
      <header className="case-header">
        <Link href="/">Back to the street map</Link>
        <Link href="/work">All work</Link>
      </header>
      <article className="case" style={{ ['--street' as string]: d.color }}>
        <p className="case-index">
          <StreetMark shape={d.shape} color={d.color} size={20} /> {d.name} · {d.street}
        </p>
        <h1>{work.title}</h1>
        <p className="case-status">{work.status}{work.confidential ? ' · Details are confidential' : ''}</p>
        <p className="case-lede">{work.line}</p>
        <dl className="case-facts">
          <div><dt>What it is</dt><dd>{work.kind}</dd></div>
          <div><dt>My role</dt><dd>{work.role}</dd></div>
          <div><dt>Team</dt><dd>{work.team}</dd></div>
          {work.stack.length > 0 && <div><dt>Built with</dt><dd>{work.stack.join(', ')}</dd></div>}
        </dl>
        {work.story.map((part) => (
          <section key={part.heading}>
            <h2>{part.heading}</h2>
            <p className="case-body">{part.body}</p>
          </section>
        ))}
        {work.links.length > 0 && (
          <div className="case-actions">
            {work.links.map((l) => (
              <a key={l.href} className="case-button" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
            ))}
          </div>
        )}
        {showGaps && work.gaps.length > 0 && (
          <div className="gaps gaps--page" role="note">
            <strong>Still to add (only you see this)</strong>
            <ul>{work.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          </div>
        )}
      </article>
    </main>
  );
}
