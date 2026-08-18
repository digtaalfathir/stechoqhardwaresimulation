import { CATEGORIES, categoryCounts, plannedSimulators, simulators } from '../simulators/registry';
import { DeviceCard, PlannedRow } from '../components/device-card';
import { Icon } from '../components/icon';
import { href } from '../lib/router';
import { useT, type Translate } from '../lib/i18n';

const steps = (t: Translate) => [
  {
    title: t('step.choose.title', 'Choose a Device'),
    text: t('step.choose.text', 'Select the hardware you want to simulate from the catalog.'),
  },
  {
    title: t('step.configure.title', 'Configure'),
    text: t(
      'step.configure.text',
      'Set device parameters — IP address, reader ID, port, antenna, protocol, torque target.',
    ),
  },
  {
    title: t('step.simulate.title', 'Simulate'),
    text: t('step.simulate.text', 'Trigger actions exactly like the real device would perform them.'),
  },
  {
    title: t('step.inspect.title', 'Inspect'),
    text: t('step.inspect.text', 'Watch status, events, payloads, responses and communication logs.'),
  },
];

const reasons = (t: Translate) => [
  {
    icon: 'bolt',
    title: t('reason.expensive.title', 'Hardware is expensive'),
    text: t(
      'reason.expensive.text',
      'A single tightening controller or RFID gate costs more than the software that talks to it. Simulate the interface instead of buying the device.',
    ),
  },
  {
    icon: 'lock',
    title: t('reason.scarce.title', 'Hardware is scarce'),
    text: t(
      'reason.scarce.text',
      'One device, many developers. A simulator gives every engineer their own instance, all day, with no booking sheet.',
    ),
  },
  {
    icon: 'broadcast',
    title: t('reason.share.title', 'Hardware is hard to share'),
    text: t(
      'reason.share.text',
      'Devices live on a plant network behind a firewall. A browser-based simulator travels with the person who needs it.',
    ),
  },
  {
    icon: 'grid',
    title: t('reason.remote.title', 'Remote testing is painful'),
    text: t(
      'reason.remote.text',
      'You cannot pull a trigger on a handheld reader over VPN. Here you can, from anywhere.',
    ),
  },
  {
    icon: 'wrench',
    title: t('reason.edge.title', 'Edge cases barely happen'),
    text: t(
      'reason.edge.text',
      'An NG fastening, a spindle fault, a tag that never reads — all one click away instead of one lucky shift.',
    ),
  },
  {
    icon: 'check',
    title: t('reason.repeat.title', 'Integrations need repetition'),
    text: t(
      'reason.repeat.text',
      'Deterministic, repeatable device behaviour is what integration tests and demos actually need.',
    ),
  },
];

const useCases = (t: Translate) => [
  t('use.dev', 'Development'),
  t('use.integration', 'Integration testing'),
  t('use.backend', 'Backend development'),
  t('use.frontend', 'Frontend development'),
  t('use.qa', 'QA'),
  t('use.demo', 'Demonstration'),
  t('use.training', 'Training'),
  t('use.debug', 'Debugging'),
];

export function HomePage() {
  const t = useT();
  const rfid = simulators[0];

  return (
    <div className="container">
      <section className="hero">
        <div>
          <p className="eyebrow">Stechoq Hardware Simulation</p>
          <h1>
            {t('home.h1', 'Simulate Hardware. Test Integrations. No Hardware Required.')}
          </h1>
          <p className="hero-lede">
            {t(
              'home.lede',
              'Explore virtual industrial devices and reproduce their behavior directly from your browser — device state, device actions and the exact data your backend would receive.',
            )}
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-lg" href={href('/simulators')}>
              {t('home.cta.explore', 'Explore Simulators')}
              <Icon name="arrow" size={15} />
            </a>
            <a className="btn btn-lg" href={href('/docs')}>
              {t('home.cta.how', 'How It Works')}
            </a>
          </div>
          <div className="hero-facts">
            <div>
              <b>{simulators.length}</b> {t('home.fact.live', 'simulators live')}
            </div>
            <div>
              <b>{plannedSimulators.length}</b> {t('home.fact.catalog', 'in the catalog')}
            </div>
            <div>
              <b>0</b> {t('home.fact.plug', 'devices to plug in')}
            </div>
            <div>
              <b>100%</b> {t('home.fact.browser', 'in-browser')}
            </div>
          </div>
        </div>

        <aside className="panel" aria-label={t('home.example.aria', 'Example device output')}>
          <div className="panel-head">
            <span className="panel-title">rfid-handheld</span>
            <span className="status t-ok">
              <span className="dot" />
              CONNECTED
            </span>
            <div className="spacer" />
            <span className="chip">REST</span>
          </div>
          <table className="state-table">
            <tbody>
              <tr>
                <th scope="row">Event</th>
                <td className="mono t-ok">RFID_SCANNED</td>
              </tr>
              <tr>
                <th scope="row">Reader ID</th>
                <td className="mono">FX96006A57B4</td>
              </tr>
              <tr>
                <th scope="row">Antenna</th>
                <td className="mono">1</td>
              </tr>
            </tbody>
          </table>
          <pre className="code">{JSON.stringify(rfid.samplePayload(), null, 2)}</pre>
          <p className="panel-note">
            {t(
              'home.example.note',
              'This is the request body your backend would receive from the physical reader.',
            )}
          </p>
        </aside>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>{t('home.explorer.title', 'Simulator Explorer')}</h2>
            <p>
              {t(
                'home.explorer.sub',
                'Devices grouped the way a plant is: by what they identify, drive, see or speak.',
              )}
            </p>
          </div>
          <a className="btn btn-sm" href={href('/simulators')} style={{ marginLeft: 'auto' }}>
            {t('home.viewall', 'View all')}
          </a>
        </div>
        <div className="grid cards">
          {simulators.map((s) => (
            <DeviceCard key={s.meta.id} sim={s} />
          ))}
        </div>
        <div className="usecases" style={{ marginTop: 12 }}>
          {CATEGORIES.map((c) => {
            const { live, planned } = categoryCounts(c);
            return (
              <span className="usecase" key={c}>
                {c}
                <span>
                  {live} {t('count.live', 'live')} / {planned} {t('count.planned', 'planned')}
                </span>
              </span>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>{t('home.how.title', 'How It Works')}</h2>
            <p>{t('home.how.sub', 'Choose → Configure → Simulate → Inspect.')}</p>
          </div>
        </div>
        <div className="grid steps">
          {steps(t).map((s, i) => (
            <div className="step" key={s.title}>
              <span className="step-index">
                {t('home.step', 'STEP')} {String(i + 1).padStart(2, '0')}
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>{t('home.why.title', 'Why Hardware Simulation?')}</h2>
            <p>
              {t(
                'home.why.sub',
                'The hardware is rarely the bottleneck by choice — it is the bottleneck because there is only one of it, it lives somewhere else, and it never fails on demand.',
              )}
            </p>
          </div>
        </div>
        <div className="grid reasons">
          {reasons(t).map((r) => (
            <div className="reason" key={r.title}>
              <span className="icon-slot">
                <Icon name={r.icon} size={19} />
              </span>
              <div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>{t('home.engineers.title', 'Built for Engineers')}</h2>
            <p>
              {t(
                'home.engineers.sub',
                'A simulator reproduces three things: device state, device actions and device communication. That is enough to build against, test against and demonstrate with.',
              )}
            </p>
          </div>
        </div>
        <div className="usecases">
          {useCases(t).map((u) => (
            <span className="usecase" key={u}>
              <span>✓</span>
              {u}
            </span>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>{t('home.soon.title', 'Coming Soon')}</h2>
            <p>{t('home.soon.sub', 'Declared in the catalog and next in line for implementation.')}</p>
          </div>
          <a className="btn btn-sm" href={href('/simulators')} style={{ marginLeft: 'auto' }}>
            {t('home.soon.cta', 'See the full catalog')}
          </a>
        </div>
        <div className="planned-grid">
          {plannedSimulators.map((d) => (
            <PlannedRow key={d.id} device={d} />
          ))}
        </div>
      </section>
    </div>
  );
}
