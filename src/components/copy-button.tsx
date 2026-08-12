import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';

interface Props {
  text: string;
  label?: string;
  title?: string;
}

/** Copy to clipboard with a "Copied" acknowledgement. */
export function CopyButton({ text, label = 'Copy', title }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back to a selectable prompt.
      window.prompt('Copy manually:', text);
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button className="btn btn-sm" onClick={copy} title={title ?? label} type="button">
      <Icon name="copy" size={13} />
      {copied ? 'Copied' : label}
    </button>
  );
}
