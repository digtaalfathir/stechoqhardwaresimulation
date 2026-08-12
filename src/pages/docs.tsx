import { simulators } from '../simulators/registry';
import { CopyButton } from '../components/copy-button';
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
├── simulators/
│   ├── core/          Simulator base class, shared types, wire builders
│   ├── rfid/          RFID handheld scanner
│   ├── nutrunner/     Tightening tool
│   ├── digital-io/    Discrete I/O controller
│   └── registry.ts    The one place devices are registered
├── components/        Workspace, event stream, inspector, device panels
├── pages/             Home, explorer, workspace, docs, about
└── lib/               Hash router, React binding, settings, i18n`;

export function DocsPage() {
  const t = useT();
  return (
    <div className="container">
      <div className="prose">
        <p className="eyebrow">{t('docs.eyebrow', 'Documentation')}</p>
        <h2 style={{ fontSize: 24, marginTop: 4 }}>{t('docs.title', 'How It Works')}</h2>
        <p>
          {t(
            'docs.intro',
            'Stechoq Hardware Simulation is a virtual hardware laboratory. Each simulator reproduces three things about a physical device: its state, its actions, and its communication. The interface is only how you drive and observe that simulation — the simulation engine itself has no idea a UI exists.',
          )}
        </p>

        <div className="callout">
          <p>
            <strong>{t('docs.callout.title', 'Nothing leaves your browser.')}</strong>{' '}
            {t(
              'docs.callout.text',
              'Payloads and protocol frames are generated and displayed locally. Endpoints and IP addresses you configure are used to build realistic frames, not to open connections. Live transports are on the roadmap.',
            )}
          </p>
        </div>

        <h2>{t('docs.use.title', 'Using a simulator')}</h2>
        <ol>
          <li>{t('docs.use.1', 'Open a device from the catalog.')}</li>
          <li>
            {t(
              'docs.use.2',
              'Edit the configuration and press Apply Configuration. The device comes online and emits DEVICE_CONFIGURED.',
            )}
          </li>
          <li>{t('docs.use.3', 'Trigger an action from Device Controls.')}</li>
          <li>
            {t(
              'docs.use.4',
              'Watch Live Device State, read the Event Stream, and open any event in the Payload Inspector to copy the JSON your backend would receive.',
            )}
          </li>
          <li>
            {t(
              'docs.use.5',
              'The Communication Log lists only the events that would have produced traffic, with the protocol frame behind each one.',
            )}
          </li>
        </ol>

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

        <h2>{t('docs.reference.title', 'Device reference')}</h2>
        {simulators.map((sim) => (
          <section key={sim.meta.id}>
            <h3>{sim.meta.name}</h3>
            <p>{t(`sim.${sim.meta.id}.description`, sim.meta.description)}</p>
            <table className="def-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>{t('docs.reference.interface', 'Interface')}</th>
                  <th>{t('docs.reference.values', 'Values')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('docs.reference.id', 'Simulator id')}</td>
                  <td className="mono">{sim.meta.id}</td>
                </tr>
                <tr>
                  <td>{t('docs.reference.config', 'Configuration')}</td>
                  <td className="mono">{sim.configFields.map((f) => f.key).join(', ')}</td>
                </tr>
                <tr>
                  <td>{t('docs.reference.actions', 'Actions')}</td>
                  <td className="mono">{sim.actions.map((a) => a.id).join(', ')}</td>
                </tr>
                <tr>
                  <td>{t('docs.reference.protocols', 'Protocols')}</td>
                  <td className="mono">{sim.meta.protocols.join(', ')}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px' }}>
              <span className="eyebrow">{t('docs.reference.sample', 'Example payload')}</span>
              <CopyButton text={JSON.stringify(sim.samplePayload(), null, 2)} />
            </div>
            <pre className="code inline">{JSON.stringify(sim.samplePayload(), null, 2)}</pre>
          </section>
        ))}

        <h2>{t('docs.arch.title', 'Architecture')}</h2>
        <p>
          {t(
            'docs.arch.text',
            'The engine is plain TypeScript classes. A base Simulator owns subscriptions, the event log, timers, config validation and reset; a device subclass declares its metadata, configuration schema, actions, state and behaviour. The workspace renders any simulator from those declarations, so a new device needs no UI work.',
          )}
        </p>
        <pre className="code inline">{TREE}</pre>

        <h3>{t('docs.add.title', 'Adding a simulator')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px' }}>
          <span className="eyebrow">{t('docs.add.sub', 'One class, one registry line')}</span>
          <CopyButton text={ADD_SIMULATOR} />
        </div>
        <pre className="code inline">{ADD_SIMULATOR}</pre>

        <h3>{t('docs.layers.title', 'Communication layers')}</h3>
        <p>
          {t(
            'docs.layers.text',
            'Protocol frames are produced by small builders (httpPost, mqttPublish, tcpFrame, modbusWrite) that all return the same TransportFrame shape. The inspector prints whatever it is given, so adding WebSocket messages, raw TCP streams or Modbus register maps later is a new builder rather than a new UI.',
          )}
        </p>

        <h3>{t('docs.engmode.title', 'Engineering mode')}</h3>
        <p>
          {t(
            'docs.engmode.text',
            'The MVP exposes the JSON/event layer plus generated protocol frames. HTTP headers, live WebSocket and MQTT sessions, TCP streams, Modbus register tables and recorded state transitions are planned on the same tab strip in the Payload Inspector.',
          )}
        </p>

        <h2>{t('docs.deploy.title', 'Deployment')}</h2>
        <table className="def-table">
          <tbody>
            <tr>
              <td style={{ width: '30%' }}>{t('docs.deploy.build', 'Build')}</td>
              <td className="mono">npm run build</td>
            </tr>
            <tr>
              <td>{t('docs.deploy.output', 'Output directory')}</td>
              <td className="mono">dist</td>
            </tr>
            <tr>
              <td>{t('docs.deploy.hosting', 'Hosting')}</td>
              <td>
                {t(
                  'docs.deploy.hosting.value',
                  'Cloudflare Pages (static). Hash routing means no SPA rewrite rules.',
                )}
              </td>
            </tr>
            <tr>
              <td>{t('docs.deploy.backend', 'Backend')}</td>
              <td>{t('docs.deploy.backend.value', 'None required.')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
