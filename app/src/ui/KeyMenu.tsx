import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colorCss, useApp, type Easing, type PathMode } from '../store';
import { EASING_LABELS, segmentPath } from '../engine/interpolation';
import {
  deleteKeyframe, deleteObjectKey, duplicateKeyframe, duplicateObjectKey, refreshKeyframe, refreshObjectKey, seek, updateKeyframe, updateObjectKey,
} from '../timeline';
import { objectLabel, useT } from '../i18n';

// Menu del clic destro su un keyframe (o sul tratto che parte da lì): interpolazione, percorso
// (solo camera), duplica, aggiorna, elimina.

export interface KeyMenuTarget {
  x: number;
  y: number;
  /** id dell'oggetto; assente per i keyframe della camera */
  obj?: string;
  key: string;
}

const EASINGS: Easing[] = ['linear', 'in', 'out', 'inout', 'hold'];
const PATHS: PathMode[] = ['arc', 'linear', 'pan'];

export function KeyMenu({ target, onClose }: { target: KeyMenuTarget; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const t = useT();
  const time = useApp(s => s.time);
  const fps = useApp(s => s.fps);
  const keyframes = useApp(s => s.keyframes);
  const obj = useApp(s => (target.obj ? s.objects.find(o => o.id === target.obj) : undefined));

  const keys = target.obj ? obj?.keys ?? [] : keyframes;
  const index = keys.findIndex(k => k.id === target.key);
  const key = keys[index];

  // il menu resta dentro la finestra (la timeline è in basso: di solito si apre verso l'alto)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = target.y + r.height > innerHeight - 8 ? Math.max(8, target.y - r.height) : target.y;
    const left = Math.min(target.x, innerWidth - r.width - 8);
    setPos({ left: Math.max(8, left), top });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [target]);

  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    };
    addEventListener('pointerdown', away, true);
    addEventListener('keydown', key, true);
    addEventListener('resize', onClose);
    addEventListener('blur', onClose);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('keydown', key, true);
      removeEventListener('resize', onClose);
      removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // il keyframe è sparito (annulla, eliminato altrove)
  useEffect(() => { if (!key) onClose(); }, [key, onClose]);
  if (!key) return null;

  const isLast = index === keys.length - 1;
  const onKey = Math.abs(key.time - time) < 0.5 / fps;
  const run = (fn: () => void) => () => { fn(); onClose(); };

  const setEasing = (e: Easing) =>
    target.obj ? updateObjectKey(target.obj, key.id, { easing: e }) : updateKeyframe(key.id, { easing: e });

  // solo camera: percorso del tratto
  const camKey = !target.obj ? keyframes[index] : undefined;
  const next = camKey ? keyframes[index + 1] : undefined;
  const path = camKey && next ? segmentPath(camKey.camera, next.camera, camKey.path) : undefined;
  const fixed = camKey && next ? segmentPath(camKey.camera, next.camera, 'arc') === 'pan' : false;
  const pathLabel = { arc: t('tl.arc'), linear: t('tl.linear'), pan: t('tl.pan') };
  const pathTitle = { arc: t('tl.arcTitle'), linear: t('tl.linearTitle'), pan: t('tl.panTitle') };

  return (
    <div
      ref={ref}
      className="key-menu"
      role="menu"
      style={{ left: pos.left, top: pos.top, '--obj': obj ? colorCss(obj) : undefined } as React.CSSProperties}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="km-head">
        {obj ? <i className="obj-dot" style={{ background: colorCss(obj) }} /> : '◆ '}
        {obj ? objectLabel(obj) : t('km.camera')} · {key.time.toFixed(2)} s
      </div>
      {isLast ? (
        <div className="km-note">{t('km.lastKey')}</div>
      ) : (
        <>
          <div className="km-label">{t('km.curve')}</div>
          {EASINGS.map(e => (
            <button key={e} role="menuitemradio" aria-checked={key.easing === e} className={key.easing === e ? 'on' : ''} onClick={run(() => setEasing(e))}>
              <span className="km-check">{key.easing === e ? '✓' : ''}</span>{EASING_LABELS[e]}<small>{t(`km.ease.${e}`)}</small>
            </button>
          ))}
          {path && (
            <>
              <div className="km-label">{t('tl.path')}</div>
              {PATHS.map(p => (
                <button key={p} role="menuitemradio" aria-checked={path === p} className={path === p ? 'on' : ''}
                  disabled={p !== 'pan' && fixed} title={pathTitle[p]} onClick={run(() => updateKeyframe(key.id, { path: p }))}>
                  <span className="km-check">{path === p ? '✓' : ''}</span>{pathLabel[p]}
                </button>
              ))}
            </>
          )}
        </>
      )}
      <hr />
      <button role="menuitem" disabled={onKey} onClick={run(() => seek(key.time))}>
        <span className="km-check" />{t('km.goto')}
      </button>
      <button role="menuitem" disabled={onKey} title={t('km.duplicateTitle')}
        onClick={run(() => (target.obj ? duplicateObjectKey(target.obj, key.id) : duplicateKeyframe(key.id)))}>
        <span className="km-check" />{t('km.duplicate', { t: time.toFixed(2) })}
      </button>
      <button role="menuitem" title={target.obj ? t('tl.subjUpdateTitle') : t('tl.updateTitle')}
        onClick={run(() => (target.obj ? refreshObjectKey(target.obj, key.id) : refreshKeyframe(key.id)))}>
        <span className="km-check" />{target.obj ? t('tl.subjUpdate') : t('tl.update')}
      </button>
      <button role="menuitem" className="danger"
        onClick={run(() => (target.obj ? deleteObjectKey(target.obj, key.id) : deleteKeyframe(key.id)))}>
        <span className="km-check" />{t('tl.delete')}
      </button>
    </div>
  );
}
