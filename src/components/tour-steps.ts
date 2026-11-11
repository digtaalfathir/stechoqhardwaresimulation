import type { Translate } from '../lib/i18n';
import type { TourStep } from './tour';

/** The tour of each workspace: what is where, and what to do with it. */
export function tourSteps(id: string, name: string, t: Translate): TourStep[] {
  const s = (target: string, key: string, title: string, body: string): TourStep => ({
    target,
    title: t(`tour.${key}.t`, title),
    body: t(`tour.${key}.b`, body),
  });

  const intro = s(
    '.ws-head',
    'intro',
    'Welcome',
    'A one-minute tour of this simulator. Skip it any time with Esc, and replay it later from the Tour button up here.',
  );
  intro.title = `${intro.title} — ${name}`;

  const outro = [
    s(
      '.device-switcher',
      'switch',
      'Switch devices',
      'Every simulator is one click away, and each keeps its state while you look at another.',
    ),
    s('[data-tour="events"]', 'events', 'Event stream', 'Every action the device takes lands here. Click a row to pin it and read its payload.'),
    s('[data-tour="comm"]', 'comm', 'Communication log', 'Only the events that put traffic on the wire, with the protocol frame behind each one.'),
  ];

  const device: Record<string, TourStep[]> = {
    'rfid-handheld': [
      s(
        '.hh-device',
        'hh.device',
        'The handheld',
        'An MC3300 running the WMS RFID Suite app, screen for screen. Tap the app as you would on the device — the API address lives on its own Pengaturan screen.',
      ),
      s('.k.scan', 'hh.key', 'The yellow key', 'Hold it (or the space bar) to scan: every tag in range is read. Release it and the batch is sent to your API.'),
      s(
        '.hh-bench-area',
        'hh.bench',
        'The tag bench',
        'Drag tags in and out of the beam. The beam follows the reader power set in the app; nearer tags read more often and stronger.',
      ),
      s('.hh-tray', 'hh.tray', 'Add tags', 'Paste one or more EPCs, add five random ones, or clear the bench.'),
      s('[data-tour="send"]', 'send', 'Send result', 'The real answer from your endpoint — status, message and time. A failure here is a real failure.'),
    ],
    'rfid-reader': [
      s('.gt-config', 'gt.config', 'Gate settings', 'Reader ID, antenna, report interval and the endpoint every report is posted to. Edit opens the full form.'),
      s(
        '.gt-stage',
        'gt.stage',
        'The portal',
        'Eight antennas — three each side, two overhead. A forklift carries a stack of RR through, one pass per load.',
      ),
      s('.gt-hud', 'gt.hud', 'Drive a pass', 'Send the forklift through or stop it, and choose how often the gate reports: every 7, 3 or 1 s.'),
      s('.gt-side > :first-child', 'gt.load', 'The load', 'The EPCs on the forks, one per line. Edit them or randomise; a change loads the next forklift.'),
      s(
        '.gt-main > :last-child',
        'gt.timeline',
        'Report timeline',
        'Each POST as it went out, new tags against repeats — the deduplication your consumer has to do.',
      ),
      s('[data-tour="send"]', 'send', 'Send result', 'The real answer from your endpoint — status, message and time. A failure here is a real failure.'),
    ],
    nutrunner: [
      s(
        '.nr-status',
        'nr.status',
        'Controller and Pset',
        'The controller address, its Open Protocol session and the Pset limits. Settings opens the full configuration.',
      ),
      s(
        '.nr-stage-box',
        'nr.station',
        'The station',
        'A CVI3-style controller, the tool on its balancer, and a workpiece with one bolt per fastening in the batch.',
      ),
      s('.nr-hold', 'nr.hold', 'Hold the trigger', 'Hold this button or the space bar to run a fastening. Let go early and it ends NG with torque LOW.'),
      s('.nr-curve', 'nr.curve', 'Tightening curve', 'Torque over angle, drawn live inside the acceptance window, with the previous curve behind it.'),
      s('.nr-lower', 'nr.lower', 'Results and telegram', 'The last fastenings, and the latest MID 0061 split field by field — generated for inspection, not sent.'),
    ],
    'digital-io': [
      s('.dio-status', 'io.status', 'Module and transport', 'Switch between Modbus TCP, REST and MQTT, and between 4, 8 and 16 channels, right here.'),
      s(
        '.dio-stage-box',
        'io.box',
        'The I/O box',
        'An ESP32 + W5500 box with sensors on its inputs and loads on its outputs. Click a device to switch its channel; push buttons act while held.',
      ),
      s('.dio-strip', 'io.strip', 'Quick actions', 'Randomise the inputs, pulse DO01, drop every output, or reset the box.'),
      s('.dio-pi', 'io.pi', 'Process image', 'Both Modbus bit tables with their words, and the last frame byte by byte. Click a bit to flip it.'),
      s('.dio-tables', 'io.tables', 'Channels', 'Address, field device, your own comment, state and change count for every channel.'),
    ],
    plc: [
      s(
        '.pl-status',
        'pl.status',
        'Connection',
        'The address your program connects to and the client that is connected. Online, Silent and Offline test how your program copes.',
      ),
      s(
        '.pl-start-card',
        'pl.start',
        'Start the PLC',
        'The PLC runs as a small program on your computer. The first time, copy the command for your terminal; after that, Start PLC is one click.',
      ),
      s(
        '.pl-cab-panel',
        'pl.cab2',
        'The PLC',
        'A Q-series rack in its cabinet, beside the acquisition program that talks to it. The modules light up as your program reads and writes.',
      ),
      s('.pl-monitor', 'pl.monitor', 'Device monitor', 'Add D, R or W registers, edit values live, and label each one. Your program reads exactly these.'),
      s('.pl-side > :first-child', 'pl.frame', 'Frame decoder', 'Every MC 3E request and response, byte by byte, as it arrives.'),
    ],
  };

  const generic = [
    s('[data-tour="config"]', 'gen.config', 'Configuration', 'Set the device up and apply it; the device comes online.'),
    s('[data-tour="controls"]', 'gen.controls', 'Controls', 'Trigger the actions the real device performs.'),
  ];

  return [intro, ...(device[id] ?? generic), ...outro];
}
