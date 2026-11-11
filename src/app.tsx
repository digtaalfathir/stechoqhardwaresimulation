import { useEffect } from 'react';
import { href, useRoute } from './lib/router';
import { useT } from './lib/i18n';
import { Icon } from './components/icon';
import { SettingsMenu } from './components/settings-menu';
import { HomePage } from './pages/home';
import { ExplorerPage } from './pages/explorer';
import { SimulatorPage } from './pages/simulator';
import { DocsPage } from './pages/docs';
import { AboutPage } from './pages/about';
import { simulators } from './simulators/registry';
import './pages/pages.css';

const PRODUCT = 'Stechoq Hardware Simulation';

export function App() {
  const { path, segments } = useRoute();
  const t = useT();

  const NAV = [
    { path: '/', label: t('nav.home', 'Home') },
    { path: '/simulators', label: t('nav.simulators', 'Simulators') },
    { path: '/docs', label: t('nav.docs', 'Documentation') },
    { path: '/about', label: t('nav.about', 'About') },
  ];

  const isSimulators = segments[0] === 'simulators';

  const section =
    path === '/'
      ? null
      : isSimulators
        ? t('title.simulators', 'Simulators')
        : path === '/docs'
          ? t('title.docs', 'Documentation')
          : path === '/about'
            ? t('title.about', 'About')
            : null;

  useEffect(() => {
    document.title = section ? `${section} · ${PRODUCT}` : PRODUCT;
  }, [section]);

  return (
    <>
      <a className="skip-link" href="#main">
        {t('skip.content', 'Skip to content')}
      </a>
      <header className="masthead">
        <div className="container masthead-inner">
          <a className="brand" href={href('/')}>
            <span className="brand-mark">
              <Icon name="bolt" size={15} />
            </span>
            {PRODUCT}
          </a>
          <span className="brand-sub">{t('brand.sub', 'Virtual hardware laboratory - BayMax')}</span>
          <div className="masthead-right">
            <nav className="nav" aria-label="Main">
              {NAV.map((item) => {
                const current =
                  item.path === '/'
                    ? path === '/'
                    : item.path === '/simulators'
                      ? isSimulators
                      : path === item.path;
                return (
                  <a
                    key={item.path}
                    href={href(item.path)}
                    aria-current={current ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            <SettingsMenu />
          </div>
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
        <div className="container footer-grid">
          <div className="footer-brand">
            <a className="brand" href={href('/')}>
              <span className="brand-mark">
                <Icon name="bolt" size={15} />
              </span>
              {PRODUCT}
            </a>
            <p>
              {t(
                'footer.tagline',
                'virtual hardware laboratory for testing industrial device integrations without physical hardware.',
              )}
            </p>
          </div>
          <nav aria-label={t('nav.simulators', 'Simulators')}>
            <h4>{t('nav.simulators', 'Simulators')}</h4>
            {simulators.map((s) => (
              <a key={s.meta.id} href={href(`/simulators/${s.meta.id}`)}>
                {s.meta.name}
              </a>
            ))}
          </nav>
          <nav aria-label={t('footer.platform', 'Platform')}>
            <h4>{t('footer.platform', 'Platform')}</h4>
            {NAV.map((item) => (
              <a key={item.path} href={href(item.path)}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="container footer-bottom">
          <span>© Stechoq</span>
          <span className="mono">
            {t('footer.note', 'runs in your browser · REST requests go to the endpoint you configure')}
          </span>
        </div>
      </footer>
    </>
  );
}
