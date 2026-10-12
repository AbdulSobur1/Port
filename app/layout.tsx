import type { Metadata, Viewport } from 'next';
import { siteAuthor, siteDescription, siteName, siteTitle, siteUrl } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: `%s — ${siteName}` },
  description: siteDescription,
  applicationName: `${siteName} Portfolio`,
  authors: [{ name: siteAuthor }],
  creator: siteAuthor,
  keywords: ['Soburr', 'Abdul Sobur', 'software engineer', 'portfolio', 'React', 'Next.js', 'TypeScript', 'Three.js', 'AI', 'fintech'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: { card: 'summary_large_image', title: siteTitle, description: siteDescription },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#09100f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
