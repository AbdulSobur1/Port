import Link from 'next/link';

export default function NotFound() {
  return <main className="fallback"><div className="fallback__inner"><p className="case-label">404 / LOST SIGNAL</p><h1>This route is not in the world.</h1><p>Return to the map to continue exploring Soburr's work.</p><Link className="case-button" href="/">Return to world</Link></div></main>;
}
