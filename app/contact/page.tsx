import type { Metadata } from 'next';
import { profile } from '@/lib/profile';
import { WorldLoader } from '@/components/world/world-loader';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Signal Station — open a channel to reach Soburr.',
  alternates: { canonical: '/contact' },
};

export default function ContactCityPage() {
  return (
    <>
      <section className="sr-only" aria-labelledby="contact-heading">
        <h1 id="contact-heading">Contact {profile.name}</h1>
        <p>Have a product to build, a collaboration, or an engineering challenge? The GitHub profile is the current verified public route to reach {profile.handle}.</p>
        <p><a href={profile.github}>Open the GitHub profile</a></p>
      </section>
      <WorldLoader worldId="contact" />
    </>
  );
}
