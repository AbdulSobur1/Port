'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  districtById,
  districts,
  pageByZone,
  streetPlan,
  workBySlug,
  type District,
  type Work,
  type PageStop,
} from '@/lib/works';

/**
 * The phone version of the portfolio.
 *
 * It tells the same story as the 3D map: you travel down a street, and each
 * building you pass is one project. No WebGL, no map library. The stage is
 * CSS 3D: a road in perspective, and a building that grows from the horizon
 * as its chapter scrolls into view. One scroll listener writes a single
 * number per chapter (`--t`, 0 to 1) and CSS does the rest.
 */

type Stop = { zone: string; work?: Work; page?: PageStop; district: District };

function buildStops(): Stop[] {
  const out: Stop[] = [];
  for (const plan of streetPlan) {
    const district = districtById(plan.district);
    for (const zone of plan.zones) {
      if (zone.startsWith('project:')) {
        const work = workBySlug(zone.slice(8));
        if (work) out.push({ zone, work, district });
      } else {
        const page = pageByZone(zone);
        if (page) out.push({ zone, page, district });
      }
    }
  }
  return out;
}

export function StreetMark({ shape, color, size = 18 }: { shape: string; color: string; size?: number }) {
  const common = { fill: color, stroke: '#0f1c2e', strokeWidth: 1.5 } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden focusable="false" className="street-mark">
      {shape === 'circle' && <circle cx="10" cy="10" r="8" {...common} />}
      {shape === 'square' && <rect x="2.5" y="2.5" width="15" height="15" {...common} />}
      {shape === 'triangle' && <polygon points="10,2 18.5,17.5 1.5,17.5" {...common} />}
      {shape === 'diamond' && <polygon points="10,1.5 18.5,10 10,18.5 1.5,10" {...common} />}
      {shape === 'hexagon' && <polygon points="5.5,2.5 14.5,2.5 19,10 14.5,17.5 5.5,17.5 1,10" {...common} />}
    </svg>
  );
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function Journey() {
  const stops = useMemo(buildStops, []);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState(false);
  const showGaps = process.env.NEXT_PUBLIC_SHOW_GAPS !== '0';

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      let best = 0;
      let bestDistance = Infinity;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const span = r.height - vh;
        const t = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
        if (r.bottom > 0 && r.top < vh) el.style.setProperty('--t', reduce ? '0.55' : t.toFixed(4));
        // The current stop is the last scene whose top has passed the upper part of the screen.
        if (r.top < vh * 0.6) {
          best = i;
          bestDistance = 0;
        }
      });
      setActive((a) => (a === best ? a : best));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const current = stops[active] ?? stops[0];
  const inStreet = stops.filter((s) => s.district.id === current.district.id);
  const position = inStreet.findIndex((s) => s.zone === current.zone) + 1;

  const go = (zone: string) => {
    const i = stops.findIndex((s) => s.zone === zone);
    setMenu(false);
    refs.current[i]?.scrollIntoView({ behavior: 'auto', block: 'start' });
  };

  return (
    <div className="journey" style={{ ['--street' as string]: current.district.color }}>
      <header className="journey__bar">
        <StreetMark shape={current.district.shape} color={current.district.color} size={22} />
        <div className="journey__where">
          <strong>{current.district.name}</strong>
          <small>
            {current.district.street} · {position} of {inStreet.length}
          </small>
        </div>
        <button className="journey__menu" onClick={() => setMenu(true)} aria-haspopup="dialog">
          Street guide
        </button>
      </header>

      <section className="journey__cover" aria-labelledby="journey-title">
        <p className="journey__kicker">Abdulsobur’s portfolio</p>
        <h1 id="journey-title">A street map of everything I have built.</h1>
        <p>
          I am a full-stack developer and the CEO of ChatBuddy. Scroll to travel down the street.
          Each building is one project, and each street is one kind of work.
        </p>
        <ul className="journey__legend">
          {districts.map((d) => (
            <li key={d.id}>
              <StreetMark shape={d.shape} color={d.color} size={20} />
              <span>
                <strong>{d.name}</strong>
                <small>{d.blurb}</small>
              </span>
            </li>
          ))}
        </ul>
        <p className="journey__scroll" aria-hidden>Scroll down</p>
      </section>

      {stops.map((stop, i) => {
        const prev = stops[i - 1];
        const newStreet = !prev || prev.district.id !== stop.district.id;
        const title = stop.work?.title ?? stop.page!.title;
        const kind = stop.work?.kind ?? stop.page!.kind;
        const line = stop.work?.line ?? stop.page!.line;
        const h = hash(stop.zone);
        const floors = 3 + Math.floor(h * 3);
        const side = i % 2 === 0 ? -1 : 1;
        return (
          <article
            key={stop.zone}
            id={`stop-${stop.zone.replace(':', '-')}`}
            className="stop"
            data-side={side}
            style={{ ['--street' as string]: stop.district.color }}
            aria-labelledby={`stop-title-${i}`}
          >
            <div
              className="stop__scene"
              ref={(el) => {
                refs.current[i] = el;
              }}
            >
            <div className="stop__pin">
              <div className="stop__sky" aria-hidden />
              <div className="stop__world" aria-hidden>
                <div className="stop__road" />
                {newStreet && (
                  <div className="stop__streetsign">
                    <StreetMark shape={stop.district.shape} color={stop.district.color} size={26} />
                    <span>{stop.district.street}</span>
                  </div>
                )}
                <div className="stop__building" style={{ ['--floors' as string]: floors }}>
                  <div className="stop__face stop__face--front">
                    <div className="stop__sign">{title}</div>
                    <div className="stop__windows">
                      {Array.from({ length: floors * 4 }).map((_, w) => (
                        <i key={w} className={hash(stop.zone + w) > 0.72 ? 'is-lit' : ''} />
                      ))}
                    </div>
                    <div className="stop__door" />
                  </div>
                  <div className="stop__face stop__face--side" />
                  <div className="stop__face stop__face--roof" />
                </div>
              </div>
              <div className="stop__card">
                <p className="stop__where">
                  {stop.district.name}
                  {stop.work ? ` · ${stop.work.status}` : ''}
                </p>
                <h2 id={`stop-title-${i}`}>{title}</h2>
                <p className="stop__kind">{kind}</p>
                <p className="stop__line">{line}</p>
              </div>
            </div>
            </div>
            <div className="stop__detail">
              {stop.work && (
                <>
                  <dl className="stop__facts">
                    <div><dt>My role</dt><dd>{stop.work.role}</dd></div>
                    <div><dt>Team</dt><dd>{stop.work.team}</dd></div>
                    {stop.work.stack.length > 0 && <div><dt>Built with</dt><dd>{stop.work.stack.join(', ')}</dd></div>}
                  </dl>
                  {stop.work.story.map((part) => (
                    <div key={part.heading} className="stop__story">
                      <h3>{part.heading}</h3>
                      <p>{part.body}</p>
                    </div>
                  ))}
                  <div className="stop__actions">
                    {stop.work.links.map((l) => (
                      <a key={l.href} className="btn btn--primary" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                    ))}
                    <Link className="btn" href={`/work/${stop.work.slug}`}>Open the full page</Link>
                  </div>
                </>
              )}
              {stop.page && (
                <>
                  {stop.page.body.map((p) => (
                    <p key={p.slice(0, 20)} className="stop__story-p">{p}</p>
                  ))}
                  <div className="stop__actions">
                    {stop.page.links.map((l) => (
                      <a key={l.href} className="btn btn--primary" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                    ))}
                  </div>
                </>
              )}
              {showGaps && (stop.work?.gaps ?? stop.page?.gaps ?? []).length > 0 && (
                <div className="gaps" role="note">
                  <strong>Still to add (only you see this)</strong>
                  <ul>
                    {(stop.work?.gaps ?? stop.page?.gaps ?? []).map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </article>
        );
      })}

      <footer className="journey__end">
        <h2>End of the street</h2>
        <p>Thanks for visiting. The fastest way to reach me today is GitHub.</p>
        <a className="btn btn--primary" href="https://github.com/AbdulSobur1" target="_blank" rel="noreferrer">GitHub profile</a>
        <p className="journey__credit">Street names and building shapes come from OpenStreetMap data © OpenStreetMap contributors (ODbL).</p>
      </footer>

      {menu && (
        <div className="guide" role="dialog" aria-modal="true" aria-label="Street guide">
          <header>
            <h2>Street guide</h2>
            <button className="journey__menu" onClick={() => setMenu(false)}>Close</button>
          </header>
          <div className="guide__scroll">
            {streetPlan.map((plan) => {
              const d = districtById(plan.district);
              return (
                <section key={d.id}>
                  <h3><StreetMark shape={d.shape} color={d.color} size={20} /> <span>{d.name}<small>{d.street}</small></span></h3>
                  <ul>
                    {plan.zones.map((z) => {
                      const s = stops.find((x) => x.zone === z)!;
                      return (
                        <li key={z}>
                          <button onClick={() => go(z)}>
                            <strong>{s.work?.title ?? s.page!.title}</strong>
                            <small>{s.work ? `${s.work.kind} · ${s.work.status}` : s.page!.kind}</small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
