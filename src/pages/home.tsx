import { plannedSimulators, simulators } from '../simulators/registry';
import { DeviceCard, PlannedRow, REACH, type Reach } from '../components/device-card';
import { LabDiagram } from '../components/lab-diagram';
import { Icon } from '../components/icon';
import { href } from '../lib/router';
import { useT, type Translate } from '../lib/i18n';

const steps = (t: Translate) => [
  {
    icon: 'grid',
    title: t('step.choose.title', 'Choose a device'),
    text: t('step.choose.text', 'Pick the hardware your software talks to: a handheld, a gate, a tool, an I/O box or a PLC.'),
  },
  {
    icon: 'wrench',
    title: t('step.configure.title', 'Point it at your system'),
    text: t('step.configure.text', 'Set the endpoint, IP and port, reader power, Pset or channel count — the same settings the real one has.'),
  },
  {
    icon: 'play',
    title: t('step.simulate.title', 'Use it like the real one'),
    text: t('step.simulate.text', 'Hold a trigger, drive a forklift through, flip a sensor, edit a register. The device behaves as it would on the line.'),
  },
  {
    icon: 'eye',
    title: t('step.inspect.title', 'See exactly what went out'),
    text: t('step.inspect.text', 'Every payload, every response from your API, every frame byte by byte — in the event stream and the decoders.'),
  },
];

const reasons = (t: Translate) => [
  {
    icon: 'bolt',
    title: t('reason.expensive.title', 'Hardware is expensive'),
    text: t('reason.expensive.text', 'A tightening controller or an RFID gate costs more than the software that talks to it.'),
  },
  {
    icon: 'lock',
    title: t('reason.scarce.title', 'Hardware is scarce'),
    text: t('reason.scarce.text', 'One device, many developers. Here every engineer has their own, all day, no booking sheet.'),
  },
  {
    icon: 'broadcast',
    title: t('reason.share.title', 'Hardware is hard to share'),
    text: t('reason.share.text', 'Devices live on a plant network behind a firewall. A browser travels with the person who needs it.'),
  },
  {
    icon: 'rfid',
    title: t('reason.remote.title', 'Remote testing is painful'),
    text: t('reason.remote.text', 'You cannot pull a trigger on a handheld over VPN. Here you can, from anywhere.'),
  },
  {
    icon: 'gauge',
    title: t('reason.edge.title', 'Edge cases barely happen'),
    text: t('reason.edge.text', 'An NG fastening, a tool alarm, a tag that never reads — one click instead of one lucky shift.'),
  },
  {
    icon: 'check',
    title: t('reason.repeat.title', 'Integrations need repetition'),
    text: t('reason.repeat.text', 'Repeatable device behaviour is what integration tests, demos and training actually need.'),
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

/** The three ways traffic can leave the browser, and who does which. */
const lanes = (t: Translate): { reach: Reach; title: string; text: string; how: string }[] => [
  {
    reach: 'sent',
    title: t('lane.sent.title', 'Really sent'),
    text: t('lane.sent.text', 'REST devices post to the endpoint you configure, from your browser, and show the response your API gave.'),
    how: t('lane.sent.how', 'browser → your API'),
  },
  {
    reach: 'bridge',
    title: t('lane.bridge.title', 'Local bridge'),
    text: t('lane.bridge.text', 'The PLC needs a socket a page cannot open, so one small file started with one click serves MC Protocol on your machine.'),
    how: t('lane.bridge.how', 'your program → localhost → page'),
  },
  {
    reach: 'generated',
    title: t('lane.generated.title', 'Generated for inspection'),
    text: t('lane.generated.text', 'Open Protocol, Modbus TCP and MQTT are built byte-accurate and decoded on screen, ready to check your parser against.'),
    how: t('lane.generated.how', 'frame → decoder'),
  },
];

export function HomePage() {
  const t = useT();
  const inLane = (r: Reach) =>
    simulators.filter((s) => REACH[s.meta.id] === r || (REACH[s.meta.id] === 'mixed' && r !== 'bridge'));

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero-inner">
          <div className="home-hero-copy">
            <p className="hero-eyebrow">
              <span className="pulse-dot" /> {t('home.eyebrow', 'Virtual hardware laboratory')}
            </p>
            <h1>{t('home.h1', 'Real device behaviour. No device on the desk.')}</h1>
            <p className="hero-lede">
              {t(
                'home.lede',
                'RFID handhelds and gates, a nutrunner, an I/O box and a PLC — drawn as the real thing, behaving like the real thing, and talking to your software the way the real thing does.',
              )}
            </p>
            <div className="hero-actions">
              <a className="btn btn-lg hero-primary" href={href('/simulators')}>
                {t('home.cta.explore', 'Open the lab')}
                <Icon name="arrow" size={15} />
              </a>
              <a className="btn btn-lg hero-ghost" href={href('/docs')}>
                {t('home.cta.how', 'How it works')}
              </a>
            </div>
            <dl className="hero-facts">
              <div>
                <dt>{simulators.length}</dt>
                <dd>{t('home.fact.live', 'devices live')}</dd>
              </div>
              <div>
                <dt>{new Set(simulators.flatMap((s) => s.meta.protocols)).size}</dt>
                <dd>{t('home.fact.protocols', 'protocols')}</dd>
              </div>
              <div>
                <dt>0</dt>
                <dd>{t('home.fact.plug', 'devices to plug in')}</dd>
              </div>
              <div>
                <dt>100%</dt>
                <dd>{t('home.fact.browser', 'in your browser')}</dd>
              </div>
            </dl>
          </div>
          <div className="home-hero-art">
            <LabDiagram />
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('home.lab.eyebrow', 'The lab')}</p>
              <h2>{t('home.explorer.title', 'Five devices, ready to use')}</h2>
              <p>
                {t(
                  'home.explorer.sub',
                  'Each one is drawn after the hardware in the field and runs its real behaviour. Open one and start working.',
                )}
              </p>
            </div>
            <a className="btn btn-sm" href={href('/simulators')} style={{ marginLeft: 'auto' }}>
              {t('home.viewall', 'View the catalog')} <Icon name="arrow" size={13} />
            </a>
          </div>
          <div className="showcase">
            {simulators.map((s) => (
              <DeviceCard key={s.meta.id} sim={s} />
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('home.lanes.eyebrow', 'Communication')}</p>
              <h2>{t('home.lanes.title', 'What actually leaves the browser')}</h2>
              <p>
                {t(
                  'home.lanes.sub',
                  'No pretending: every device says whether its traffic really goes out, goes through a local bridge, or is generated for you to inspect.',
                )}
              </p>
            </div>
          </div>
          <div className="lanes">
            {lanes(t).map((l) => (
              <div className={`lane lane-${l.reach}`} key={l.reach}>
                <span className={`reach reach-${l.reach}`}>{l.title}</span>
                <p>{l.text}</p>
                <code>{l.how}</code>
                <ul>
                  {inLane(l.reach).map((s) => (
                    <li key={s.meta.id}>
                      <a href={href(`/simulators/${s.meta.id}`)}>{s.meta.name}</a>
                      <span>
                        {l.reach === 'sent' && s.meta.id === 'digital-io'
                          ? 'REST'
                          : l.reach === 'generated' && s.meta.id === 'digital-io'
                            ? 'Modbus · MQTT'
                            : s.meta.protocols[0]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('home.how.eyebrow', 'Workflow')}</p>
              <h2>{t('home.how.title', 'How it works')}</h2>
              <p>{t('home.how.sub', 'Four steps, the same for every device.')}</p>
            </div>
          </div>
          <ol className="flow">
            {steps(t).map((s, i) => (
              <li key={s.title}>
                <span className="flow-mark">
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="flow-index">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('home.why.eyebrow', 'Why')}</p>
              <h2>{t('home.why.title', 'Why simulate the hardware?')}</h2>
              <p>
                {t(
                  'home.why.sub',
                  'The hardware is rarely the bottleneck by choice — there is only one of it, it lives somewhere else, and it never fails on demand.',
                )}
              </p>
            </div>
          </div>
          <div className="reasons">
            {reasons(t).map((r) => (
              <div className="reason" key={r.title}>
                <span className="icon-slot">
                  <Icon name={r.icon} size={18} />
                </span>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          <div className="usecases">
            <span className="usecases-label">{t('home.engineers.title', 'Built for')}</span>
            {useCases(t).map((u) => (
              <span className="usecase" key={u}>
                {u}
              </span>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('home.soon.eyebrow', 'Roadmap')}</p>
              <h2>{t('home.soon.title', 'Coming next')}</h2>
              <p>{t('home.soon.sub', 'Declared in the catalog and next in line for the bench.')}</p>
            </div>
          </div>
          <div className="planned-grid">
            {plannedSimulators.map((d) => (
              <PlannedRow key={d.id} device={d} />
            ))}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <h2>{t('home.cta.title', 'Pick a device and point it at your system.')}</h2>
            <p>{t('home.cta.text', 'Nothing to install for REST devices; one click for the PLC bridge.')}</p>
          </div>
          <div className="hero-actions">
            <a className="btn btn-lg hero-primary" href={href('/simulators')}>
              {t('home.cta.explore', 'Open the lab')} <Icon name="arrow" size={15} />
            </a>
            <a className="btn btn-lg hero-ghost" href={href('/docs')}>
              {t('home.cta.docs', 'Read the docs')}
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
