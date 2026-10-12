import type { Metadata } from 'next';
import { WorldScene } from '@/components/world/world-scene';

export const metadata: Metadata = {
  title: 'Contact | Soburr',
  description: 'Signal Station — open a channel to reach Soburr.',
};

export default function ContactCityPage() {
  return <WorldScene worldId="contact" />;
}