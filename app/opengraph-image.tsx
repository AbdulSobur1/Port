import { ImageResponse } from 'next/og';
import { siteUrl } from '@/lib/site';

export const alt = 'Soburr — Software Engineer';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const host = siteUrl.replace(/^https?:\/\//, '');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0d1a17 0%, #09100f 60%)',
          padding: '72px',
          color: '#edf1eb',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#d8f851', fontSize: 24, letterSpacing: 5, textTransform: 'uppercase' }}>
          <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 999, background: '#d8f851' }} />
          Soburr / Portfolio
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, lineHeight: 1.02 }}>Software Engineer</div>
          <div style={{ display: 'flex', fontSize: 34, color: '#a9b6ac', maxWidth: 940 }}>Useful systems across AI, fintech, healthcare, and community - built as an interactive 3D world.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#7f8c83' }}>
          <span>{host}</span>
          <span>Drive / Explore / Read</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
