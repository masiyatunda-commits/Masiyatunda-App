/* MilkyWay Live alien: the shaded, breathing 3D alien used on the join / request buttons.
   Guests get a living alien that flinches back when touched; hosts get an alien raising its hand. */
(() => {
  const defs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <radialGradient id="mwxaSkin" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#f0ffd2"/><stop offset=".22" stop-color="#b4f78d"/><stop offset=".55" stop-color="#43c46a"/><stop offset=".84" stop-color="#147a4b"/><stop offset="1" stop-color="#083a28"/></radialGradient>
    <linearGradient id="mwxaBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fe08e"/><stop offset=".55" stop-color="#25995a"/><stop offset="1" stop-color="#0a4430"/></linearGradient>
    <radialGradient id="mwxaEye" cx=".42" cy=".32" r=".75"><stop offset="0" stop-color="#4a5f9c"/><stop offset=".3" stop-color="#151a3a"/><stop offset="1" stop-color="#010104"/></radialGradient>
    <radialGradient id="mwxaOrb" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#c9fff4"/><stop offset="1" stop-color="#14c8e6"/></radialGradient>
    <radialGradient id="mwxaSheen" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="mwxaShade" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs></svg>`;
  const ensureDefs = () => {
    if (document.getElementById('mwxaSkin')) return;
    const holder = document.createElement('div');holder.innerHTML = defs;document.body.append(holder.firstElementChild);
  };
  const arm = `<g class="mwxa-arm"><path d="M43 53c6-3 9-10 10-19" fill="none" stroke="#0d5a38" stroke-width="6" stroke-linecap="round"/><path d="M43 53c6-3 9-10 10-19" fill="none" stroke="#3fbf6a" stroke-width="4.2" stroke-linecap="round"/><g class="mwxa-hand"><path d="M51 30.5l-1.6-4.6M53.4 29.6l-.2-5.2M55.8 30.4l1.4-4.6" stroke="#0d5a38" stroke-width="2.8" stroke-linecap="round"/><path d="M51 30.5l-1.6-4.6M53.4 29.6l-.2-5.2M55.8 30.4l1.4-4.6" stroke="#8be59c" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="53.4" cy="32.4" rx="3.8" ry="3.4" fill="url(#mwxaSkin)" stroke="#0d5a38" stroke-width=".8"/></g></g>`;
  // One alien: shadow, torso, head with almond eyes, blinking lids, swaying antennae; the host variant also raises a hand.
  function markup(kind = 'join') {
    ensureDefs();
    const raised = kind === 'host';
    return `<span class="mwx-alien" data-variant="${kind}" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false">
      <ellipse class="mwxa-shadow" cx="32" cy="61.5" rx="15" ry="2.6" fill="url(#mwxaShade)"/>
      <g class="mwxa-body">
        <path d="M17 63c0-9.5 6.5-15 15-15s15 5.5 15 15Z" fill="url(#mwxaBody)"/>
        <path d="M23 56c3-2.2 6-3 9-3s6 .8 9 3" fill="none" stroke="#b9f7c8" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>
        ${raised ? arm : ''}
        <g class="mwxa-head">
          <g class="mwxa-antenna mwxa-antenna-l"><path d="M24.5 13.5C22 9 19 6.5 15.5 5" fill="none" stroke="#0f6a42" stroke-width="2" stroke-linecap="round"/><circle class="mwxa-orb" cx="15" cy="4.6" r="2.8" fill="url(#mwxaOrb)"/></g>
          <g class="mwxa-antenna mwxa-antenna-r"><path d="M39.5 13.5C42 9 45 6.5 48.5 5" fill="none" stroke="#0f6a42" stroke-width="2" stroke-linecap="round"/><circle class="mwxa-orb" cx="49" cy="4.6" r="2.8" fill="url(#mwxaOrb)"/></g>
          <path d="M32 9.5c-12 0-19.5 8-19.5 18.2C12.5 39 22 49 32 49s19.5-10 19.5-21.3C51.5 17.5 44 9.5 32 9.5Z" fill="url(#mwxaSkin)" stroke="#0a4a31" stroke-width=".7"/>
          <ellipse cx="25" cy="16.5" rx="8" ry="4.2" fill="url(#mwxaSheen)" transform="rotate(-18 25 16.5)"/>
          <path class="mwxa-eye" d="M16.6 27.4c1.8-6 8.8-8.4 13-4.4 1.2 4.6-3.8 9.6-8.8 9.6-3.2 0-5.2-2.2-4.2-5.2Z" fill="url(#mwxaEye)"/>
          <path class="mwxa-eye" d="M47.4 27.4c-1.8-6-8.8-8.4-13-4.4-1.2 4.6 3.8 9.6 8.8 9.6 3.2 0 5.2-2.2 4.2-5.2Z" fill="url(#mwxaEye)"/>
          <g class="mwxa-shine"><circle cx="21.4" cy="25" r="1.7" fill="#fff"/><circle cx="25.2" cy="28.4" r=".75" fill="#fff" fill-opacity=".75"/><circle cx="42.6" cy="25" r="1.7" fill="#fff"/><circle cx="38.8" cy="28.4" r=".75" fill="#fff" fill-opacity=".75"/></g>
          <path class="mwxa-lid" d="M16.4 27.6c1.8-6.2 9-8.6 13.2-4.6.6 2.4-.4 4.6-2 6.4-3.6-1.6-7.8-2.2-11.2-1.8Z" fill="url(#mwxaSkin)"/>
          <path class="mwxa-lid" d="M47.6 27.6c-1.8-6.2-9-8.6-13.2-4.6-.6 2.4.4 4.6 2 6.4 3.6-1.6 7.8-2.2 11.2-1.8Z" fill="url(#mwxaSkin)"/>
          <circle cx="30.4" cy="35.6" r=".6" fill="#0a3a26"/><circle cx="33.6" cy="35.6" r=".6" fill="#0a3a26"/>
          <path class="mwxa-mouth" d="M28.2 39.6c2.4 1.7 5.2 1.7 7.6 0" fill="none" stroke="#0a3a26" stroke-width="1.2" stroke-linecap="round"/>
          <ellipse cx="22" cy="36" rx="2.4" ry="1.3" fill="#ff8fb1" fill-opacity=".28"/><ellipse cx="42" cy="36" rx="2.4" ry="1.3" fill="#ff8fb1" fill-opacity=".28"/>
        </g>
      </g>
    </svg></span>`;
  }

  // Tactile press: the alien bends back under the finger, then steps back and springs up when released.
  let last = null, lastAt = 0;
  const reduced = () => matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function recoil(touch) {
    if (!touch) return Promise.resolve();
    touch.classList.remove('is-touched', 'is-recoil');
    void touch.offsetWidth;
    touch.classList.add('is-recoil');
    clearTimeout(touch.mwxaTimer);
    touch.mwxaTimer = setTimeout(() => touch.classList.remove('is-recoil'), 620);
    return new Promise(resolve => setTimeout(resolve, reduced() ? 0 : 420));
  }
  document.addEventListener('pointerdown', event => {
    const touch = event.target.closest?.('.mwx-alien-touch');
    if (!touch || event.button > 0) return;
    last = touch;lastAt = Date.now();
    touch.classList.remove('is-recoil');touch.classList.add('is-touched');
    try { navigator.vibrate?.(12); } catch {}
  }, { passive: true, capture: true });
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => {
    document.querySelectorAll('.mwx-alien-touch.is-touched').forEach(touch => { touch.classList.remove('is-touched');if (type === 'pointercancel') return;touch.classList.add('is-recoil');clearTimeout(touch.mwxaTimer);touch.mwxaTimer = setTimeout(() => touch.classList.remove('is-recoil'), 620); });
  }, { passive: true, capture: true });
  // Resolves once the press reaction has played, so the request state follows the alien's reaction.
  function react(fallback) {
    const touch = last && Date.now() - lastAt < 1500 && last.isConnected ? last : fallback;
    last = null;
    if (!touch) return Promise.resolve();
    if (touch.classList.contains('is-recoil')) return new Promise(resolve => setTimeout(resolve, reduced() ? 0 : 380));
    return recoil(touch);
  }
  window.MilkyWayAlien = { markup, react };
})();
