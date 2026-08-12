import { useEffect } from 'react';
import { href, useRoute } from './lib/router';
import { Icon } from './components/icon';
import { HomePage } from './pages/home';
import { ExplorerPage } from './pages/explorer';
import { SimulatorPage } from './pages/simulator';
import { DocsPage } from './pages/docs';
import { AboutPage } from './pages/about';

const NAV = [
  { path: '/', label: 'Home' },
  { path: '/simulators', label: 'Simulators' },
  { path: '/docs', label: 'Documentation' },
  { path: '/about', label: 'About' },
];

const TITLES: Record<string, string> = {
  '/': 'Stechoq Hardware Simulation',
  '/simulators': 'Simulators · Stechoq Hardware Simulation',
  '/docs': 'Documentation · Stechoq Hardware Simulation',
  '/about': 'About · Stechoq Hardware Simulation',
};

export function App() {
  const { path, segments } = useRoute();

  useEffect(() => {
    document.title = TITLES[path] ?? 'Simulator · Stechoq Hardware Simulation';
  }, [path]);

  const isSimulators = segments[0] === 'simulators';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="container masthead-inner">
          <a className="brand" href={href('/')}>
            <span className="brand-mark">
              <Icon name="bolt" size={15} />
            </span>
            Stechoq Hardware Simulation
          </a>
          <span className="brand-sub">Virtual hardware laboratory</span>
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => {
              const current =
                item.path === '/' ? path === '/' : item.path === '/simulators' ? isSimulators : path === item.path;
              return (
                <a key={item.path} href={href(item.path)} aria-current={current ? 'page' : undefined}>
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main id="main">
        {isSimulators ? (
          segments.length > 1 ? (
            <SimulatorPage id={segments[1]} />
          ) : (
            <ExplorerPage />
          )
        ) : path === '/docs' ? (
          <DocsPage />
        ) : path === '/about' ? (
          <AboutPage />
        ) : (
          <HomePage />
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>
            <strong style={{ color: 'var(--ink-2)' }}>Stechoq Hardware Simulation</strong> — virtual
            hardware laboratory for testing industrial device integrations without physical hardware.
          </span>
          <span className="mono" style={{ fontSize: 11.5 }}>
            runs entirely in your browser · no device traffic leaves this page
          </span>
        </div>
      </footer>
    </>
  );
}
