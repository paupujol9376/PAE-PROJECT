import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { dialog, type DialogName } from '../state';
import { t } from '../i18n';

/** Native modal <dialog>: focus trap, Escape to close, focus returns to the opener. */
export function Dialog(props: { name: Exclude<DialogName, null>; title: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = dialog.value === props.name;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      class="dlg"
      aria-labelledby={`dlg-${props.name}`}
      onClose={() => { if (dialog.value === props.name) dialog.value = null; }}
      onClick={(e) => { if (e.target === ref.current) dialog.value = null; }}
    >
      {open && (
        <>
          <div class="dlg-head">
            <h2 id={`dlg-${props.name}`}>{props.title}</h2>
            <button class="icon-btn" aria-label={t('common.close')} onClick={() => (dialog.value = null)}><X size={20} /></button>
          </div>
          <div class="dlg-body">{props.children}</div>
        </>
      )}
    </dialog>
  );
}

export function Switch(props: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <div class="switch-row">
      <label id={`${props.id}-l`} for={props.id}>{props.label}</label>
      <button id={props.id} class="switch" role="switch" aria-checked={props.checked} aria-labelledby={`${props.id}-l`} onClick={() => props.onChange(!props.checked)} />
    </div>
  );
}

export function StatusDot(props: { status: 'connected' | 'not_connected' | 'unknown' }) {
  return <span class="dot" aria-hidden="true" style={{ background: `var(--status-${props.status.replace('_', '-')})` }} />;
}
