import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="masthead">
      <header className="masthead__bar">
        <span className="hud-brand__mark">SOBURR</span>
        <span className="hud-brand__sub">404 / lost signal</span>
      </header>
      <div className="fallback">
        <p className="eyebrow">404 / lost signal</p>
        <h1>This route is not in the world.</h1>
        <p>Return to the map to continue exploring the work.</p>
        <div className="fallback__actions">
          <Link className="world-button world-button--primary" href="/">Return to world</Link>
        </div>
      </div>
    </main>
  );
}
