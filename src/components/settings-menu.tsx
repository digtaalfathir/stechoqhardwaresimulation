import { useEffect, useId, useRef, useState } from 'react';
import { setLang, setTheme, useSettings, type Lang, type Theme } from '../lib/settings';
import { useT } from '../lib/i18n';
import { Icon } from './icon';

/** Header settings panel: theme and interface language. */
export function SettingsMenu() {
  const { theme, lang } = useSettings();
  const t = useT();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const themes: [Theme, string, string][] = [
    ['light', t('settings.theme.light', 'Light'), 'sun'],
    ['dark', t('settings.theme.dark', 'Dark'), 'moon'],
  ];
  const langs: [Lang, string][] = [
    ['en', t('settings.lang.en', 'English')],
    ['id', t('settings.lang.id', 'Indonesia')],
  ];

  return (
    <div className="settings" ref={root}>
      <button
        type="button"
        className="settings-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        aria-label={t('settings.label', 'Settings')}
        title={t('settings.label', 'Settings')}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="burger" size={17} />
      </button>

      {open && (
        <div className="settings-panel" id={panelId}>
          <fieldset className="settings-group">
            <legend>{t('settings.theme', 'Theme')}</legend>
            <div className="segmented">
              {themes.map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                >
                  <Icon name={icon} size={14} />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-group">
            <legend>{t('settings.lang', 'Language')}</legend>
            <div className="segmented">
              {langs.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLang(value)}
                  aria-pressed={lang === value}
                >
                  <span className="lang-code">{value.toUpperCase()}</span>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="settings-note">{t('settings.note', 'Saved in this browser.')}</p>
        </div>
      )}
    </div>
  );
}
