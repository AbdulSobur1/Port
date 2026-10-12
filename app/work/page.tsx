import type { Metadata } from 'next';
import { WorldLoader } from '@/components/world/world-loader';

export const metadata: Metadata = {
  title: 'Work District',
  description: 'Drive through the Work District — every project, one street, built in 3D.',
  alternates: { canonical: '/work' },
};

export default function WorkCityPage() {
  return <WorldLoader worldId="work" />;
}