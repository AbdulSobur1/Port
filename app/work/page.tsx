import type { Metadata } from 'next';
import { WorldScene } from '@/components/world/world-scene';

export const metadata: Metadata = {
  title: 'Work District | Soburr',
  description: 'Drive through the Work District — every project, one street, built in 3D.',
};

export default function WorkCityPage() {
  return <WorldScene worldId="work" />;
}