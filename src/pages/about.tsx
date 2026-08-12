import { href } from '../lib/router';
import { plannedSimulators } from '../simulators/registry';

export function AboutPage() {
  return (
    <div className="container">
      <div className="prose">
        <p className="eyebrow">About</p>
        <h2 style={{ fontSize: 24, marginTop: 4 }}>
          Virtual hardware laboratory for testing industrial device integrations
        </h2>
        <p>
          Industrial software is usually written next to industrial hardware. That hardware is
          expensive, there is one of it, it lives on a plant network, and it refuses to fail when you
          need it to. Stechoq Hardware Simulation removes that dependency: open a browser, pick a
          device, and work against its behaviour instead of the device itself.
        </p>

        <h2>What this is</h2>
        <ul>
          <li>A playground for industrial device behaviour — state, actions, communication.</li>
          <li>A source of realistic payloads for backend and integration work.</li>
          <li>A way to reproduce edge cases on demand: an NG fastening, a missed tag, a tool fault.</li>
          <li>A demo and training tool that does not need a crate of hardware to travel with it.</li>
        </ul>

        <h2>What this is not</h2>
        <ul>
          <li>Not a collection of mockups — each simulator is a real state machine.</li>
          <li>Not a device driver, and not a replacement for final commissioning on real hardware.</li>
          <li>Not a dashboard for live plant data.</li>
        </ul>

        <h2>Product principle</h2>
        <div className="callout">
          <p>
            One platform for simulating the behavior of industrial hardware. A simulator must
            reproduce device state, device actions and device communication. The UI is only the
            interface for controlling and observing the simulation, and the simulation engine stays
            independent from it.
          </p>
        </div>

        <h2>Roadmap</h2>
        <p>
          The catalog already declares {plannedSimulators.length} further devices across
          identification, vision, factory equipment and pure communication endpoints. Alongside them:
        </p>
        <ul>
          <li>Live transports — WebSocket, MQTT, TCP and REST against your own backend.</li>
          <li>Modbus register maps and raw frame views in the inspector.</li>
          <li>Persistent simulation sessions and shareable device setups.</li>
          <li>Shared sessions, so a team can drive one simulated line together.</li>
          <li>Scripted scenarios for regression and load testing.</li>
        </ul>

        <h2>Built by Stechoq</h2>
        <p>
          Stechoq builds industrial software for manufacturing lines. This platform started as
          internal tooling for exactly the problem above, and it grows a simulator at a time.
        </p>
        <p>
          <a href={href('/simulators')}>Explore the simulators</a> ·{' '}
          <a href={href('/docs')}>Read the documentation</a>
        </p>
      </div>
    </div>
  );
}
