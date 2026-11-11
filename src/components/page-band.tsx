import type { ReactNode } from 'react';

/** The header band of a content page: same blueprint look as the home hero. */
export function PageBand({
  eyebrow,
  title,
  lede,
  stats,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  stats?: [string, string][];
  children?: ReactNode;
}) {
  return (
    <section className="page-band">
      <div className="container page-band-inner">
        <div>
          <p className="hero-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="page-band-lede">{lede}</p>
          {children}
        </div>
        {stats && (
          <dl className="hero-facts">
            {stats.map(([v, k]) => (
              <div key={k}>
                <dt>{v}</dt>
                <dd>{k}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
