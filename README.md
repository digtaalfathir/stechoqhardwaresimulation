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

The handheld is a **Zebra MC33-style device running a copy of the WMS RFID Suite app** (the APK's own
screens, colours and wording, taken from its user manual). Tags lie on a bench beside it; the antenna's
range follows the app's Power setting (0–300). **Holding the trigger** — the grip trigger, the yellow
key, a side key or the space bar — reads every tag in range over and over, nearer tags more often and
stronger; **releasing it** posts the unique tags once, as one batch, exactly as the APK does. Then the
app's own behaviour: Kuat / Sedang / Lemah quality, BARU / LAMA, Scan Baru vs Lanjutkan, ✓ Terkirim or
a one-line failure with Kirim Ulang (code 500 becomes the fixed "hubungi Tim WMS" line), the "Tag belum
terkirim" question before unsent tags are dropped, the success / failure tones, Riwayat Log with its
last 30 attempts and resend, and replacement mode stopping at the first tag. Settings live on the
device's own Pengaturan screen. Barcode mode, the floating bubble, the update banner and CSV backup are
not simulated. The device is in [src/components/handheld/](src/components/handheld/); the behaviour
in [src/simulators/rfid/rfid-handheld.ts](src/simulators/rfid/rfid-handheld.ts).

The gate is an **8-antenna portal at the warehouse door** (three per side, two overhead), drawn in
isometric, that a **forklift drives a stack of RR through** — one pass per load, up to 18 RR, all
stacked on the forks. The gate reports as one reader on one antenna. While the load is in the field it
posts **every interval only what the antennas caught in that window**: tags arrive spread over 2–4
reports and repeat while still in the field, and the whole load is reported before the forklift drives
off. The report timeline shows each POST as new vs. repeated tags — the deduplication your consumer
has to do. The load is an EPC list, editable or randomised; editing it mid-pass loads the next
forklift. The scene is in [src/components/gate/](src/components/gate/), the behaviour in
[src/simulators/rfid/rfid-reader.ts](src/simulators/rfid/rfid-reader.ts).

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

The workspace is a **tightening station**: a tower controller in the style of a CVI3 (no logo) whose
screen shows torque and angle against their limits, the tool hanging from its balancer over a plain
workpiece with one bolt per fastening in the batch. **Holding the trigger** (the button or the space
bar) runs the fastening; letting go early stops it short and reports NG with torque LOW, as a real tool
does. Beside it the torque × angle curve is drawn live inside its acceptance window, with the previous
curve faint behind it; under it, the last results and the latest MID 0061 split field by field. The
station is in [src/components/nutrunner/](src/components/nutrunner/).

The PLC is the one device a browser cannot be on its own: an acquisition program *connects to* a
PLC, and a page can neither accept a TCP connection nor start a program on the visitor's machine. So
the socket half is [public/mc-plc.mjs](public/mc-plc.mjs) — one file, no dependencies, **served by
the site itself** at `/mc-plc.mjs` — and the workspace shows the command that downloads and runs it,
with a tab per terminal (picked from the visitor's OS):

| Terminal                  | Command                                                    |
| ------------------------- | ---------------------------------------------------------- |
| Linux / macOS, Windows CMD | `curl -fsSL https://<site>/mc-plc.mjs -o mc-plc.mjs && node mc-plc.mjs` |
| Windows PowerShell        | `irm https://<site>/mc-plc.mjs -OutFile mc-plc.mjs; node mc-plc.mjs`    |

The download is the shell's job, not Node's — `fetch` only exists from Node 18, while the bridge runs
on Node 14+. CMD can share the Linux line because `curl` ships with Windows 10+; PowerShell aliases
`curl` to `Invoke-WebRequest`, hence `irm`. A download button covers everything else. No server, no
repo, no install. The workspace polls `http://localhost:8201` and connects by itself the moment the
bridge is up. Chrome may ask once to allow the site to reach the local network.

**One-click Start / Stop.** A page cannot start a program, but it can open a link the OS hands to a
registered one. Running the same command with `--install` once (Windows, Linux) copies the bridge
to a fixed folder and registers `stechoq-plc://`: on Windows in `HKCU\Software\Classes` through a
hidden `wscript` launcher, on Linux as a `.desktop` file plus one line in `~/.config/mimeapps.list`
(what `xdg-mime` would write; not every desktop ships xdg-utils). From then on **Start PLC** in the
workspace launches it in the background with no window, and **Stop PLC** shuts it down over HTTP. The
link passes nothing into the process — any page could fire it. A launched bridge leaves on its own
after 10 minutes with no workspace calling, a second Start exits because the port is taken, and its
output goes to `mc-plc.log` beside the installed copy. Re-run the install command to update;
`node mc-plc.mjs --uninstall` removes it all. macOS is not covered: use the command without `--install`.

The workspace draws the PLC as a **Q-series rack in its cabinet**: a red power supply, a CPU with a
built-in Ethernet port, I/O modules wired into the ducts, blank covers, and a LAN cable to the
acquisition program. The model names follow the real modules; no maker's logo is drawn. The LEDs follow
the real state: POWER and MODE when the bridge runs, RUN when it answers, ERR blinking when it is
silent, SD/RD on every frame, and the cable comes out when the PLC goes offline (the I/O LEDs are
decoration). Below it are a **device monitor** in the GX Works manner (device, a comment kept in the
browser, value in DEC or HEX, client reads and writes, rows lighting up as the client touches them) and
a **frame decoder** that colours the bytes of any MC frame by field. The cabinet is scaled to the window
so it is never cut. Code: [src/components/plc/](src/components/plc/).

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
│   ├── handheld/        The MC33 device, its tag bench and the WMS RFID Suite app
│   ├── gate/            The isometric 8-antenna gate and the forklift going through
│   ├── nutrunner/       The tightening station, the torque curve and the MID 0061 decoder
│   └── plc/             The Q-series rack, the device monitor and the frame decoder
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

A device that needs a purpose-built view (a channel grid) adds a case to
`src/components/device-panels.tsx`; one that needs a whole workspace of its own (handheld, gate,
nutrunner, PLC) gets a folder under `src/components/` and a branch in `workspace.tsx`. Everything else stays generic.

Devices that need a new protocol view add a builder returning a `TransportFrame` in
`src/simulators/core/wire.ts`; the inspector prints whatever it is handed.

## Dependencies

React, Vite, TypeScript, esbuild. No router, no state library, no UI kit, no icon package — hash
routing, `useSyncExternalStore`, hand-written CSS and inline SVG cover it.
