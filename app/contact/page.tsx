import type { Metadata } from 'next';
import { WorldLoader } from '@/components/world/world-loader';

export const metadata: Metadata = {
  title: 'Contact | Soburr',
  description: 'Signal Station — open a channel to reach Soburr.',
};

export default function ContactCityPage() {
  return <WorldLoader worldId="contact" />;
}