import { simulators } from '../simulators/registry';
import { CopyButton } from '../components/copy-button';
import { DeviceArt } from '../components/device-art';
import { PageBand } from '../components/page-band';
import { REACH, reachLabel } from '../components/device-card';
import { href } from '../lib/router';
import { useT } from '../lib/i18n';

const ADD_SIMULATOR = `// src/simulators/conveyor/conveyor.ts
export class ConveyorSimulator extends Simulator<ConveyorState> {
  readonly meta = { id: 'conveyor', name: 'Conveyor', category: 'Factory Devices', ... };
  readonly configFields = [
    { key: 'speed', label: 'Belt Speed', type: 'number', default: 0.4, min: 0, max: 2, step: 0.1 },
  ];
  readonly actions = [{ id: 'start', label: 'Start Belt', tone: 'primary' }];

  protected initialState() { return { running: false, metres: 0 }; }
  protected onAction(id: string) { /* device behaviour + this.emit(...) */ }
  stateRows() { return [{ label: 'Belt', value: this.state.running ? 'RUNNING' : 'STOPPED' }]; }
  samplePayload() { return { device_id: 'CNV-01', running: true }; }
}

// src/simulators/registry.ts
export const simulators = [ ..., new ConveyorSimulator() ];`;

const ENVELOPE = `{
  "event": "RFID_SCANNED",
  "device": "rfid-handheld",
  "timestamp": "2026-08-13T01:32:10.000Z",
  "payload": { }
}`;

const TREE = `src/
├── simulators/          The engines — no UI in here
│   ├── core/            Simulator base class, shared types, wire builders
│   ├── rfid/            RFID handheld + gate reader
│   ├── nutrunner/       Tightening tool, Open Protocol telegrams
│   ├── digital-io/      ESP32 + W5500 I/O box, Modbus ADUs
│   ├── plc/             MC Protocol PLC (socket side: public/mc-plc.mjs)
│   └── registry.ts      The one place devices are registered
├── components/          Shared workspace, event stream, inspector, device art
│   ├── handheld/        The MC3300 and the WMS RFID Suite app
│   ├── gate/            The 8-antenna portal and the forklift
│   ├── nutrunner/       The tightening station and its curve
│   ├── dio/             The I/O box and its field devices
│   └── plc/             The Q-series rack and its decoders
├── pages/               Home, catalog, workspace, docs, about
└── lib/                 Hash router, React binding, settings, i18n`;

const SECTIONS = [
  ['overview', 'docs.toc.overview', 'Overview'],
  ['transports', 'docs.toc.transports', 'What is sent'],
  ['using', 'docs.toc.using', 'Using a simulator'],
  ['events', 'docs.toc.events', 'Events'],
  ['devices', 'docs.toc.devices', 'Device reference'],
  ['architecture', 'docs.toc.architecture', 'Architecture'],
  ['deploy', 'docs.toc.deploy', 'Deployment'],
] as const;

export function DocsPage() {
  const t = useT();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <PageBand
        eyebrow={t('docs.eyebrow', 'Documentation')}
        title={t('docs.title', 'How it works')}
        lede={t(
          'docs.lede',
          'What each simulator reproduces, what really leaves your browser, and how to add a device of your own.',
        )}
      />
      <div className="container docs-layout">
        <nav className="docs-toc" aria-label={t('docs.toc', 'On this page')}>
          <p className="eyebrow">{t('docs.toc', 'On this page')}</p>
          {SECTIONS.map(([id, key, en]) => (
            <button key={id} type="button" onClick={() => go(id)}>
              {t(key, en)}
            </button>
          ))}
          <p className="eyebrow" style={{ marginTop: 14 }}>
            {t('docs.toc.devices', 'Device reference')}
          </p>
          {simulators.map((s) => (
            <button key={s.meta.id} type="button" onClick={() => go(`dev-${s.meta.id}`)}>
              {s.meta.name}
            </button>
          ))}
        </nav>

        <article className="prose docs-body">
          <section id="overview">
            <h2>{t('docs.toc.overview', 'Overview')}</h2>
            <p>
              {t(
                'docs.intro',
                'Stechoq Hardware Simulation is a virtual hardware laboratory. Each simulator reproduces three things about a physical device: its state, its actions, and its communication. The interface is only how you drive and observe that simulation — the simulation engine itself has no idea a UI exists.',
              )}
            </p>
          </section>

          <section id="transports">
            <h2>{t('docs.toc.transports', 'What is sent')}</h2>
            <div className="docs-lanes">
              <div>
                <span className="reach reach-sent">{reachLabel('sent', t)}</span>
                <p>
                  {t(
                    'docs.lane.sent',
                    'Both RFID readers, and the I/O box when its transport is REST, post their payload for real to the endpoint you configure and show the response: status, message and timing. A failure there is a real one — refused, unreachable, or blocked by CORS.',
                  )}
                </p>
              </div>
              <div>
                <span className="reach reach-bridge">{reachLabel('bridge', t)}</span>
                <p>
                  {t(
                    'docs.lane.bridge',
                    'The PLC is a server your program connects to, and a page cannot accept a TCP connection. A single file served by this site, started with one click from the PLC workspace, listens for MC Protocol 3E on your machine and mirrors the registers to the page.',
                  )}
                </p>
              </div>
              <div>
                <span className="reach reach-generated">{reachLabel('generated', t)}</span>
                <p>
                  {t(
                    'docs.lane.generated',
                    'The nutrunner’s Open Protocol telegrams and the Modbus TCP and MQTT frames are built byte-accurate and decoded on screen, because a browser cannot open those sockets. Check your parser against them byte for byte.',
                  )}
                </p>
              </div>
            </div>
          </section>

          <section id="using">
            <h2>{t('docs.toc.using', 'Using a simulator')}</h2>
            <ol>
              <li>{t('docs.use.1', 'Open a device from the catalog. Its workspace shows the device itself, drawn after the real one.')}</li>
              <li>{t('docs.use.2', 'Point it at your system: the endpoint, IP and port, power, Pset or channel count — under Settings, or on the device’s own screen.')}</li>
              <li>{t('docs.use.3', 'Use it the way you would on the line: hold a trigger, drive a load through the gate, flip a sensor, edit a register.')}</li>
              <li>{t('docs.use.4', 'Read the result: the response your API gave, the frame decoded byte by byte, and every event in the stream with its payload.')}</li>
              <li>{t('docs.use.5', 'The Communication Log lists only the events that produced traffic, with the protocol frame behind each one.')}</li>
            </ol>
          </section>

          <section id="events">
            <h2>{t('docs.events.title', 'The event system')}</h2>
            <p>
              {t(
                'docs.events.text',
                'Every action produces an event, and every simulator uses the same envelope. That is what makes one workspace work for all devices.',
              )}
            </p>
            <pre className="code inline">{ENVELOPE}</pre>
            <p>
              {t(
                'docs.events.features',
                'In the Event Stream you can filter by name or summary, pause the log without stopping the device, expand a row for its envelope, copy any payload, and clear the history. Timestamps are ISO-8601 UTC; the stream shows the time component.',
              )}
            </p>
          </section>

          <section id="devices">
            <h2>{t('docs.reference.title', 'Device reference')}</h2>
            {simulators.map((sim) => (
              <section key={sim.meta.id} id={`dev-${sim.meta.id}`} className="docs-device">
                <div className="docs-device-head">
                  <a className="docs-device-art" href={href(`/simulators/${sim.meta.id}`)}>
                    <DeviceArt id={sim.meta.id} />
                  </a>
                  <div>
                    <h3>{sim.meta.name}</h3>
                    <span className={`reach reach-${REACH[sim.meta.id] ?? 'generated'}`}>
                      {reachLabel(REACH[sim.meta.id] ?? 'generated', t)}
                    </span>
                    <p>{t(`sim.${sim.meta.id}.description`, sim.meta.description)}</p>
                  </div>
                </div>
                <table className="def-table">
                  <tbody>
                    <tr>
                      <td style={{ width: '26%' }}>{t('docs.reference.id', 'Simulator id')}</td>
                      <td className="mono">{sim.meta.id}</td>
                    </tr>
                    <tr>
                      <td>{t('docs.reference.config', 'Configuration')}</td>
                      <td className="mono">{sim.configFields.map((f) => f.key).join(', ')}</td>
                    </tr>
                    <tr>
                      <td>{t('docs.reference.actions', 'Actions')}</td>
                      <td className="mono">{sim.actions.map((a) => a.id).join(', ') || '—'}</td>
                    </tr>
                    <tr>
                      <td>{t('docs.reference.protocols', 'Protocols')}</td>
                      <td className="mono">{sim.meta.protocols.join(', ')}</td>
                    </tr>
                  </tbody>
                </table>
                <details className="docs-sample">
                  <summary>
                    {t('docs.reference.sample', 'Example payload')}
                    <CopyButton text={JSON.stringify(sim.samplePayload(), null, 2)} />
                  </summary>
                  <pre className="code inline">{JSON.stringify(sim.samplePayload(), null, 2)}</pre>
                </details>
              </section>
            ))}
          </section>

          <section id="architecture">
            <h2>{t('docs.arch.title', 'Architecture')}</h2>
            <p>
              {t(
                'docs.arch.text2',
                'The engines are plain TypeScript classes. A base Simulator owns subscriptions, the event log, timers, config validation and reset; a device subclass declares its metadata, configuration, actions, state and behaviour. Each device has a purpose-built workspace on top; a new device without one still gets a complete generic workspace from those declarations.',
              )}
            </p>
            <pre className="code inline">{TREE}</pre>

            <h3>{t('docs.add.title', 'Adding a simulator')}</h3>
            <div className="docs-copy-head">
              <span className="eyebrow">{t('docs.add.sub', 'One class, one registry line')}</span>
              <CopyButton text={ADD_SIMULATOR} />
            </div>
            <pre className="code inline">{ADD_SIMULATOR}</pre>

            <h3>{t('docs.layers.title', 'Communication layers')}</h3>
            <p>
              {t(
                'docs.layers.text2',
                'Protocol frames come from small builders (httpPost, mqttPublish, tcpFrame, modbusWrite, the Open Protocol and MC Protocol codecs) that all return the same TransportFrame shape, so the inspector prints whatever it is handed. A new transport is a new builder, not a new UI.',
              )}
            </p>
          </section>

          <section id="deploy">
            <h2>{t('docs.deploy.title', 'Deployment')}</h2>
            <table className="def-table">
              <tbody>
                <tr>
                  <td style={{ width: '26%' }}>{t('docs.deploy.build', 'Build')}</td>
                  <td className="mono">npm run build</td>
                </tr>
                <tr>
                  <td>{t('docs.deploy.output', 'Output directory')}</td>
                  <td className="mono">dist</td>
                </tr>
                <tr>
                  <td>{t('docs.deploy.hosting', 'Hosting')}</td>
                  <td>{t('docs.deploy.hosting.value', 'Cloudflare Pages (static). Hash routing means no SPA rewrite rules.')}</td>
                </tr>
                <tr>
                  <td>{t('docs.deploy.backend', 'Backend')}</td>
                  <td>{t('docs.deploy.backend.value2', 'None. The PLC bridge runs on the visitor’s own machine.')}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </article>
      </div>
    </>
  );
}
