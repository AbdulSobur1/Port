import type { Metadata } from 'next';
import Link from 'next/link';
import { districtById, streetPlan, workBySlug } from '@/lib/works';
import { StreetMark } from '@/components/journey/journey';

export const metadata: Metadata = {
  title: 'All work | Abdulsobur',
  description: 'Every project by Abdulsobur, grouped by kind: products, client and team work, training builds, and early ideas.',
};

export default function WorkIndex() {
  return (
    <main className="case-page">
      <header className="case-header">
        <Link href="/">Back to the street map</Link>
        <a href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub profile</a>
      </header>
      <article className="case">
        <h1>All work</h1>
        <p className="case-lede">The same projects as the street map, as a plain list. Each group is one street.</p>
        {streetPlan
          .filter((p) => p.district !== 'about')
          .map((plan) => {
            const d = districtById(plan.district);
            return (
              <section key={d.id} className="work-group">
                <h2><StreetMark shape={d.shape} color={d.color} size={24} /> {d.name}</h2>
                <p className="work-group__blurb">{d.blurb} Street: {d.street}.</p>
                <ul>
                  {plan.zones.map((z) => {
                    const w = workBySlug(z.replace('project:', ''));
                    if (!w) return null;
                    return (
                      <li key={w.slug}>
                        <Link href={`/work/${w.slug}`}>
                          <strong>{w.title}</strong>
                          <span>{w.line}</span>
                          <small>{w.kind} · {w.status}</small>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
      </article>
    </main>
  );
}
