/** Hand-rolled 24px stroke icons — no icon dependency for fifteen glyphs. */
const PATHS: Record<string, string> = {
  rfid: 'M4 12h3M10 6.5a7 7 0 0 1 0 11M14 4a10.5 10.5 0 0 1 0 16M7 9.5a4 4 0 0 1 0 5',
  wrench: 'M15.5 4.5a4.5 4.5 0 0 0-6 6L4 16v4h4l5.5-5.5a4.5 4.5 0 0 0 6-6l-2.5 2.5-2.5-2.5Z',
  io: 'M4 6h7v5H4zM13 13h7v5h-7zM7.5 11v4M16.5 6v4M4 18h5M15 6h5',
  antenna: 'M12 21v-8M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9 9 0 0 1 13 0M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  barcode: 'M4 5v14M7 5v14M10 5v10M13 5v14M16 5v10M19 5v14',
  car: 'M4 15h16M6 15l1.5-5h9L18 15M5 15v3h3v-3M16 15v3h3v-3M9 12h6',
  gauge: 'M12 20a8 8 0 1 1 8-8M12 12l4.5-4M12 12h.01M4.5 15h3M16.5 18h3',
  camera: 'M3 8h4l1.5-2h7L17 8h4v11H3zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  conveyor: 'M3 14h18M6 17.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 10h8v-4H8z',
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3',
  check: 'M4 5h16v14H4zM8 12l3 3 5-6',
  braces: 'M9 4C7 4 7.5 10 5.5 10 7.5 10 7 20 9 20M15 4c2 0 1.5 6 3.5 6-2 0-1.5 10-3.5 10',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4',
  broadcast: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 8a5.5 5.5 0 0 0 0 8M16 8a5.5 5.5 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14',
  grid: 'M4 4h16v16H4zM4 9.5h16M4 15h16M9.5 4v16M15 4v16',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  play: 'M7 4.5 19 12 7 19.5z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  bolt: 'M13 3 5 14h5l-1 7 8-11h-5z',
  chevron: 'M9 6l6 6-6 6',
  caret: 'M6 9l6 6 6-6',
  burger: 'M4 7h16M4 12h16M4 17h16',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
};

interface Props {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className }: Props) {
  const d = PATHS[name] ?? PATHS.grid;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
