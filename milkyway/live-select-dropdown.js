(() => {
  // Replaces the native Appearance select in Settings with the same dark popover used by the Language menu.
  const menus = [];
  const closeAll = () => menus.forEach(menu => menu.close());
  // The side menu builds its Appearance select later in start-up, so enhance once the page has parsed.
  const enhance = () => { for (const identity of ['mwAppearance', 'mwMenuAppearance', 'privacyMessages']) {
    const select = document.getElementById(identity);
    if (!select || select.classList.contains('mw-language-native')) continue;
    const wrapper = document.createElement('span');wrapper.className = 'mw-language-dropdown mw-select-dropdown';
    const trigger = document.createElement('button');trigger.type = 'button';trigger.className = 'mw-language-trigger mw-select-trigger';trigger.id = `${identity}Trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox');trigger.setAttribute('aria-expanded', 'false');trigger.setAttribute('aria-controls', `${identity}Options`);
    const list = document.createElement('span');list.className = 'mw-language-options mw-select-options';list.id = `${identity}Options`;list.role = 'listbox';list.hidden = true;
    select.before(wrapper);wrapper.append(trigger, list);select.hidden = true;select.classList.add('mw-language-native');select.tabIndex = -1;
    const label = select.closest('label');
    if (label) { label.htmlFor = trigger.id;list.setAttribute('aria-label', label.firstChild?.textContent?.trim() || identity); }
    const choices = [...select.options].map(source => {
      const option = document.createElement('button');option.type = 'button';option.role = 'option';option.tabIndex = -1;option.dataset.value = source.value;option.textContent = source.textContent;list.append(option);
      option.source = source;
      option.onclick = event => {
        event.preventDefault();select.value = source.value;select.dispatchEvent(new Event('change', { bubbles: true }));close();sync();trigger.focus({ preventScroll: true });
      };
      return option;
    });
    const close = () => { list.hidden = true;trigger.setAttribute('aria-expanded', 'false'); };
    const sync = () => {
      const current = select.options[select.selectedIndex];
      trigger.innerHTML = '';
      const text = document.createElement('span');text.textContent = current?.textContent || '';
      const caret = document.createElement('span');caret.className = 'mw-select-caret';caret.setAttribute('aria-hidden', 'true');caret.textContent = '▾';
      trigger.append(text, caret);
      trigger.setAttribute('aria-label', `${list.getAttribute('aria-label') || ''}: ${current?.textContent || ''}`);
      choices.forEach(option => { option.textContent = option.source.textContent;option.setAttribute('aria-selected', String(option.dataset.value === select.value)); });
    };
    const open = (last = false) => {
      closeAll();sync();list.hidden = false;trigger.setAttribute('aria-expanded', 'true');
      // Inside a sheet, open upward when the sheet edge leaves too little room below.
      const box = wrapper.getBoundingClientRect(), bound = (wrapper.closest('.sheet') || document.documentElement).getBoundingClientRect();
      const below = Math.min(bound.bottom, innerHeight) - box.bottom, above = box.top - Math.max(bound.top, 0), up = below < Math.min(list.scrollHeight, 320) + 12 && above > below;
      list.classList.toggle('open-up', up);list.style.setProperty('--mw-popover-room', `${Math.max(120, (up ? above : below) - 14)}px`);
      const selected = choices.find(option => option.getAttribute('aria-selected') === 'true');
      const target = last ? choices.at(-1) : selected || choices[0];
      target.focus({ preventScroll: true });
      list.scrollTop = target.offsetTop - (list.clientHeight - target.offsetHeight) / 2;
      list.scrollIntoView({ block: 'nearest' });
    };
    trigger.onclick = event => { event.preventDefault();list.hidden ? open() : close(); };
    wrapper.onkeydown = event => {
      const index = choices.indexOf(document.activeElement);
      if (event.key === 'Escape' && !list.hidden) { event.preventDefault();event.stopPropagation();close();trigger.focus({ preventScroll: true }); }
      else if (event.key === 'Tab') close();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) open(event.key === 'End');
        else choices[event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length].focus({ preventScroll: true });
      }
    };
    wrapper.addEventListener('focusout', event => { if (!wrapper.contains(event.relatedTarget)) close(); });
    select.addEventListener('change', sync);
    // Option labels are translated after start-up and the theme can change from another tab, so re-read them.
    new MutationObserver(sync).observe(select, { subtree: true, childList: true, characterData: true });
    menus.push({ close, wrapper, sync });sync();
  } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });else enhance();
  new MutationObserver(() => menus.forEach(menu => menu.sync())).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-mw-appearance'] });
  document.addEventListener('pointerdown', event => { menus.forEach(menu => { if (!menu.wrapper.contains(event.target)) menu.close(); }); });
  for (const event of ['pagehide', 'hashchange', 'popstate', 'resize']) window.addEventListener(event, closeAll);
})();
