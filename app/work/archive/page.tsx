import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { forks, liveProjectCount, projects } from '@/lib/projects';
import WorkGallery from '@/components/work/work-gallery';

export const metadata: Metadata = {
  title: 'Work Archive | Soburr',
  description: 'Selected product and engineering work by Soburr across AI, culture, fintech, community, healthcare, media, and education.',
};

export default function WorkArchivePage() {
  return (
    <main className="portfolio-page work-page">
      <header className="portfolio-header">
        <Link href="/" className="brand-lockup" aria-label="Soburr home"><span className="brand-symbol">S</span><span>SOBURR</span></Link>
        <nav className="portfolio-nav" aria-label="Main navigation">
          <Link href="/">Home</Link><Link href="/work">Work</Link><Link className="is-active" href="/work/archive" aria-current="page">Archive</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link>
        </nav>
        <Link className="header-cta" href="/"><i /> Explore my world <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="work-hero" aria-labelledby="work-title">
        <div className="work-hero__copy">
          <p className="eyebrow"><span /> Selected work / Product &amp; engineering</p>
          <h1 id="work-title">Real projects.<br />Practical solutions.<br /><em>Built for impact.</em></h1>
          <p className="work-hero__lede">A collection of projects exploring useful technology, thoughtful product decisions, and experiences designed around real problems.</p>
          <div className="work-hero__meta"><span>{String(projects.length).padStart(2, '0')} PROJECTS</span><span>{String(liveProjectCount).padStart(2, '0')} LIVE DEMOS</span><span>AI · WEB · FINTECH · PLATFORMS</span></div>
        </div>
        <div className="city-art city-art--hero" aria-label="Abstract illustrated night city with a glowing circular landmark" role="img">
          <div className="city-art__moon" /><div className="city-art__skyline">
            {Array.from({ length: 17 }, (_, i) => <span key={i} style={{ '--i': i, '--h': `${34 + ((i * 29) % 53)}%` } as CSSProperties} />)}
          </div>
          <div className="city-art__ring"><i /><b /></div><div className="city-art__road" /><div className="city-art__car"><i /><b /></div>
          <span className="city-art__caption">A WORLD BUILT AROUND THE WORK</span>
        </div>
      </section>

      <section className="work-section" aria-labelledby="projects-title">
        <div className="section-heading"><div><p className="eyebrow">01 / The archive</p><h2 id="projects-title">Selected projects<span>.</span></h2></div><p>Explore the thinking, constraints, and product direction behind each build. Deployed projects link to a live demo.</p></div>
        <WorkGallery projects={projects} />
      </section>

      <section className="work-section work-forks" aria-labelledby="forks-title">
        <div className="section-heading"><div><p className="eyebrow">02 / Contributions</p><h2 id="forks-title">Forks &amp; open source<span>.</span></h2></div><p>Public forks and downstream work on other people&apos;s open-source projects, kept separate from original builds.</p></div>
        <ul className="fork-list">
          {forks.map((fork) => (
            <li className="fork-card" key={fork.name}>
              <div className="fork-card__head"><h3>{fork.name}</h3>{fork.language && <span className="fork-card__lang">{fork.language}</span>}</div>
              <p>{fork.description}</p>
              <div className="fork-card__actions">
                {fork.demo && <a href={fork.demo} target="_blank" rel="noreferrer">Live <span aria-hidden="true">↗</span></a>}
                <a href={fork.repo} target="_blank" rel="noreferrer">Repository <span aria-hidden="true">↗</span></a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="work-cta"><div><p className="eyebrow">Have a project in mind?</p><h2>Let’s build something<br /><em>worth exploring.</em></h2><p>Have an idea, collaboration, or engineering challenge? Find me through GitHub and let’s start a conversation.</p><a className="button-primary" href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">Connect on GitHub <span>↗</span></a></div><div className="work-cta__landscape" aria-hidden="true"><span/><i/><b/></div></section>
      <footer className="portfolio-footer"><span>© {new Date().getFullYear()} SOBURR</span><span>PRODUCT THINKING / SOFTWARE ENGINEERING</span><a href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub ↗</a></footer>
    </main>
  );
}