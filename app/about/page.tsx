import type { Metadata } from 'next';
import { profile } from '@/lib/profile';
import { WorldLoader } from '@/components/world/world-loader';

export const metadata: Metadata = {
  title: 'About',
  description: 'Reflection Gardens — the person behind the work, explored as a 3D city.',
  alternates: { canonical: '/about' },
};

export default function AboutCityPage() {
  return (
    <>
      <section className="sr-only" aria-labelledby="about-heading">
        <h1 id="about-heading">About {profile.name}</h1>
        <p>{profile.bio}</p>
        <h2>Skills and tools</h2>
        <ul>{profile.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
        <p>See the <a href="/work/archive">full work archive</a> or <a href="/contact">get in touch</a>.</p>
      </section>
      <WorldLoader worldId="about" />
    </>
  );
}
