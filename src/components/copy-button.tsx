import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { Icon } from './icon';

interface Props {
  text: string;
  label?: string;
  title?: string;
}

/** Copy to clipboard with a "Copied" acknowledgement. */
export function CopyButton({ text, label, title }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back to a selectable prompt.
      window.prompt(t('copy.manual', 'Copy manually:'), text);
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  const idle = label ?? t('action.copy', 'Copy');

  return (
    <button className="btn btn-sm" onClick={copy} title={title ?? idle} type="button">
      <Icon name="copy" size={13} />
      {copied ? t('action.copied', 'Copied') : idle}
    </button>
  );
}
