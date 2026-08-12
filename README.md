# Stechoq Hardware Simulation

Virtual hardware laboratory for testing industrial device integrations without physical hardware.

Each simulator reproduces three things about a real device: its **state**, its **actions** and its
**communication**. The UI is only how you drive and observe the simulation — the engine has no UI
dependencies at all.

## Commands

| Command         | What it does                                            |
| --------------- | ------------------------------------------------------- |
| `npm run dev`   | Dev server with HMR                                     |
| `npm run build` | Typecheck, then build to `dist/`                        |
| `npm run check` | Headless self-check of the simulation engine            |
| `npm run preview` | Serve the production build locally                     |

Requires Node 18+ (developed on Node 20).

## Deploying to Cloudflare Pages

| Setting            | Value           |
| ------------------ | --------------- |
| Build command      | `npm run build` |
| Build output       | `dist`          |
| Node version       | `20`            |

Routing is hash-based (`/#/simulators/rfid-handheld`), so no SPA rewrite rules or `_redirects` file
are needed and deep links survive a hard refresh. There is no backend: the app is static files.

## Live simulators

| Device                     | Id              | Protocols framed                 |
| -------------------------- | --------------- | -------------------------------- |
| RFID Handheld Scanner      | `rfid-handheld` | REST                             |
| Nutrunner / Tightening Tool| `nutrunner`     | Open Protocol, Modbus TCP, REST  |
| Digital I/O Controller     | `digital-io`    | Modbus TCP, REST, MQTT           |

Protocol frames are **generated and displayed**, not sent. Nothing leaves the browser; configured
endpoints and IP addresses are used to build realistic frames. Live transports are future work.

## Layout

```
src/
├── simulators/
│   ├── core/            Simulator base class, shared types, wire builders
│   ├── rfid/            RFID handheld scanner
│   ├── nutrunner/       Tightening tool
│   ├── digital-io/      Discrete I/O controller
│   ├── registry.ts      The one place devices are registered
│   └── engine.check.ts  npm run check
├── components/          Workspace, event stream, inspector, device panels
├── pages/               Home, explorer, workspace, docs, about
├── lib/                 Hash router, React binding
└── styles.css
```

## Adding a simulator

Subclass `Simulator`, declare metadata, a config schema, actions, state and behaviour, then add one
line to `src/simulators/registry.ts`. The workspace renders configuration, controls, live state,
event stream, payload inspector and communication log from those declarations — no UI work needed.

```ts
export class ConveyorSimulator extends Simulator<ConveyorState> {
  readonly meta = { id: 'conveyor', name: 'Conveyor', category: 'Factory Devices', ... };
  readonly configFields = [{ key: 'speed', label: 'Belt Speed', type: 'number', default: 0.4 }];
  readonly actions = [{ id: 'start', label: 'Start Belt', tone: 'primary' }];

  protected initialState() { return { running: false, metres: 0 }; }
  protected onAction(id: string) { /* behaviour, then this.emit(...) */ }
  stateRows() { return [{ label: 'Belt', value: this.state.running ? 'RUNNING' : 'STOPPED' }]; }
  samplePayload() { return { device_id: 'CNV-01', running: true }; }
}
```

A device that needs a purpose-built view (a torque curve, a channel grid) adds a case to
`src/components/device-panels.tsx`. Everything else stays generic.

Devices that need a new protocol view add a builder returning a `TransportFrame` in
`src/simulators/core/wire.ts`; the inspector prints whatever it is handed.

## Dependencies

React, Vite, TypeScript, esbuild. No router, no state library, no UI kit, no icon package — hash
routing, `useSyncExternalStore`, hand-written CSS and inline SVG cover it.
