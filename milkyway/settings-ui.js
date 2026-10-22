(() => {
  // Settings sheet layout: several scripts append their rows to the sheet at start-up, so regroup them into glass sections
  // (Privacy, Notifications, Media, Language & appearance, Security) with switch toggles and a sticky Close/Save bar.
  const byId = identity => document.getElementById(identity);
  const sheet = byId('settingsSheet')?.querySelector('.sheet');
  if (!sheet) return;
  const row = identity => byId(identity)?.closest('.setting-row');
  const group = (name, heading, rows) => {
    const section = document.createElement('section');section.className = 'mws-group';section.dataset.group = name;
    if (heading) section.append(heading);
    const card = document.createElement('div');card.className = 'mws-card';
    rows.filter(Boolean).forEach(item => card.append(item));
    section.append(card);
    return section;
  };
  const heading = (key, existing) => {
    if (existing) return existing;
    const title = document.createElement('h3');title.dataset.mwI18n = key;title.textContent = window.MilkyWayI18n?.t(key) || key;return title;
  };
  function build() {
    if (sheet.classList.contains('mws-sheet')) return;
    sheet.classList.add('mws-sheet');
    const [title] = sheet.querySelectorAll(':scope>h2');
    const intro = title?.nextElementSibling?.matches('p.muted') ? title.nextElementSibling : null;
    const headings = [...sheet.querySelectorAll(':scope>h3')];
    const [privacyHeading, notifyHeading, securityHeading, documentsHeading] = headings;
    const securityNote = securityHeading?.nextElementSibling;
    const documents = documentsHeading?.nextElementSibling;
    const media = sheet.querySelector(':scope>.mw-media-settings');
    const mediaHeading = media?.querySelector('h3');
    const mediaHelp = media?.querySelector('p');
    const volume = row('mwNotificationVolume');
    volume?.classList.add('mws-slider-row');
    if (mediaHelp) mediaHelp.className = 'mws-help';
    if (securityNote) securityNote.className = 'mws-help';
    if (documents) documents.className = 'mws-links';
    const documentsLabel = documentsHeading ? Object.assign(document.createElement('p'), { className: 'mws-subhead' }) : null;
    if (documentsLabel) { documentsLabel.textContent = documentsHeading.textContent;documentsHeading.remove(); }
    const actions = byId('saveSettingsBtn')?.closest('.row');
    const message = byId('settingsMsg');
    const head = document.createElement('div');head.className = 'mws-head';
    if (title) { title.textContent = title.textContent.replace(/^⚙\s*/, '');head.append(title); }
    if (intro) head.append(intro);
    const groups = [
      group('privacy', privacyHeading, [row('privacyPrivate'), row('privacyMessages')]),
      group('notifications', notifyHeading, [row('notifySound'), volume, row('notifyFollow'), row('notifyEcho'), row('notifySignal')]),
      media ? group('media', mediaHeading, [row('mwVideoAutoplay'), mediaHelp]) : null,
      group('display', heading('displaySettings'), [row('mwSettingsLanguage'), row('mwAppearance')]),
      group('security', heading('securitySettings', securityHeading), [securityNote, documentsLabel, documents]),
    ].filter(Boolean);
    media?.remove();
    const close = sheet.querySelector(':scope>.close');
    sheet.replaceChildren(...[close, head, ...groups, message].filter(Boolean));
    if (actions) { actions.className = 'row mws-actions';sheet.append(actions); }
    if (message && !message.textContent.trim()) message.hidden = true;
    message?.classList.add('mws-message');
    paintSlider();
    window.MilkyWayI18n?.apply?.();
  }
  // The filled part of the volume slider follows its value.
  function paintSlider() { const slider = byId('mwNotificationVolume');if (slider) slider.style.setProperty('--mws-fill', `${slider.value}%`); }
  document.addEventListener('input', event => { if (event.target.id === 'mwNotificationVolume') paintSlider(); });
  const refresh = () => { byId('privacyMessages')?.dispatchEvent(new Event('change'));paintSlider(); };
  window.addEventListener('mw-settings-open', () => { build();paintSlider(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });else build();
  window.MilkyWaySettingsUi = { refresh };
})();
