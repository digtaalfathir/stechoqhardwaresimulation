import { CATEGORIES, categoryCounts, plannedSimulators, simulators } from '../simulators/registry';
import { DeviceCard, PlannedCard } from '../components/device-card';
import { Icon } from '../components/icon';
import { href } from '../lib/router';

const STEPS = [
  { title: 'Choose a Device', text: 'Select the hardware you want to simulate from the catalog.' },
  {
    title: 'Configure',
    text: 'Set device parameters — IP address, reader ID, port, antenna, protocol, torque target.',
  },
  { title: 'Simulate', text: 'Trigger actions exactly like the real device would perform them.' },
  { title: 'Inspect', text: 'Watch status, events, payloads, responses and communication logs.' },
];

const REASONS = [
  {
    icon: 'bolt',
    title: 'Hardware is expensive',
    text: 'A single tightening controller or RFID gate costs more than the software that talks to it. Simulate the interface instead of buying the device.',
  },
  {
    icon: 'lock',
    title: 'Hardware is scarce',
    text: 'One device, many developers. A simulator gives every engineer their own instance, all day, with no booking sheet.',
  },
  {
    icon: 'broadcast',
    title: 'Hardware is hard to share',
    text: 'Devices live on a plant network behind a firewall. A browser-based simulator travels with the person who needs it.',
  },
  {
    icon: 'grid',
    title: 'Remote testing is painful',
    text: 'You cannot pull a trigger on a handheld reader over VPN. Here you can, from anywhere.',
  },
  {
    icon: 'wrench',
    title: 'Edge cases barely happen',
    text: 'An NG fastening, a spindle fault, a tag that never reads — all one click away instead of one lucky shift.',
  },
  {
    icon: 'check',
    title: 'Integrations need repetition',
    text: 'Deterministic, repeatable device behaviour is what integration tests and demos actually need.',
  },
];

const USE_CASES = [
  'Development',
  'Integration testing',
  'Backend development',
  'Frontend development',
  'QA',
  'Demonstration',
  'Training',
  'Debugging',
];

export function HomePage() {
  const rfid = simulators[0];
  return (
    <div className="container">
      <section className="hero">
        <div>
          <p className="eyebrow">Stechoq Hardware Simulation</p>
          <h1>Simulate Hardware. Test Integrations. No Hardware Required.</h1>
          <p className="hero-lede">
            Explore virtual industrial devices and reproduce their behavior directly from your
            browser — device state, device actions and the exact data your backend would receive.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary btn-lg" href={href('/simulators')}>
              Explore Simulators
              <Icon name="arrow" size={15} />
            </a>
            <a className="btn btn-lg" href={href('/docs')}>
              How It Works
            </a>
          </div>
          <div className="hero-facts">
            <div>
              <b>{simulators.length}</b> simulators live
            </div>
            <div>
              <b>{plannedSimulators.length}</b> in the catalog
            </div>
            <div>
              <b>0</b> devices to plug in
            </div>
            <div>
              <b>100%</b> in-browser
            </div>
          </div>
        </div>

        <aside className="panel" aria-label="Example device output">
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
            This is the request body your backend would receive from the physical reader.
          </p>
        </aside>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Simulator Explorer</h2>
            <p>Devices grouped the way a plant is: by what they identify, drive, see or speak.</p>
          </div>
          <a className="btn btn-sm" href={href('/simulators')} style={{ marginLeft: 'auto' }}>
            View all
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
                  {live} live / {planned} planned
                </span>
              </span>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>How It Works</h2>
            <p>Choose → Configure → Simulate → Inspect.</p>
          </div>
        </div>
        <div className="grid steps">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <span className="step-index">STEP {String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Why Hardware Simulation?</h2>
            <p>
              The hardware is rarely the bottleneck by choice — it is the bottleneck because there
              is only one of it, it lives somewhere else, and it never fails on demand.
            </p>
          </div>
        </div>
        <div className="grid reasons">
          {REASONS.map((r) => (
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
            <h2>Built for Engineers</h2>
            <p>
              A simulator reproduces three things: device state, device actions and device
              communication. That is enough to build against, test against and demonstrate with.
            </p>
          </div>
        </div>
        <div className="usecases">
          {USE_CASES.map((u) => (
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
            <h2>Coming Soon</h2>
            <p>Declared in the catalog and next in line for implementation.</p>
          </div>
          <a className="btn btn-sm" href={href('/simulators')} style={{ marginLeft: 'auto' }}>
            See the full catalog
          </a>
        </div>
        <div className="grid cards">
          {plannedSimulators.slice(0, 6).map((d) => (
            <PlannedCard key={d.id} device={d} />
          ))}
        </div>
      </section>
    </div>
  );
}
