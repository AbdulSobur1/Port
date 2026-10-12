import type { Metadata } from 'next';
import { WorldScene } from '@/components/world/world-scene';

export const metadata: Metadata = {
  title: 'About | Soburr',
  description: 'Reflection Gardens — the person behind the work, explored as a 3D city.',
};

export default function AboutCityPage() {
  return <WorldScene worldId="about" />;
}