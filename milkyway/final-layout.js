// Final layout pass: the GO LIVE meteor and a search & chat box in the header, a clean My Account (Balance plus a Gallery + Log out footer, other tools in the Menu drawer), unread badge pops,
// lazy-loaded media and comment previews that open inline.
(() => {
  const byId = identity => document.getElementById(identity);
  const indexes = { en: 0, sw: 1, fr: 2, zh: 3, ar: 4, pt: 5, hi: 6, de: 7 };
  const words = {
    gallery: ['Gallery', 'Gallery', 'Galerie', '相册', 'المعرض', 'Galeria', 'गैलरी', 'Galerie'],
    logout: ['Log out', 'Toka', 'Se déconnecter', '退出登录', 'تسجيل الخروج', 'Sair', 'लॉग आउट', 'Abmelden'],
    account: ['Account', 'Akaunti', 'Compte', '账户', 'الحساب', 'Conta', 'खाता', 'Konto'],
    anotherAccount: ['Sign up another account', 'Jisajili akaunti nyingine', 'Créer un autre compte', '注册另一个账户', 'إنشاء حساب آخر', 'Criar outra conta', 'दूसरा खाता बनाएँ', 'Weiteres Konto erstellen'],
    searchChat: ['Search or chat…', 'Tafuta au piga gumzo…', 'Rechercher ou discuter…', '搜索或聊天…', 'ابحث أو دردش…', 'Pesquisar ou conversar…', 'खोजें या चैट करें…', 'Suchen oder chatten…'],
    clear: ['Clear', 'Futa', 'Effacer', '清除', 'مسح', 'Limpar', 'साफ़ करें', 'Löschen'],
    inChats: ['Search your chats for', 'Tafuta kwenye gumzo zako', 'Chercher dans vos discussions', '在聊天中搜索', 'ابحث في محادثاتك عن', 'Pesquisar nas conversas', 'अपनी चैट में खोजें', 'In deinen Chats suchen nach'],
    people: ['People', 'Watu', 'Personnes', '用户', 'الأشخاص', 'Pessoas', 'लोग', 'Personen'],
    posts: ['Posts', 'Posts', 'Publications', '帖子', 'المنشورات', 'Publicações', 'पोस्ट', 'Beiträge'],
    chat: ['Chat', 'Ongea', 'Discuter', '聊天', 'دردشة', 'Conversar', 'चैट', 'Chatten'],
    allResults: ['See all results', 'Ona matokeo yote', 'Voir tous les résultats', '查看全部结果', 'عرض كل النتائج', 'Ver todos os resultados', 'सभी परिणाम देखें', 'Alle Ergebnisse'],
    searching: ['Searching…', 'Inatafuta…', 'Recherche…', '搜索中…', 'جارٍ البحث…', 'A pesquisar…', 'खोज रहे हैं…', 'Suche…'],
    nothing: ['No people or posts found.', 'Hakuna watu wala posts.', 'Aucun résultat.', '未找到用户或帖子。', 'لا توجد نتائج.', 'Nenhum resultado.', 'कोई परिणाम नहीं मिला।', 'Keine Ergebnisse.'],
    goLive: ['Go Live', 'Anza Live', 'Passer en direct', '开始直播', 'ابدأ البث', 'Entrar ao vivo', 'लाइव जाएँ', 'Live gehen']
  };
  const T = key => words[key][indexes[window.MilkyWayI18n?.language?.() || document.documentElement.lang || 'sw'] ?? 1] || words[key][0];
  const svg = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  const icons = {
    gallery: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
    logout: '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
    addAccount: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.5a6.5 6.5 0 0 1 12.2-3.1M18.5 13.5v6M15.5 16.5h6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>'
  };

  // GO LIVE (globe plus its spinning text ring) leaves its floating spot and joins the header, next to the language selector in the top-right corner.
  function placeHeaderControls() {
    const actions = document.querySelector('.top .top-actions'), live = byId('composeBtn');
    if (!actions || !live) return;
    if (live.parentElement !== actions) actions.append(live);
    const language = document.querySelector('.mw-header-language');
    if (language && language.parentElement !== actions) actions.append(language);
  }

  // Toolbar search & chat box: type straight into the header to find people (open their profile or start a chat),
  // posts, or your own chats. Enter opens the full search sheet; Escape or a tap elsewhere closes the results.
  function buildTopSearch() {
    const header = document.querySelector('header.top'), brand = header?.querySelector('.brand');
    if (!header || byId('mwTopSearch')) return;
    const form = document.createElement('form');
    form.className = 'mw-top-search';form.id = 'mwTopSearch';form.setAttribute('role', 'search');form.noValidate = true;
    form.innerHTML = `<label class="mw-top-search-box">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>')}<input id="mwTopSearchInput" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false"><button type="button" class="mw-top-search-clear" hidden>${svg('<path d="m7 7 10 10M17 7 7 17"/>')}</button></label><div class="mw-top-search-panel" id="mwTopSearchPanel" role="listbox" hidden></div>`;
    brand ? brand.after(form) : header.prepend(form);
    const input = form.querySelector('input'), clear = form.querySelector('.mw-top-search-clear'), panel = form.querySelector('.mw-top-search-panel');
    const html = value => typeof esc === 'function' ? esc(value) : String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
    let timer = null, ticket = 0;
    const close = () => { panel.hidden = true; };
    const reset = () => { input.value = '';clear.hidden = true;panel.replaceChildren();close();ticket++; };
    const row = (className, inner, onPick) => {
      const button = document.createElement('button');
      button.type = 'button';button.className = `mw-top-search-row ${className}`;button.setAttribute('role', 'option');button.innerHTML = inner;
      button.onclick = event => { event.preventDefault();onPick(event);reset();input.blur(); };
      return button;
    };
    const heading = key => Object.assign(document.createElement('h3'), { className: 'mw-top-search-heading', textContent: T(key) });
    // Chats: the Messages screen opens with the same words in its chat search, which filters chats, people and phone numbers.
    function searchChats(query) {
      if (typeof requireLogin === 'function' && !requireLogin('')) return;
      document.querySelector('.orb[data-tab="messages"]')?.click();
      const chats = byId('dmPeopleSearch');
      if (chats) setTimeout(() => { chats.value = query;chats.dispatchEvent(new Event('input', { bubbles: true })); }, 60);
    }
    function openPost(id) {
      if (location.hash === `#post-${id}` && typeof openPostFromHash === 'function') openPostFromHash();else location.hash = `post-${id}`;
    }
    async function run(query) {
      const mine = ++ticket;
      panel.hidden = false;
      const chatRow = row('mw-top-search-chats', `<span class="mw-top-search-icon">${svg('<path d="M20 12.5A8 8 0 1 1 8.6 5.3"/><path d="M4.2 20.4 5.3 16"/>')}</span><span>${html(T('inChats'))} <b>“${html(query)}”</b></span>`, () => searchChats(query));
      panel.replaceChildren(chatRow, Object.assign(document.createElement('p'), { className: 'mw-top-search-note', textContent: T('searching') }));
      if (typeof sb === 'undefined') return;
      const term = query.replace(/[%_,()*]/g, ' ').trim();
      const [people, posts] = await Promise.all([
        sb.from('mw_profiles').select('id,display_name,username,avatar_url').or(`display_name.ilike.%${term}%,username.ilike.%${term}%`).limit(6),
        sb.from('mw_posts').select('id,author_id,caption,created_at').ilike('caption', `%${term}%`).order('created_at', { ascending: false }).limit(8)
      ]).catch(() => [{}, {}]);
      // "Only me" and "Followers only" posts stay hidden from anyone who may not see them.
      const shown = window.MilkyWayGallery?.visible ? await window.MilkyWayGallery.visible(posts?.data || []) : (posts?.data || []);
      if (mine !== ticket) return;
      const rows = [chatRow];
      if (people?.data?.length) {
        rows.push(heading('people'));
        for (const person of people.data) {
          const name = person.display_name || person.username || 'MilkyWay';
          const face = person.avatar_url ? `<img loading="lazy" decoding="async" src="${html(window.MilkyWayMedia?.image ? window.MilkyWayMedia.image(person.avatar_url, 96) : person.avatar_url)}" alt="">` : html(name.trim().charAt(0).toUpperCase());
          const item = row('mw-top-search-person', `<span class="mw-top-search-avatar">${face}</span><span class="mw-top-search-text"><b>${html(name)}</b><small>@${html(person.username || 'msafiri')}</small></span>`, () => { if (typeof openPublicProfile === 'function') openPublicProfile(person.id); });
          if (person.id !== (typeof user !== 'undefined' ? user?.id : null)) {
            const chat = document.createElement('span');
            chat.className = 'mw-top-search-chat';chat.setAttribute('role', 'button');chat.tabIndex = 0;chat.textContent = T('chat');chat.setAttribute('aria-label', `${T('chat')}: ${name}`);
            const start = event => { event.preventDefault();event.stopPropagation();reset();input.blur();if (typeof openThread === 'function') openThread(person.id, name); };
            chat.onclick = start;chat.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') start(event); };
            item.append(chat);
          }
          rows.push(item);
        }
      }
      if (shown.length) {
        rows.push(heading('posts'));
        for (const post of shown.slice(0, 5)) rows.push(row('mw-top-search-post', `<span class="mw-top-search-text"><b>${html((post.caption || 'Post').slice(0, 110))}</b><small>${html(typeof ago === 'function' ? ago(post.created_at) : '')}</small></span>`, () => openPost(post.id)));
      }
      if (!people?.data?.length && !shown.length) rows.push(Object.assign(document.createElement('p'), { className: 'mw-top-search-note', textContent: T('nothing') }));
      else rows.push(row('mw-top-search-all', html(T('allResults')), () => openFullSearch(query)));
      panel.replaceChildren(...rows);
    }
    function openFullSearch(query) {
      const field = byId('peopleSearch');
      if (field) field.value = query;
      if (typeof openSheet === 'function') openSheet('searchSheet');
      if (typeof peopleSearch === 'function') peopleSearch(query);
    }
    input.addEventListener('input', () => {
      const query = input.value.trim();
      clear.hidden = !input.value;
      clearTimeout(timer);
      if (query.length < 2) { ticket++;panel.replaceChildren();close();return; }
      timer = setTimeout(() => run(query), 250);
    });
    input.addEventListener('focus', () => { if (panel.childElementCount) panel.hidden = false; });
    input.addEventListener('keydown', event => { if (event.key === 'Escape') { close();input.blur(); } });
    form.addEventListener('submit', event => { event.preventDefault();const query = input.value.trim();if (!query) return;close();input.blur();openFullSearch(query); });
    clear.onclick = () => { reset();input.focus({ preventScroll: true }); };
    document.addEventListener('pointerdown', event => { if (!form.contains(event.target)) close(); });
  }

  // The meteor's crash: a second shockwave and a burst of burning debris join the sparks already in the GO LIVE ring.
  function igniteMeteor() {
    const impact = document.querySelector('#composeBtn .mw-live-impact');
    if (!impact || impact.querySelector('.mw-live-debris')) return;
    const ns = 'http://www.w3.org/2000/svg', colours = ['#fff6c4', '#ffd23f', '#ff9a1f', '#ff5a00', '#ff2a00'];
    const outer = document.createElementNS(ns, 'circle');
    outer.setAttribute('class', 'mw-live-shock-outer');outer.setAttribute('cx', '60');outer.setAttribute('cy', '9');outer.setAttribute('r', '9');
    impact.prepend(outer);
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2 + (index % 2 ? .2 : 0), distance = 22 + (index * 7) % 20;
      const ember = document.createElementNS(ns, 'circle');
      ember.setAttribute('class', 'mw-live-debris');ember.setAttribute('cx', '60');ember.setAttribute('cy', '9');ember.setAttribute('r', String(index % 3 ? 1.6 : 2.3));
      ember.setAttribute('fill', colours[index % colours.length]);
      ember.style.setProperty('--x', `${(Math.cos(angle) * distance).toFixed(1)}px`);
      // Debris thrown downwards falls further, as if pulled back towards the globe.
      ember.style.setProperty('--y', `${(Math.sin(angle) * distance * (Math.sin(angle) > 0 ? 1.3 : 1)).toFixed(1)}px`);
      impact.append(ember);
    }
  }

  // My Account keeps only the header, the Balance asset card and the footer (Gallery + Log out); every other tool (activity, offline videos,
  // QR code, Gallery, Studio, another account, settings) lives in the Menu drawer, which the account hub builds.
  function tidyAccount() {
    const box = byId('loggedBox'), drawer = byId('mwFinalMenuTools'), footer = box?.querySelector('.mwx-account-actions'), another = byId('newAccountBtn'), logout = byId('logoutBtn');
    if (!box || !drawer || !footer || !logout) return false;
    if (another && !drawer.contains(another)) {
      const section = document.createElement('section');
      section.innerHTML = `<h3 data-mw-final="account"></h3>`;
      another.className = 'mwx-menu-item';
      another.innerHTML = `<span class="mwx-menu-icon">${svg(icons.addAccount)}</span><span class="mwx-menu-label" data-mw-final="anotherAccount"></span><span class="mwx-chevron">${svg(icons.chevron)}</span>`;
      section.append(another);
      drawer.insertBefore(section, drawer.lastElementChild);
    }
    if (!byId('mwFinalGalleryBtn')) {
      const gallery = document.createElement('button');gallery.type = 'button';gallery.className = 'btn ghost';gallery.id = 'mwFinalGalleryBtn';
      gallery.innerHTML = `${svg(icons.gallery)}<span data-mw-final="gallery"></span>`;
      gallery.onclick = openGallery;
      footer.prepend(gallery);
      logout.innerHTML = `${svg(icons.logout)}<span data-mw-final="logout"></span>`;
    }
    // Gallery is also a regular entry in the drawer's personal tools list.
    if (!byId('mwFinalGalleryItem')) {
      const tools = drawer.querySelector('[data-hub="activity"]')?.closest('section') || drawer.firstElementChild;
      tools?.insertAdjacentHTML('beforeend', `<button type="button" class="mwx-menu-item" id="mwFinalGalleryItem"><span class="mwx-menu-icon">${svg(icons.gallery)}</span><span class="mwx-menu-label" data-mw-final="gallery"></span><span class="mwx-chevron">${svg(icons.chevron)}</span></button>`);
      const item = byId('mwFinalGalleryItem');if (item) item.onclick = openGallery;
    }
    // The footer holds only Gallery and Log out.
    for (const extra of [...footer.children]) if (extra !== logout && extra.id !== 'mwFinalGalleryBtn') extra.remove();
    paint();
    return true;
  }
  async function openGallery() {
    closeSheet('authModal');
    await openProfile();
    const host = byId('mwProfileGallery');
    if (host) setTimeout(() => host.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' }), 120);
  }
  function paint() {
    document.querySelectorAll('[data-mw-final]').forEach(element => { const value = T(element.dataset.mwFinal);if (element.textContent !== value) element.textContent = value; });
    const live = byId('composeBtn');
    if (live) { live.setAttribute('aria-label', T('goLive'));live.title = T('goLive'); }
    const gallery = byId('mwFinalGalleryBtn');if (gallery) gallery.setAttribute('aria-label', T('gallery'));
    const search = byId('mwTopSearchInput');
    if (search) { search.placeholder = T('searchChat');search.setAttribute('aria-label', T('searchChat'));search.form.querySelector('.mw-top-search-clear').setAttribute('aria-label', T('clear')); }
  }

  function start() {
    placeHeaderControls();
    buildTopSearch();
    igniteMeteor();
    watchBadges();
    paint();
    // Re-check the account panel every time it opens, in case it was built after the first checks.
    if (typeof openAuth === 'function' && !openAuth.mwFinalWrapped) {
      const original = openAuth;
      openAuth = (...args) => { const result = original(...args);tidyAccount();return result; };
      openAuth.mwFinalWrapped = true;
    }
    // The account hub builds its menu after sign-in data loads, so retry briefly until it exists.
    let tries = 0;
    const wait = () => { if (!tidyAccount() && tries++ < 40) setTimeout(wait, 250); };
    wait();
  }
  // Unread badges on Messages and Alerts pop whenever their count changes.
  function watchBadges() {
    for (const id of ['msgUnreadBadge', 'bottomNotifyBadge']) {
      const badge = byId(id);
      if (!badge || badge.mwFinalWatched) continue;
      badge.mwFinalWatched = true;
      let last = badge.textContent;
      new MutationObserver(() => {
        if (badge.textContent === last) return;
        last = badge.textContent;
        badge.classList.remove('mw-badge-pop');void badge.offsetWidth;badge.classList.add('mw-badge-pop');
      }).observe(badge, { childList: true, characterData: true, subtree: true });
    }
  }

  // Lazy media: images below the fold load only when they come near the screen, and videos fetch nothing until
  // they are close, so long feeds stay fast on phones and use less data.
  const nearScreen = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target;
      nearScreen.unobserve(video);
      if (video.preload === 'none') video.preload = 'metadata';
    }
  }, { rootMargin: '700px 0px' }) : null;
  function lazyMedia(root) {
    root.querySelectorAll?.('img:not([data-mw-lazy])').forEach(image => {
      image.dataset.mwLazy = '';
      if (image.closest('.top,.orbit,#composeBtn')) return;
      if (!image.hasAttribute('loading')) image.loading = 'lazy';
      if (!image.hasAttribute('decoding')) image.decoding = 'async';
    });
    root.querySelectorAll?.('video:not([data-mw-lazy])').forEach(video => {
      video.dataset.mwLazy = '';
      if (!nearScreen || video.closest('.mw-live-page,.wa-chat,.mw-call,[data-mw-call]') || video.srcObject || video.autoplay) return;
      if (video.readyState === 0 && video.preload !== 'none') {
        const box = video.getBoundingClientRect();
        if (box.top > innerHeight + 700 || box.bottom < -700) video.preload = 'none';
      }
      if (video.preload === 'none') nearScreen.observe(video);
    });
  }
  new MutationObserver(records => { for (const record of records) for (const added of record.addedNodes) if (added.nodeType === 1) lazyMedia(added.matches?.('img,video') ? added.parentNode || added : added); })
    .observe(document.documentElement, { childList: true, subtree: true });
  lazyMedia(document);

  // Tapping a comment preview line under a post opens the full thread inline, like the Comments button.
  document.addEventListener('click', event => {
    const line = event.target.closest('#feed .post>.post-echo-preview .post-echo-line');
    const postId = line?.closest('.post')?.id.replace(/^post-/, '');
    if (postId) window.MilkyWayEngage?.openComments(postId);
  });
  window.addEventListener('mw-language-change', paint);
  // Tidy My Account as soon as the account hub has built it, so the old tools never flash in the profile.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tidyAccount);else tidyAccount();
  if (document.readyState === 'complete') start();else window.addEventListener('load', start);
})();
