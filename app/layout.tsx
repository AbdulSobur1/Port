import type { Metadata, Viewport } from 'next';
import './globals.css';
import './ui.css';

export const metadata: Metadata = {
  title: 'Abdulsobur — portfolio street map',
  description:
    'Abdulsobur is a full-stack developer, computer science student and CEO of ChatBuddy. Explore his work as a street map: products, client and team work, training builds, early ideas, and how to contact him.',
  other: {
    'format-detection': 'telephone=no',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f1c2e',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
