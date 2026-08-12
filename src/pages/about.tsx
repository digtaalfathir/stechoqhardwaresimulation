import { href } from '../lib/router';
import { plannedSimulators } from '../simulators/registry';
import { useT } from '../lib/i18n';

export function AboutPage() {
  const t = useT();
  return (
    <div className="container">
      <div className="prose">
        <p className="eyebrow">{t('about.eyebrow', 'About')}</p>
        <h2 style={{ fontSize: 24, marginTop: 4 }}>
          {t(
            'about.title',
            'Virtual hardware laboratory for testing industrial device integrations',
          )}
        </h2>
        <p>
          {t(
            'about.intro',
            'Industrial software is usually written next to industrial hardware. That hardware is expensive, there is one of it, it lives on a plant network, and it refuses to fail when you need it to. Stechoq Hardware Simulation removes that dependency: open a browser, pick a device, and work against its behaviour instead of the device itself.',
          )}
        </p>

        <h2>{t('about.is.title', 'What this is')}</h2>
        <ul>
          <li>
            {t('about.is.1', 'A playground for industrial device behaviour — state, actions, communication.')}
          </li>
          <li>{t('about.is.2', 'A source of realistic payloads for backend and integration work.')}</li>
          <li>
            {t(
              'about.is.3',
              'A way to reproduce edge cases on demand: an NG fastening, a missed tag, a tool fault.',
            )}
          </li>
          <li>
            {t(
              'about.is.4',
              'A demo and training tool that does not need a crate of hardware to travel with it.',
            )}
          </li>
        </ul>

        <h2>{t('about.isnot.title', 'What this is not')}</h2>
        <ul>
          <li>{t('about.isnot.1', 'Not a collection of mockups — each simulator is a real state machine.')}</li>
          <li>
            {t(
              'about.isnot.2',
              'Not a device driver, and not a replacement for final commissioning on real hardware.',
            )}
          </li>
          <li>{t('about.isnot.3', 'Not a dashboard for live plant data.')}</li>
        </ul>

        <h2>{t('about.principle.title', 'Product principle')}</h2>
        <div className="callout">
          <p>
            {t(
              'about.principle.text',
              'One platform for simulating the behavior of industrial hardware. A simulator must reproduce device state, device actions and device communication. The UI is only the interface for controlling and observing the simulation, and the simulation engine stays independent from it.',
            )}
          </p>
        </div>

        <h2>{t('about.roadmap.title', 'Roadmap')}</h2>
        <p>
          {t('about.roadmap.intro.a', 'The catalog already declares')} {plannedSimulators.length}{' '}
          {t(
            'about.roadmap.intro.b',
            'further devices across identification, vision, factory equipment and pure communication endpoints. Alongside them:',
          )}
        </p>
        <ul>
          <li>{t('about.roadmap.1', 'Live transports — WebSocket, MQTT, TCP and REST against your own backend.')}</li>
          <li>{t('about.roadmap.2', 'Modbus register maps and raw frame views in the inspector.')}</li>
          <li>{t('about.roadmap.3', 'Persistent simulation sessions and shareable device setups.')}</li>
          <li>{t('about.roadmap.4', 'Shared sessions, so a team can drive one simulated line together.')}</li>
          <li>{t('about.roadmap.5', 'Scripted scenarios for regression and load testing.')}</li>
        </ul>

        <h2>{t('about.stechoq.title', 'Built by Stechoq')}</h2>
        <p>
          {t(
            'about.stechoq.text',
            'Stechoq builds industrial software for manufacturing lines. This platform started as internal tooling for exactly the problem above, and it grows a simulator at a time.',
          )}
        </p>
        <p>
          <a href={href('/simulators')}>{t('about.cta.explore', 'Explore the simulators')}</a> ·{' '}
          <a href={href('/docs')}>{t('about.cta.docs', 'Read the documentation')}</a>
        </p>
      </div>
    </div>
  );
}
