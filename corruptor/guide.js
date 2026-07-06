const INSTAGRAM = 'https://www.instagram.com/matzkaim';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

function igLink(text, className) {
  return el('a', {
    className,
    href: INSTAGRAM,
    target: '_blank',
    rel: 'noopener',
    textContent: text,
  });
}

function buildModal() {
  const dialog = el('div', { className: 'guide-dialog' });
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'How to use');

  const close = el('button', { className: 'guide-dialog__close', type: 'button', innerHTML: '&#10005;', title: 'CLOSE (ESC)' });
  close.setAttribute('aria-label', 'Close');

  const list = el('ul', { className: 'guide-list' }, [
    el('li', {}, [
      'A generator of ',
      el('i', { textContent: 'STRANGE, CORRUPTED' }),
      ' sounds — FX one-shots, drones, textures, ideas. Not a mixing tool.',
    ]),
    el('li', {}, [
      el('b', { textContent: 'SOURCE' }),
      ': ',
      el('b', { textContent: 'SHOT' }),
      ' (one hit), ',
      el('b', { textContent: 'LOOP' }),
      ' (rhythmic loop), ',
      el('b', { textContent: 'DRONE' }),
      ' (sustained tone). ',
      el('b', { textContent: 'RND SOURCE' }),
      ' / presets / ',
      el('b', { textContent: 'AUTO WIRE' }),
      ' roll a new source; ',
      el('b', { textContent: '⌁ NOTES' }),
      ' rerolls the melody only.',
    ]),
    el('li', {}, [
      el('b', { textContent: 'RACK A' }),
      ' = live effects on the synth (instant). ',
      el('b', { textContent: 'RACK B' }),
      ' = offline ',
      el('i', { textContent: 'data corruption' }),
      ' of the rendered audio — bit-rot, dropouts, spectral freeze, shatter. ',
      el('b', { textContent: 'IMAGE' }),
      ' turns a picture into sound (spectrogram / carve / raw bytes).',
    ]),
    el('li', {}, [
      el('b', { textContent: 'CURVE' }),
      ' spreads the corruption over time (COLLAPSE decays to the end, HEAL starts broken). ',
      el('b', { textContent: 'TEMPO / BARS' }),
      ' quantize the length so loops drop into your DAW on the grid; for SHOT the length is just the hit duration.',
    ]),
    el('li', {}, [
      el('b', { textContent: 'REC WAV' }),
      ' saves exactly what you hear ',
      el('i', { textContent: '(PLAY == WAV)' }),
      '. Something broke or went silent? Hit ',
      el('b', { textContent: 'RESET' }),
      '.',
    ]),
    el('li', {}, [
      el('span', { className: 'guide-list__flag', textContent: 'IMPORTANT: ' }),
      'generate and reuse. Grab the WAVs and layer, arrange and finish them in Ableton / FL / any DAW. Don’t rely on this box alone or try to do everything here — it exists to hand you corrupted sounds and ideas.',
    ]),
  ]);
  list.classList.add('guide-list--warn');

  const foot = el('div', { className: 'guide-dialog__foot' }, [
    igLink('DEVELOPED BY ANTON·MATZKAIM', 'guide-credit'),
  ]);

  dialog.append(
    close,
    el('h2', { textContent: 'HOW TO USE' }),
    el('p', { className: 'guide-dialog__sub', textContent: 'DC·77 DATA CORRUPTOR' }),
    list,
    foot,
  );

  const overlay = el('div', { className: 'guide-overlay' }, [dialog]);

  const openBtn = el('button', { className: 'guide-btn', type: 'button', textContent: '? GUIDE' });

  const open = () => { overlay.classList.add('is-open'); close.focus(); };
  const shut = () => { overlay.classList.remove('is-open'); openBtn.focus(); };

  openBtn.addEventListener('click', open);
  close.addEventListener('click', shut);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) shut(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) shut();
  });

  return { openBtn, overlay };
}

function buildResetHint() {
  const hint = el('div', { className: 'guide-hint', title: 'reset the machine' }, [
    'BROKEN / NO SOUND? → HIT ',
    el('b', { textContent: 'RESET' }),
  ]);
  hint.setAttribute('role', 'button');
  hint.setAttribute('tabindex', '0');
  const fire = () => {
    const reset = document.querySelector('[data-js-reset]');
    if (reset) reset.click();
  };
  hint.addEventListener('click', fire);
  hint.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fire(); }
  });
  return hint;
}

function mount() {
  if (document.querySelector('.guide-btn')) return;
  const { openBtn, overlay } = buildModal();
  document.body.append(
    openBtn,
    overlay,
    buildResetHint(),
    igLink('DEV BY ANTON·MATZKAIM', 'guide-badge'),
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
