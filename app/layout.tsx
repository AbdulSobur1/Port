import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soburr - Software Engineer',
  description: 'Soburr builds useful systems across AI, fintech, healthcare, and community.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
