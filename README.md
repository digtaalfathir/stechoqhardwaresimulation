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

| Device                      | Id              | Transport                            |
| --------------------------- | --------------- | ------------------------------------ |
| RFID Handheld Scanner       | `rfid-handheld` | REST — really sent                   |
| RFID Reader (fixed gate)    | `rfid-reader`   | REST — really sent                   |
| Nutrunner / Tightening Tool | `nutrunner`     | Open Protocol — telegrams generated  |
| Digital I/O Controller      | `digital-io`    | REST — really sent · Modbus / MQTT — generated |
| PLC (MC Protocol)           | `plc`           | MC Protocol 3E — really served, via local bridge |

Everything that speaks REST — both RFID readers, and the I/O block when its transport is REST —
**really sends** its payload to the configured endpoint and reports the response: status, message and
timing. A failure on screen is a real one (rejected, unreachable, or CORS). Sending lives in the base
`Simulator`, so any device reports its traffic the same way and the send-result panel works for all
of them.

The handheld fills its **RR Type** and **Factory** dropdowns from the host itself — read once when the
workspace opens and again whenever the base URL changes, since each host holds different master data.
A scan sends the factory's `code`; a replacement sends its `id`, which is a different number only the
host knows (DENSO is code 5022 but id 200), so a factory outside the loaded list blocks the
replacement instead of guessing. If a host does not serve those lists, the dropdowns fall back to
built-in values and say so, without taking the workspace away.

The nutrunner speaks **Open Protocol**: a MID 0001/0002 handshake and a MID 0060 subscribe when the
configuration is applied, then a byte-accurate MID 0061 revision 1 telegram per fastening, a MID 0062
acknowledge, and MID 0071 for tool alarms. The telegrams are **generated for inspection**, because a
browser cannot open a TCP socket to port 4545 — everything above the socket is faithful, so a
consumer's parser can be checked against them byte for byte. Telegram building and annotation live in
[src/simulators/nutrunner/open-protocol.ts](src/simulators/nutrunner/open-protocol.ts); `npm run check`
asserts the declared length, every field offset and the torque x100 encoding.

The PLC is the one device a browser cannot be on its own: an acquisition program *connects to* a
PLC, and a page can neither accept a TCP connection nor start a program on the visitor's machine. So
the socket half is [public/mc-plc.mjs](public/mc-plc.mjs) — one file, no dependencies, **served by
the site itself** at `/mc-plc.mjs` — and the workspace shows the one command that fetches and runs it:

```
node -e "fetch('https://<site>/mc-plc.mjs').then(r=>r.text()).then(t=>import('data:text/javascript,'+encodeURIComponent(t)))"
```

It works the same in bash, cmd and PowerShell and needs only Node 18+ (anyone testing a Node
acquisition program has it); a download button covers older Node. No server, no repo, no install.
The workspace polls `http://localhost:8201` and connects by itself the moment the bridge is up.
Chrome may ask once to allow the site to reach the local network.

The bridge answers **MC Protocol 3E binary** batch word reads (`0401`) and writes (`1401`) for D, R
and W, with Q and iQ-R sub-commands, exactly as the CPU would. Each browser tab gets its own PLC on
its own port — the first is `localhost:8200` — and keeps it across reloads (`localStorage`). If the
bridge restarts, the workspace asks for the same port again and puts its registers back. Registers
appear as soon as the client reads them. *Zero & Restore* holds every register at 0 for a while — a
jig change — and the Online / Silent / Offline modes make the PLC answer, accept but never answer
(client timeouts), or refuse connections.

Inside this repo, `npm run mc-plc` runs the same file. It can also be hosted once for everyone
(`MC_PORTS`, `HTTP_PORT`, `PUBLIC_HOST`, `SESSION_IDLE_MIN`; build the site with
`VITE_PLC_BRIDGE_URL` pointing at it, behind HTTPS) — not needed for the local setup above.

Devices still in the catalog but not implemented (Industrial Camera, REST API Device, TCP
Device) appear as planned rows in the explorer.

## Layout

```
src/
├── simulators/
│   ├── core/            Simulator base class, shared types, wire builders
│   ├── rfid/            RFID handheld + gate reader, master data
│   ├── nutrunner/       Tightening tool
│   ├── digital-io/      Discrete I/O controller
│   ├── plc/             MC Protocol PLC (socket side: public/mc-plc.mjs)
│   ├── registry.ts      The one place devices are registered
│   └── engine.check.ts  npm run check
├── components/          Workspace, event stream, inspector, device panels, settings menu
├── pages/               Home, explorer, workspace, docs, about
├── lib/                 Hash router, React binding, settings store, i18n
└── styles.css
```

## Theme and language

The header settings menu carries two controls, both persisted in `localStorage`
(`shs.settings`) and applied to `<html>` as `data-theme` / `lang`:

- **Theme** — light or dark. Defaults to the OS preference. Every colour is a CSS
  custom property in [src/styles.css](src/styles.css); the dark theme restates the
  tokens only, so components never branch on theme.
- **Language** — English or Indonesian. English lives inline at the call site
  (`t('nav.home', 'Home')`) and only the Indonesian dictionary is maintained, in
  [src/lib/i18n.ts](src/lib/i18n.ts). A missing key falls back to English rather than
  rendering a raw key.

Device-domain vocabulary stays English on purpose — field labels (`Reader ID`,
`Target Torque`), event names and protocol names are what the real hardware, its
manual and its protocol spec use.

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
