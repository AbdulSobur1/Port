import { profile } from '@/lib/profile';
import { WorldLoader } from '@/components/world/world-loader';

export default function Home() {
  return (
    <>
      <section className="sr-only" aria-labelledby="home-heading">
        <h1 id="home-heading">{profile.name} — {profile.role}</h1>
        <p>{profile.bio}</p>
        <p>Browse the <a href="/work/archive">work archive</a>, read more <a href="/about">about {profile.handle}</a>, or <a href="/contact">get in touch</a>.</p>
      </section>
      <WorldLoader />
    </>
  );
}
