import type { Metadata } from 'next';
import { WorldLoader } from '@/components/world/world-loader';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Signal Station — open a channel to reach Soburr.',
  alternates: { canonical: '/contact' },
};

export default function ContactCityPage() {
  return <WorldLoader worldId="contact" />;
}