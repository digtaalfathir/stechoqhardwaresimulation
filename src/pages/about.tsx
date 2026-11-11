import { href } from '../lib/router';
import { plannedSimulators, simulators } from '../simulators/registry';
import { DeviceArt } from '../components/device-art';
import { Icon } from '../components/icon';
import { PageBand } from '../components/page-band';
import { useT } from '../lib/i18n';

export function AboutPage() {
  const t = useT();
  return (
    <>
      <PageBand
        eyebrow={t('about.eyebrow', 'About')}
        title={t('about.title', 'Virtual hardware laboratory for testing industrial device integrations')}
        lede={t(
          'about.intro',
          'Industrial software is usually written next to industrial hardware. That hardware is expensive, there is one of it, it lives on a plant network, and it refuses to fail when you need it to. Stechoq Hardware Simulation removes that dependency: open a browser, pick a device, and work against its behaviour instead of the device itself.',
        )}
      />

      <div className="container">
        <div className="about-strip" aria-hidden="true">
          {simulators.map((s) => (
            <a key={s.meta.id} href={href(`/simulators/${s.meta.id}`)} tabIndex={-1}>
              <DeviceArt id={s.meta.id} />
            </a>
          ))}
        </div>

        <div className="about-grid">
          <section className="about-card">
            <h2>
              <Icon name="check" size={18} /> {t('about.is.title', 'What this is')}
            </h2>
            <ul>
              <li>{t('about.is.1', 'A playground for industrial device behaviour — state, actions, communication.')}</li>
              <li>{t('about.is.2', 'A source of realistic payloads for backend and integration work.')}</li>
              <li>{t('about.is.3', 'A way to reproduce edge cases on demand: an NG fastening, a missed tag, a tool fault.')}</li>
              <li>{t('about.is.4', 'A demo and training tool that does not need a crate of hardware to travel with it.')}</li>
            </ul>
          </section>
          <section className="about-card muted-card">
            <h2>
              <Icon name="lock" size={18} /> {t('about.isnot.title', 'What this is not')}
            </h2>
            <ul>
              <li>{t('about.isnot.1', 'Not a collection of mockups — each simulator is a real state machine.')}</li>
              <li>{t('about.isnot.2', 'Not a device driver, and not a replacement for final commissioning on real hardware.')}</li>
              <li>{t('about.isnot.3', 'Not a dashboard for live plant data.')}</li>
            </ul>
          </section>
        </div>

        <section className="principle">
          <p className="eyebrow">{t('about.principle.title', 'Product principle')}</p>
          <blockquote>
            {t(
              'about.principle.text',
              'One platform for simulating the behavior of industrial hardware. A simulator must reproduce device state, device actions and device communication. The UI is only the interface for controlling and observing the simulation, and the simulation engine stays independent from it.',
            )}
          </blockquote>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('about.roadmap.title', 'Roadmap')}</p>
              <h2>{t('about.roadmap.heading', 'Where it goes next')}</h2>
              <p>
                {t('about.roadmap.intro.a', 'The catalog already declares')} {plannedSimulators.length}{' '}
                {t('about.roadmap.intro.c', 'further devices. Alongside them:')}
              </p>
            </div>
          </div>
          <ol className="roadmap">
            {[
              t('about.roadmap.1b', 'Live transports for Modbus TCP and Open Protocol through the same local bridge as the PLC.'),
              t('about.roadmap.3', 'Persistent simulation sessions and shareable device setups.'),
              t('about.roadmap.4', 'Shared sessions, so a team can drive one simulated line together.'),
              t('about.roadmap.5', 'Scripted scenarios for regression and load testing.'),
            ].map((item, i) => (
              <li key={item}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <section className="cta-band">
          <div>
            <h2>{t('about.stechoq.title', 'Built by Stechoq')}</h2>
            <p>
              {t(
                'about.stechoq.text',
                'Stechoq builds industrial software for manufacturing lines. This platform started as internal tooling for exactly the problem above, and it grows a simulator at a time.',
              )}
            </p>
          </div>
          <div className="hero-actions">
            <a className="btn btn-lg hero-primary" href={href('/simulators')}>
              {t('about.cta.explore', 'Explore the simulators')} <Icon name="arrow" size={15} />
            </a>
            <a className="btn btn-lg hero-ghost" href={href('/docs')}>
              {t('about.cta.docs', 'Read the documentation')}
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
