import type { Metadata } from 'next';
import { WorldLoader } from '@/components/world/world-loader';

export const metadata: Metadata = {
  title: 'About | Soburr',
  description: 'Reflection Gardens — the person behind the work, explored as a 3D city.',
};

export default function AboutCityPage() {
  return <WorldLoader worldId="about" />;
}