(() => {
  // Multi-guest Live layouts: one geometry engine shared by the layout picker, its previews and the live stage.
  const order = ['en', 'sw', 'fr', 'zh', 'ar', 'pt', 'hi', 'de'];
  const copy = {
    title: ['Multi-guest layout', 'Mpangilio wa wageni wengi', 'Disposition multi-invités', '多人连线布局', 'تخطيط الضيوف المتعددين', 'Layout com vários convidados', 'मल्टी-गेस्ट लेआउट', 'Mehrgast-Layout'],
    help: ['Choose how you and your guests appear on screen.', 'Chagua jinsi wewe na wageni wako mnavyoonekana kwenye skrini.', 'Choisissez comment vous et vos invités apparaissez à l’écran.', '选择你和嘉宾在屏幕上的显示方式。', 'اختر كيف تظهر أنت وضيوفك على الشاشة.', 'Escolha como você e seus convidados aparecem na tela.', 'चुनें कि आप और आपके मेहमान स्क्रीन पर कैसे दिखें।', 'Wähle, wie du und deine Gäste auf dem Bildschirm erscheinen.'],
    layout: ['Layout', 'Mpangilio', 'Disposition', '布局', 'التخطيط', 'Layout', 'लेआउट', 'Layout'],
    seats: ['Guest seats', 'Viti vya wageni', 'Places invités', '嘉宾席位', 'مقاعد الضيوف', 'Lugares de convidados', 'मेहमान सीटें', 'Gastplätze'],
    hostPosition: ['Host position', 'Nafasi ya mwenyeji', 'Position de l’hôte', '主播位置', 'موضع المضيف', 'Posição do anfitrião', 'होस्ट की जगह', 'Host-Position'],
    hostFirst: ['First', 'Kwanza', 'En premier', '在前', 'أولًا', 'Primeiro', 'पहले', 'Zuerst'],
    hostLast: ['Last', 'Mwisho', 'En dernier', '在后', 'أخيرًا', 'Por último', 'आखिर में', 'Zuletzt'],
    preview: ['Preview', 'Onyesho', 'Aperçu', '预览', 'معاينة', 'Prévia', 'पूर्वावलोकन', 'Vorschau'],
    host: ['Host', 'Mwenyeji', 'Hôte', '主播', 'المضيف', 'Anfitrião', 'होस्ट', 'Host'],
    apply: ['Apply layout', 'Tumia mpangilio', 'Appliquer', '应用布局', 'تطبيق التخطيط', 'Aplicar layout', 'लेआउट लागू करें', 'Layout anwenden'],
    cancel: ['Cancel', 'Ghairi', 'Annuler', '取消', 'إلغاء', 'Cancelar', 'रद्द करें', 'Abbrechen'],
    close: ['Close', 'Funga', 'Fermer', '关闭', 'إغلاق', 'Fechar', 'बंद करें', 'Schließen'],
    one: ['guest', 'mgeni', 'invité', '位嘉宾', 'ضيف', 'convidado', 'मेहमान', 'Gast'],
    many: ['guests', 'wageni', 'invités', '位嘉宾', 'ضيوف', 'convidados', 'मेहमान', 'Gäste'],
    locked: ['Side by side always has one guest seat.', 'Bega kwa bega huwa na kiti kimoja cha mgeni.', 'Côte à côte a toujours une place invité.', '并排布局固定为一个嘉宾席位。', 'جنبًا إلى جنب يتضمن دائمًا مقعد ضيف واحد.', 'Lado a lado sempre tem um lugar de convidado.', 'साथ-साथ में हमेशा एक मेहमान सीट होती है।', 'Nebeneinander hat immer einen Gastplatz.'],
    foot: ['You can change the layout anytime during the Live.', 'Unaweza kubadilisha mpangilio wakati wowote wa Live.', 'Modifiable à tout moment pendant le direct.', '直播中可随时更改布局。', 'يمكنك تغيير التخطيط في أي وقت أثناء البث.', 'Você pode mudar o layout a qualquer momento da Live.', 'लाइव के दौरान कभी भी लेआउट बदल सकते हैं।', 'Das Layout lässt sich während des Live jederzeit ändern.'],
  };
  const styles = {
    fullscreen: {
      name: ['Full screen', 'Skrini nzima', 'Plein écran', '全屏', 'ملء الشاشة', 'Tela cheia', 'फ़ुल स्क्रीन', 'Vollbild'],
      text: ['Host fills the screen, guests float at the side', 'Mwenyeji anajaza skrini, wageni wanaelea pembeni', 'L’hôte en plein écran, invités sur le côté', '主播全屏，嘉宾悬浮在侧边', 'المضيف يملأ الشاشة والضيوف على الجانب', 'Anfitrião em tela cheia, convidados ao lado', 'होस्ट पूरी स्क्रीन पर, मेहमान किनारे पर', 'Host im Vollbild, Gäste schweben am Rand'],
    },
    'fluid-panel': {
      name: ['Fluid panel', 'Paneli inayobadilika', 'Panneau fluide', '流式面板', 'لوحة مرنة', 'Painel fluido', 'फ़्लूइड पैनल', 'Flexibles Panel'],
      text: ['Large host view with a guest panel that grows', 'Mwenyeji mkubwa na paneli ya wageni inayokua', 'Grand hôte et panneau d’invités qui s’agrandit', '主播大画面，嘉宾面板随人数变化', 'عرض كبير للمضيف ولوحة ضيوف تتوسع', 'Anfitrião grande com painel de convidados que cresce', 'बड़ा होस्ट दृश्य और बढ़ता मेहमान पैनल', 'Großer Host mit mitwachsendem Gästepanel'],
    },
    'fluid-grid': {
      name: ['Fluid grid', 'Gridi inayobadilika', 'Grille fluide', '流式网格', 'شبكة مرنة', 'Grade fluida', 'फ़्लूइड ग्रिड', 'Flexibles Raster'],
      text: ['Equal tiles that resize as people join', 'Visanduku sawa vinavyobadilika watu wakijiunga', 'Tuiles égales qui s’adaptent aux arrivées', '等大画面，随人数自动调整', 'مربعات متساوية تتغير مع انضمام الأشخاص', 'Blocos iguais que se ajustam quando entram pessoas', 'बराबर टाइलें जो लोगों के जुड़ने पर बदलती हैं', 'Gleiche Kacheln, die sich beim Beitreten anpassen'],
    },
    'fixed-grid': {
      name: ['Fixed grid', 'Gridi thabiti', 'Grille fixe', '固定网格', 'شبكة ثابتة', 'Grade fixa', 'फ़िक्स्ड ग्रिड', 'Festes Raster'],
      text: ['Every seat shown in a steady grid', 'Kila kiti kinaonekana kwenye gridi thabiti', 'Toutes les places dans une grille stable', '所有席位以固定网格显示', 'كل المقاعد في شبكة ثابتة', 'Todos os lugares numa grade estável', 'हर सीट एक स्थिर ग्रिड में', 'Alle Plätze in einem festen Raster'],
    },
    'side-by-side': {
      name: ['Side by side', 'Bega kwa bega', 'Côte à côte', '并排', 'جنبًا إلى جنب', 'Lado a lado', 'साथ-साथ', 'Nebeneinander'],
      text: ['You and one guest, split evenly', 'Wewe na mgeni mmoja, nusu kwa nusu', 'Vous et un invité, à parts égales', '你和一位嘉宾平分画面', 'أنت وضيف واحد بالتساوي', 'Você e um convidado, divididos igualmente', 'आप और एक मेहमान, बराबर हिस्सों में', 'Du und ein Gast, gleich aufgeteilt'],
    },
    spotlight: {
      name: ['Spotlight', 'Mwangaza', 'Projecteur', '聚光', 'تسليط الضوء', 'Destaque', 'स्पॉटलाइट', 'Rampenlicht'],
      text: ['One featured speaker, everyone else below', 'Mzungumzaji mmoja mkuu, wengine chini', 'Un orateur à la une, les autres en dessous', '突出一位发言者，其他人在下方', 'متحدث مميز واحد والبقية في الأسفل', 'Um orador em destaque, os demais abaixo', 'एक मुख्य वक्ता, बाकी सब नीचे', 'Eine Person im Fokus, alle anderen darunter'],
    },
    roundtable: {
      name: ['Roundtable', 'Meza ya duara', 'Table ronde', '圆桌', 'طاولة مستديرة', 'Mesa-redonda', 'गोलमेज़', 'Runder Tisch'],
      text: ['Host in the centre, guests in a circle', 'Mwenyeji katikati, wageni kwenye duara', 'L’hôte au centre, invités en cercle', '主播居中，嘉宾环绕', 'المضيف في المنتصف والضيوف في دائرة', 'Anfitrião no centro, convidados em círculo', 'बीच में होस्ट, घेरे में मेहमान', 'Host in der Mitte, Gäste im Kreis'],
    },
  };
  const names = Object.keys(styles);
  const legacy = { 'host-top': 'fullscreen', 'host-side': 'fluid-panel', duo: 'side-by-side', grid: 'fixed-grid', focus: 'spotlight' };
  const normalize = value => styles[value] ? value : legacy[value] || 'fullscreen';
  const pairOnly = value => normalize(value) === 'side-by-side';
  const language = () => { try { return window.MilkyWayI18n?.language?.() || localStorage.getItem('mw_lang') || 'sw'; } catch { return 'sw'; } };
  const pick = row => row[Math.max(0, order.indexOf(language()))] || row[0];
  const say = key => pick(copy[key]);
  const styleName = value => pick(styles[normalize(value)].name);
  const guests = count => `${count} ${say(Number(count) === 1 ? 'one' : 'many')}`;

  // Geometry. Every function returns one rectangle per tile; index 0 is the host unless a featured index is given.
  const GAP = 6;
  function gridSlots(n, W, H, cols, fill) {
    const rows = Math.ceil(n / cols), w = (W - GAP * (cols - 1)) / cols;
    let h = (H - GAP * (rows - 1)) / rows;
    if (!fill) h = Math.min(h, w * 4 / 3);
    const top = Math.max(0, (H - rows * h - GAP * (rows - 1)) / 2), slots = [];
    for (let index = 0; index < n; index++) {
      const row = Math.floor(index / cols), column = index % cols, inRow = row === rows - 1 ? n - row * cols : cols;
      let width = w, x = column * (w + GAP);
      if (inRow < cols && fill) { width = (W - GAP * (inRow - 1)) / inRow;x = column * (width + GAP); }
      else if (inRow < cols) x = (W - inRow * w - GAP * (inRow - 1)) / 2 + column * (w + GAP);
      slots.push({ x, y: top + row * (h + GAP), w: width, h });
    }
    return slots;
  }
  function fluidColumns(n, W, H) {
    const target = W < H ? .8 : 1.35;
    let best = 1, score = Infinity;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols), ratio = ((W - GAP * (cols - 1)) / cols) / ((H - GAP * (rows - 1)) / rows);
      const value = Math.abs(Math.log(ratio / target)) + (rows * cols - n) * .12;
      if (value < score) { score = value;best = cols; }
    }
    return best;
  }
  const fixedColumns = (n, W, H) => W > H * 1.2 ? Math.min(n, Math.ceil(Math.sqrt(n * 1.6))) : n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5;
  const transpose = rects => rects.map(rect => ({ ...rect, x: rect.y, y: rect.x, w: rect.h, h: rect.w }));
  function panel(n, W, H, flip) {
    if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
    if (W > H * 1.1) return transpose(panel(n, H, W, flip));
    const g = n - 1, cols = Math.min(g, 4), rows = Math.ceil(g / cols);
    const tileW = (W - GAP * (cols - 1)) / cols, tileH = Math.min(tileW * 1.15, (H * .42 - GAP * (rows - 1)) / rows);
    const panelH = rows * tileH + GAP * (rows - 1), hostH = H - panelH - GAP;
    const strip = gridSlots(g, W, panelH, cols, true).map(rect => ({ ...rect, y: rect.y + (flip ? 0 : hostH + GAP) }));
    return [{ x: 0, y: flip ? panelH + GAP : 0, w: W, h: hostH }, ...strip];
  }
  function spotlight(n, W, H, featured, flip) {
    if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
    const others = n - 1, cols = Math.min(others, 5), rows = Math.ceil(others / cols);
    const tileW = (W - GAP * (cols - 1)) / cols, tileH = Math.min(tileW, (H * .36 - GAP * (rows - 1)) / rows);
    const stripH = rows * tileH + GAP * (rows - 1), bigH = H - stripH - GAP;
    const strip = gridSlots(others, W, stripH, cols, false).map(rect => ({ ...rect, y: rect.y + (flip ? 0 : bigH + GAP) }));
    const big = { x: 0, y: flip ? stripH + GAP : 0, w: W, h: bigH, featured: true };
    const rects = [];
    for (let index = 0, next = 0; index < n; index++) rects.push(index === featured ? big : strip[next++]);
    return rects;
  }
  function roundtable(n, W, H, centre) {
    const m = Math.min(W, H);
    if (n <= 1) { const D = m * .6;return [{ x: (W - D) / 2, y: (H - D) / 2, w: D, h: D, round: true }]; }
    const g = n - 1;
    let d = m * .26, rx = 0, ry = 0;
    for (let pass = 0; pass < 3; pass++) { rx = W / 2 - d / 2;ry = H / 2 - d / 2;d = Math.min(m * .26, 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) / g * .84); }
    rx = W / 2 - d / 2;ry = H / 2 - d / 2;
    const D = Math.max(d, Math.min(m * .42, 2 * Math.min(rx, ry) - d - 2 * GAP));
    const rects = [];
    for (let index = 0, seat = 0; index < n; index++) {
      if (index === centre) { rects.push({ x: (W - D) / 2, y: (H - D) / 2, w: D, h: D, round: true, featured: true });continue; }
      const angle = -Math.PI / 2 + seat++ * 2 * Math.PI / g;
      rects.push({ x: W / 2 + rx * Math.cos(angle) - d / 2, y: H / 2 + ry * Math.sin(angle) - d / 2, w: d, h: d, round: true });
    }
    return rects;
  }
  function floating(n, W, H) {
    const d = Math.min(W * .2, (H * .7) / Math.max(4, n - 1)), rects = [{ x: 0, y: 0, w: W, h: H }];
    for (let index = 1; index < n; index++) rects.push({ x: W - d - GAP, y: H * .1 + (index - 1) * (d + GAP), w: d, h: d, round: true });
    return rects;
  }
  // count = host + visible guest tiles; featured = index of the spotlighted tile; hostPosition 'end' moves the host last.
  function compute(style, { count = 1, featured = 0, hostPosition = 'start', width, height }) {
    const n = Math.max(1, count), W = Math.max(1, width), H = Math.max(1, height), flip = hostPosition === 'end';
    const hostLast = slots => flip && slots.length > 1 ? [slots[slots.length - 1], ...slots.slice(0, -1)] : slots;
    switch (normalize(style)) {
      case 'fullscreen': return floating(n, W, H);
      case 'fluid-panel': return panel(n, W, H, flip);
      case 'fluid-grid': return hostLast(gridSlots(n, W, H, fluidColumns(n, W, H), true));
      case 'fixed-grid': return hostLast(gridSlots(n, W, H, fixedColumns(n, W, H), false));
      case 'side-by-side': {
        if (n !== 2) return hostLast(gridSlots(n, W, H, fluidColumns(n, W, H), true));
        const w = (W - GAP) / 2, h = Math.min(H, w * 4 / 3), y = (H - h) / 2;
        return hostLast([{ x: 0, y, w, h }, { x: w + GAP, y, w, h }]);
      }
      case 'spotlight': return spotlight(n, W, H, Math.min(n - 1, Math.max(0, featured)), flip);
      case 'roundtable': return roundtable(n, W, H, Math.min(n - 1, Math.max(0, featured)));
    }
    return floating(n, W, H);
  }
  // Fluid layouts collapse empty seats into a single "+" join tile; fixed ones keep every seat on screen.
  const showsEmptySeats = style => ['fixed-grid', 'roundtable', 'side-by-side'].includes(normalize(style));

  // Mini SVG drawings built from the real geometry so the picker always matches the stage.
  function drawing(style, guestsShown, hostPosition, W = 60, H = 84) {
    const rects = compute(style, { count: guestsShown + 1, hostPosition, width: W - 8, height: H - 8 });
    const tiles = rects.map((rect, index) => rect.round
      ? `<circle cx="${(rect.x + rect.w / 2 + 4).toFixed(1)}" cy="${(rect.y + rect.h / 2 + 4).toFixed(1)}" r="${(rect.w / 2).toFixed(1)}" class="${index ? 'g' : 'h'}"/>`
      : `<rect x="${(rect.x + 4).toFixed(1)}" y="${(rect.y + 4).toFixed(1)}" width="${Math.max(1, rect.w).toFixed(1)}" height="${Math.max(1, rect.h).toFixed(1)}" rx="${Math.min(5, rect.w / 5).toFixed(1)}" class="${index ? 'g' : 'h'}"/>`).join('');
    return `<svg class="mw-layout-art" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="9" class="f"/>${tiles}</svg>`;
  }

  // Remember the creator's preferred layout between Lives.
  const memory = (() => { try { return JSON.parse(localStorage.getItem('mw_live_layout') || '{}') || {}; } catch { return {}; } })();
  const setup = { style: normalize(memory.style || 'fullscreen'), hostPosition: memory.hostPosition === 'end' ? 'end' : 'start' };
  const remember = () => { try { localStorage.setItem('mw_live_layout', JSON.stringify(setup)); } catch {} };

  let overlay = null, returnFocus = null;
  function close() {
    if (!overlay) return;
    const node = overlay;overlay = null;
    node.classList.remove('is-open');node.classList.add('is-closing');
    document.documentElement.classList.remove('mw-seat-grid-open');document.removeEventListener('keydown', keys, true);
    setTimeout(() => node.remove(), 160);
    returnFocus?.focus?.({ preventScroll: true });returnFocus = null;
  }
  function keys(event) {
    if (!overlay) return;
    if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();close();return; }
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button:not([disabled])')];
      const index = focusable.indexOf(document.activeElement);
      event.preventDefault();focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
    }
    const group = document.activeElement?.closest?.('[role="radiogroup"]');
    let step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (document.dir === 'rtl' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) step = -step;
    if (group && step) {
      const items = [...group.querySelectorAll('[role="radio"]:not([disabled])')], index = items.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();const next = items[(index + step + items.length) % items.length];
      next.focus();next.click();
    }
  }
  // options: { style, seats, hostPosition, maxSeats, onApply({ style, seats, hostPosition }) }
  function open(options = {}) {
    if (overlay) return;
    returnFocus = document.activeElement;
    const state = { style: normalize(options.style), seats: Math.max(1, Math.min(20, Number(options.seats) || 2)), hostPosition: options.hostPosition === 'end' ? 'end' : 'start' };
    if (pairOnly(state.style)) state.seats = 1;
    let rememberedSeats = state.seats > 1 ? state.seats : 4;
    overlay = document.createElement('div');overlay.className = 'mw-dialog-bg mw-seat-grid-bg mw-layout-bg';
    overlay.innerHTML = `<div class="mw-dialog mw-layout-panel" role="dialog" aria-modal="true" aria-labelledby="mwLayoutTitle">
      <div class="mw-seat-grid-head"><div><h3 class="mw-dialog-title" id="mwLayoutTitle"></h3><p class="mw-dialog-text" data-copy="help"></p></div><button type="button" class="mw-seat-grid-close">×</button></div>
      <div class="mw-layout-scroll">
        <div class="mw-layout-preview"><div class="mw-layout-phone"><div class="mw-layout-phone-stage"></div></div><div class="mw-layout-preview-text"><small data-copy="preview"></small><b class="mw-layout-current"></b><span class="mw-layout-current-text"></span></div></div>
        <h4 class="mw-layout-label" id="mwLayoutStyles" data-copy="layout"></h4><div class="mw-layout-styles" role="radiogroup" aria-labelledby="mwLayoutStyles"></div>
        <h4 class="mw-layout-label" id="mwLayoutSeats" data-copy="seats"></h4><div class="mw-seat-grid mw-layout-seats" role="radiogroup" aria-labelledby="mwLayoutSeats"></div><p class="mw-layout-locked" data-copy="locked" hidden></p>
        <h4 class="mw-layout-label" id="mwLayoutHost" data-copy="hostPosition"></h4><div class="mw-layout-segment" role="radiogroup" aria-labelledby="mwLayoutHost"><button type="button" role="radio" data-host="start" data-copy="hostFirst"></button><button type="button" role="radio" data-host="end" data-copy="hostLast"></button></div>
        <p class="mw-seat-grid-foot" data-copy="foot"></p>
      </div>
      <div class="mw-dialog-actions"><button type="button" class="mw-dialog-btn" data-copy="cancel"></button><button type="button" class="mw-dialog-btn mw-dialog-accept" data-copy="apply"></button></div></div>`;
    overlay.querySelector('h3').textContent = say('title');
    overlay.querySelectorAll('[data-copy]').forEach(node => { node.textContent = say(node.dataset.copy); });
    const shut = overlay.querySelector('.mw-seat-grid-close');shut.setAttribute('aria-label', say('close'));shut.onclick = close;
    overlay.querySelector('[data-copy="cancel"]').onclick = close;
    overlay.querySelector('[data-copy="apply"]').onclick = () => {
      const result = { ...state };close();
      try { options.onApply?.(result); } catch (error) { console.error(error); }
    };
    const list = overlay.querySelector('.mw-layout-styles');
    for (const value of names) {
      const card = document.createElement('button');card.type = 'button';card.className = 'mw-layout-card';card.setAttribute('role', 'radio');card.dataset.style = value;
      card.innerHTML = `${drawing(value, value === 'side-by-side' ? 1 : 4, 'start')}<span><b></b><small></small></span>`;
      card.querySelector('b').textContent = pick(styles[value].name);card.querySelector('small').textContent = pick(styles[value].text);
      card.onclick = () => {
        if (state.style === value) return;
        if (pairOnly(value)) { if (state.seats > 1) rememberedSeats = state.seats;state.seats = 1; }
        else if (pairOnly(state.style)) state.seats = rememberedSeats;
        state.style = value;paint();
      };
      list.append(card);
    }
    const seatGrid = overlay.querySelector('.mw-layout-seats');
    const maxSeats = Math.max(1, Math.min(20, Number(options.maxSeats) || 20));
    for (let value = 1; value <= maxSeats; value++) {
      const card = document.createElement('button');card.type = 'button';card.className = 'mw-seat-card';card.setAttribute('role', 'radio');card.dataset.value = String(value);
      card.setAttribute('aria-label', guests(value));card.innerHTML = `<b>${value}</b>`;
      card.onclick = () => { state.seats = value;rememberedSeats = value;paint(); };
      seatGrid.append(card);
    }
    overlay.querySelectorAll('[data-host]').forEach(button => { button.onclick = () => { state.hostPosition = button.dataset.host;paint(); }; });
    const phone = overlay.querySelector('.mw-layout-phone-stage');
    function paint() {
      list.querySelectorAll('.mw-layout-card').forEach(card => { const on = card.dataset.style === state.style;card.setAttribute('aria-checked', String(on));card.tabIndex = on ? 0 : -1; });
      const locked = pairOnly(state.style);
      seatGrid.querySelectorAll('.mw-seat-card').forEach(card => { const on = Number(card.dataset.value) === state.seats;card.setAttribute('aria-checked', String(on));card.tabIndex = on ? 0 : -1;card.disabled = locked && !on; });
      overlay.querySelector('.mw-layout-locked').hidden = !locked;
      overlay.querySelectorAll('[data-host]').forEach(button => { const on = button.dataset.host === state.hostPosition;button.setAttribute('aria-checked', String(on));button.tabIndex = on ? 0 : -1; });
      overlay.querySelector('.mw-layout-current').textContent = `${styleName(state.style)} · ${guests(state.seats)}`;
      overlay.querySelector('.mw-layout-current-text').textContent = pick(styles[state.style].text);
      const rects = compute(state.style, { count: state.seats + 1, hostPosition: state.hostPosition, width: 86, height: 132 });
      phone.dataset.style = state.style;
      phone.replaceChildren(...rects.map((rect, index) => {
        const tile = document.createElement('span');tile.className = `mw-layout-tile${index ? '' : ' is-host'}${rect.round ? ' is-round' : ''}`;
        Object.assign(tile.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, '--i': String(index) });
        tile.textContent = index ? String(index) : say('host');
        return tile;
      }));
    }
    paint();
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.body.append(overlay);document.documentElement.classList.add('mw-seat-grid-open');
    document.addEventListener('keydown', keys, true);
    requestAnimationFrame(() => { overlay?.classList.add('is-open');list.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true }); });
  }

  // Compact trigger used on the Go LIVE form and in the in-Live settings panel.
  function paintTrigger(button, style, seats) {
    if (!button) return;
    button.innerHTML = `${drawing(style, pairOnly(style) ? 1 : Math.min(Number(seats) || 1, 6), 'start', 30, 42)}<span class="mw-layout-trigger-text"><b></b><small></small></span>`;
    button.querySelector('b').textContent = styleName(style);button.querySelector('small').textContent = guests(seats);
    button.setAttribute('aria-label', `${say('title')}: ${styleName(style)} · ${guests(seats)}`);
  }

  // Go LIVE form: the seat select stays as the source of truth for the room request, the trigger edits it.
  const select = document.getElementById('mwLiveSeatCount');
  if (select) {
    const trigger = document.createElement('button');trigger.type = 'button';trigger.id = 'mwLiveSeatCountTrigger';trigger.className = 'mw-layout-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    select.before(trigger);select.hidden = true;select.tabIndex = -1;select.classList.add('mw-language-native');
    const label = select.closest('label');
    if (label) { label.htmlFor = trigger.id;label.classList.add('mw-layout-field');const text = [...label.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());if (text) { const span = document.createElement('span');span.className = 'mw-layout-field-label';text.replaceWith(span); } }
    if (pairOnly(setup.style)) select.value = '1';
    const sync = () => { const span = label?.querySelector('.mw-layout-field-label');if (span) span.textContent = say('title');paintTrigger(trigger, setup.style, select.value); };
    trigger.addEventListener('click', event => {
      event.preventDefault();
      open({ style: setup.style, seats: select.value, hostPosition: setup.hostPosition, onApply: result => {
        setup.style = result.style;setup.hostPosition = result.hostPosition;remember();
        if (select.value !== String(result.seats)) { select.value = String(result.seats);select.dispatchEvent(new Event('change', { bubbles: true })); }
        sync();window.dispatchEvent(new CustomEvent('mw-live-layout-change'));
      } });
    });
    select.addEventListener('change', sync);
    window.addEventListener('mw-language-change', sync);
    sync();
  }
  for (const event of ['pagehide', 'popstate', 'hashchange']) window.addEventListener(event, () => { returnFocus = null;close(); });

  window.MilkyWayLiveLayouts = { names, normalize, pairOnly, compute, showsEmptySeats, open, close, paintTrigger, styleName, say, setup: () => ({ ...setup, seats: Number(select?.value) || 2 }), configure: () => document.getElementById('mwLiveSeatCountTrigger')?.click() };
  window.MilkyWaySeatGrid = { open: () => document.getElementById('mwLiveSeatCountTrigger')?.click(), close };
})();
