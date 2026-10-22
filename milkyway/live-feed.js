(() => {
  const byId = identity => document.getElementById(identity);
  const tokenEndpoint = '/.netlify/functions/milkyway-livekit-token';
  const encoder = new TextEncoder();
  const icons = {
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    camera: '<rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/>',
    crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/><path d="M5 19h14"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    volume: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    share: '<path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/>',
    settings: '<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>',
    leave: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h13"/>',
    send: '<path d="m22 2-7 20-4-9-9-4L22 2Zm0 0L11 13"/>',
    people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
    alienJoin: '<path d="M12 3c-5 0-8 4-7 9 1 5 5 9 7 9s6-4 7-9c1-5-2-9-7-9Z"/><path d="m7 10 4 3-3 1-1-4Zm10 0-4 3 3 1 1-4ZM10 17h4M5 5 3 3m16 2 2-2"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.2a7 7 0 0 1-5.5-2.7L3 16.4a1.6 1.6 0 0 1 2.5-2L8 17"/>',
    chevronLeft: '<path d="m15 5-7 7 7 7"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    alienGuests: '<path d="M12 5c-5 0-8 3-8 7s5 9 8 9 8-5 8-9-3-7-8-7Z"/><path d="m7 11 3 2m7-2-3 2m-4 4h4M12 5V2m-7 6L3 6m16 2 2-2"/><circle cx="12" cy="2" r="1"/>'
  };
  let mode = null;
  let room = null;
  let host = false;
  let session = null;
  let generation = 0;
  let joining = false;
  let soundEnabled = false;
  let soundRequest = null;
  let discoveryBusy = false;
  let closing = null;
  let pendingEndSession = null;
  let previousFocus = null;
  let previousOverflow = '';
  let consumedHash = '';
  let pendingWatch = null;
  let liveRecords = [];
  let connectionAccountId = null;
  let connectionSession = null;
  let accessRequest = null;
  let previewTracks = [];
  let previewContext = null;
  let previewFrame = null;
  let previewGeneration = 0;
  let discoverySignature = '';
  let roomState = null;
  let roomPoll = null;
  let roomPolling = false;
  let roomChatSignature = '';
  let pendingComment = null;
  let previousLiveHosts = null;
  let historyGeneration = 0;
  let historyLoaded = false;
  let historyOffset = 0;
  let historyBusy = false;
  let displayedHistory = [];
  let serviceState = null;
  let serviceChecking = false;
  let serviceRequest = null;
  let lastServiceCheck = 0;
  let lastDiscoveryCheck = 0;
  // Live rooms (chat, viewers, guest requests) and the Live now list refresh every second.
  const syncInterval = 1000;
  let profileSignature = '';
  let discoveryProfiles = [];
  let participationBusy = false;
  let settingsBusy = false;
  let applyHostSettings = null;
  let announcementTimer = null;
  const conversationRoom = () => session?.room_name?.startsWith('mw-conversation-');
  const translate = key => window.MilkyWayI18n?.t(key) || key;
  // Labels for the viewer list, join-request slider and seat badges, in the app's eight languages.
  const stageLanguages = ['en', 'sw', 'fr', 'zh', 'ar', 'pt', 'hi', 'de'];
  const stageCopy = {
    watching: ['Watching now', 'Wanaotazama sasa', 'Regardent maintenant', '正在观看', 'يشاهدون الآن', 'Assistindo agora', 'अभी देख रहे हैं', 'Schauen gerade zu'],
    viewerCount: ['viewers', 'watazamaji', 'spectateurs', '位观众', 'مشاهدين', 'espectadores', 'दर्शक', 'Zuschauer'],
    host: ['Host', 'Mwenyeji', 'Hôte', '主播', 'المضيف', 'Anfitrião', 'होस्ट', 'Host'],
    guest: ['Guest', 'Mgeni', 'Invité', '嘉宾', 'ضيف', 'Convidado', 'मेहमान', 'Gast'],
    viewer: ['Viewer', 'Mtazamaji', 'Spectateur', '观众', 'مشاهد', 'Espectador', 'दर्शक', 'Zuschauer'],
    you: ['You', 'Wewe', 'Vous', '你', 'أنت', 'Você', 'आप', 'Du'],
    requested: ['Requested to join', 'Ameomba kujiunga', 'Demande à rejoindre', '申请连线', 'طلب الانضمام', 'Pediu para entrar', 'जुड़ने का अनुरोध', 'Möchte beitreten'],
    noViewers: ['No one else is here yet.', 'Bado hakuna mwingine hapa.', 'Personne d’autre pour l’instant.', '暂时没有其他人。', 'لا يوجد أحد آخر بعد.', 'Ainda não há mais ninguém.', 'अभी कोई और नहीं है।', 'Noch niemand sonst hier.'],
    requests: ['Join requests', 'Maombi ya kujiunga', 'Demandes pour rejoindre', '连线申请', 'طلبات الانضمام', 'Pedidos para entrar', 'जुड़ने के अनुरोध', 'Beitrittsanfragen'],
    noRequests: ['No join requests right now.', 'Hakuna maombi kwa sasa.', 'Aucune demande pour le moment.', '目前没有连线申请。', 'لا توجد طلبات الآن.', 'Nenhum pedido agora.', 'अभी कोई अनुरोध नहीं।', 'Gerade keine Anfragen.'],
    accept: ['Accept', 'Kubali', 'Accepter', '接受', 'قبول', 'Aceitar', 'स्वीकारें', 'Annehmen'],
    decline: ['Decline', 'Kataa', 'Refuser', '拒绝', 'رفض', 'Recusar', 'अस्वीकारें', 'Ablehnen'],
    swipe: ['Swipe to browse requests', 'Telezesha kuona maombi', 'Balayez pour parcourir', '滑动浏览申请', 'اسحب لتصفح الطلبات', 'Deslize para ver os pedidos', 'अनुरोध देखने के लिए स्वाइप करें', 'Wischen zum Durchblättern'],
    seatsFilled: ['guest seats filled', 'viti vya wageni vimejaa', 'places invités occupées', '嘉宾席位已占用', 'مقاعد ضيوف مشغولة', 'lugares de convidados ocupados', 'मेहमान सीटें भरीं', 'Gastplätze belegt'],
    previous: ['Previous request', 'Ombi lililotangulia', 'Demande précédente', '上一个申请', 'الطلب السابق', 'Pedido anterior', 'पिछला अनुरोध', 'Vorherige Anfrage'],
    next: ['Next request', 'Ombi linalofuata', 'Demande suivante', '下一个申请', 'الطلب التالي', 'Próximo pedido', 'अगला अनुरोध', 'Nächste Anfrage'],
    reviewRequests: ['Review join requests', 'Kagua maombi ya kujiunga', 'Voir les demandes', '查看连线申请', 'مراجعة طلبات الانضمام', 'Ver pedidos para entrar', 'जुड़ने के अनुरोध देखें', 'Anfragen ansehen'],
    close: ['Close', 'Funga', 'Fermer', '关闭', 'إغلاق', 'Fechar', 'बंद करें', 'Schließen'],
    autoAccept: ['Auto-accept guests', 'Kubali wageni moja kwa moja', 'Accepter automatiquement', '自动接受嘉宾', 'قبول الضيوف تلقائيًا', 'Aceitar convidados automaticamente', 'मेहमानों को अपने आप स्वीकारें', 'Gäste automatisch annehmen'],
    autoAcceptOn: ['On · one tap puts a viewer straight on stage', 'Imewashwa · mguso mmoja unamweka mtazamaji jukwaani', 'Activé · un appui suffit pour monter sur scène', '已开启 · 观众一键直接上麦', 'مفعّل · لمسة واحدة تضع المشاهد على المسرح', 'Ligado · um toque coloca o espectador no palco', 'चालू · एक टैप से दर्शक सीधे मंच पर', 'An · ein Tippen bringt Zuschauer direkt auf die Bühne'],
    autoAcceptOff: ['Off · requests wait in your queue', 'Imezimwa · maombi yanasubiri kwenye foleni yako', 'Désactivé · les demandes attendent votre choix', '已关闭 · 申请在队列中等待', 'متوقف · تنتظر الطلبات في قائمتك', 'Desligado · pedidos aguardam na sua fila', 'बंद · अनुरोध आपकी कतार में रुकते हैं', 'Aus · Anfragen warten in deiner Liste'],
    joinNow: ['Join the stage', 'Jiunge jukwaani', 'Monter sur scène', '加入连麦', 'انضم إلى المسرح', 'Entrar no palco', 'मंच से जुड़ें', 'Auf die Bühne'],
    joinInstant: ['One tap · instant entry', 'Mguso mmoja · unaingia mara moja', 'Un appui · entrée immédiate', '一键 · 立即加入', 'لمسة واحدة · دخول فوري', 'Um toque · entrada imediata', 'एक टैप · तुरंत प्रवेश', 'Ein Tippen · sofort dabei'],
    hostRequests: ['Guests are raising their hands', 'Wageni wanainua mikono', 'Des invités lèvent la main', '有嘉宾举手', 'الضيوف يرفعون أيديهم', 'Convidados levantando a mão', 'मेहमान हाथ उठा रहे हैं', 'Gäste melden sich'],
    taskbar: ['Live controls', 'Vidhibiti vya Live', 'Commandes du Live', '直播控制', 'عناصر التحكم في البث', 'Controles da Live', 'लाइव नियंत्रण', 'Live-Steuerung'],
    tbMic: ['Mic', 'Maiki', 'Micro', '麦克风', 'الميكروفون', 'Microfone', 'माइक', 'Mikro'],
    tbCamera: ['Camera', 'Kamera', 'Caméra', '摄像头', 'الكاميرا', 'Câmera', 'कैमरा', 'Kamera'],
    tbSound: ['Sound', 'Sauti', 'Son', '声音', 'الصوت', 'Som', 'आवाज़', 'Ton'],
    tbGuests: ['Guests', 'Wageni', 'Invités', '嘉宾', 'الضيوف', 'Convidados', 'मेहमान', 'Gäste'],
    tbShare: ['Share', 'Shiriki', 'Partager', '分享', 'مشاركة', 'Compartilhar', 'शेयर', 'Teilen'],
    tbSettings: ['Settings', 'Mpangilio', 'Réglages', '设置', 'الإعدادات', 'Ajustes', 'सेटिंग्स', 'Einstellungen'],
    tbSettingsLong: ['Live settings', 'Mipangilio ya Live', 'Réglages du Live', '直播设置', 'إعدادات البث', 'Ajustes da Live', 'लाइव सेटिंग्स', 'Live-Einstellungen'],
    joiningLive: ['Joining the Live…', 'Inajiunga na Live…', 'Connexion au Live…', '正在进入直播…', 'جارٍ الانضمام إلى البث…', 'Entrando na Live…', 'लाइव से जुड़ रहे हैं…', 'Live wird betreten…'],
    joinFailed: ['Could not join this Live. Pick it again from the list to retry.', 'Imeshindikana kujiunga na Live hii. Ichague tena kwenye orodha kujaribu tena.', 'Impossible de rejoindre ce Live. Choisissez-le à nouveau pour réessayer.', '无法进入此直播。请在列表中再次选择重试。', 'تعذر الانضمام إلى هذا البث. اختره مجددًا من القائمة لإعادة المحاولة.', 'Não foi possível entrar nesta Live. Escolha-a novamente na lista.', 'इस लाइव से नहीं जुड़ सके। दोबारा कोशिश के लिए सूची से फिर चुनें।', 'Beitritt fehlgeschlagen. Wähle das Live erneut aus der Liste.'],
    signInToWatch: ['Sign in to watch this Live. It opens as soon as you are signed in.', 'Ingia ili kutazama Live hii. Itafunguka mara utakapoingia.', 'Connectez-vous pour regarder ce Live. Il s’ouvrira dès la connexion.', '登录后即可观看此直播，登录后自动打开。', 'سجّل الدخول لمشاهدة هذا البث. سيفتح فور تسجيل دخولك.', 'Entre para assistir a esta Live. Ela abre assim que você entrar.', 'यह लाइव देखने के लिए साइन इन करें। साइन इन होते ही खुल जाएगा।', 'Melde dich an, um dieses Live zu sehen. Es öffnet sich danach sofort.'],
    liveNowCount: ['live now', 'wako LIVE sasa', 'en direct', '正在直播', 'مباشر الآن', 'ao vivo agora', 'अभी लाइव', 'gerade live'],
    tbHost: ['Host', 'Mwenyeji', 'Hôte', '主播', 'المضيف', 'Anfitrião', 'होस्ट', 'Host'],
    hostControls: ['Host controls', 'Vidhibiti vya mwenyeji', 'Commandes de l’hôte', '主播控制', 'أدوات المضيف', 'Controles do anfitrião', 'होस्ट नियंत्रण', 'Host-Steuerung'],
    hostControlsHint: ['Accept guests, block people and change the layout without leaving the Live.', 'Kubali wageni, zuia watu na ubadilishe mpangilio bila kutoka kwenye Live.', 'Acceptez des invités, bloquez des personnes et changez la disposition sans quitter le Live.', '无需离开直播即可接受嘉宾、拉黑用户和更改布局。', 'اقبل الضيوف واحظر الأشخاص وغيّر التخطيط دون مغادرة البث.', 'Aceite convidados, bloqueie pessoas e mude o layout sem sair da Live.', 'लाइव छोड़े बिना मेहमान स्वीकारें, लोगों को ब्लॉक करें और लेआउट बदलें।', 'Gäste annehmen, Personen blockieren und das Layout ändern, ohne das Live zu verlassen.'],
    hostRequestsTitle: ['Guest requests', 'Maombi ya wageni', 'Demandes d’invités', '连麦申请', 'طلبات الضيوف', 'Pedidos de convidados', 'मेहमान अनुरोध', 'Gastanfragen'],
    hostLayoutTitle: ['Multi-guest layout', 'Mpangilio wa wageni', 'Disposition multi-invités', '多人布局', 'تخطيط الضيوف', 'Layout de convidados', 'मल्टी-गेस्ट लेआउट', 'Mehrgast-Layout'],
    hostPeopleTitle: ['People in the Live', 'Watu kwenye Live', 'Personnes dans le Live', '直播间的人', 'الأشخاص في البث', 'Pessoas na Live', 'लाइव में लोग', 'Personen im Live'],
    hostSeats: ['Guest seats', 'Viti vya wageni', 'Places invités', '嘉宾席位', 'مقاعد الضيوف', 'Lugares de convidados', 'मेहमान सीटें', 'Gastplätze'],
    hostMoreLayouts: ['More layout options', 'Chaguo zaidi za mpangilio', 'Plus d’options', '更多布局选项', 'خيارات تخطيط أخرى', 'Mais opções de layout', 'और लेआउट विकल्प', 'Weitere Layout-Optionen'],
    hostSwipe: ['Swipe through requests', 'Pitia maombi kwa kutelezesha', 'Parcourir les demandes', '滑动浏览申请', 'تصفح الطلبات بالسحب', 'Deslizar pelos pedidos', 'अनुरोधों को स्वाइप करें', 'Anfragen durchwischen'],
    hostNoPending: ['No one is waiting to join.', 'Hakuna anayesubiri kujiunga.', 'Personne n’attend.', '暂无人申请。', 'لا أحد ينتظر الانضمام.', 'Ninguém aguardando.', 'कोई इंतज़ार में नहीं है।', 'Niemand wartet.'],
    hostAccept: ['Accept', 'Kubali', 'Accepter', '接受', 'قبول', 'Aceitar', 'स्वीकारें', 'Annehmen'],
    hostDecline: ['Decline', 'Kataa', 'Refuser', '拒绝', 'رفض', 'Recusar', 'अस्वीकारें', 'Ablehnen'],
    hostBlock: ['Block', 'Zuia', 'Bloquer', '拉黑', 'حظر', 'Bloquear', 'ब्लॉक', 'Blockieren'],
    hostInvite: ['Invite', 'Alika', 'Inviter', '邀请', 'دعوة', 'Convidar', 'आमंत्रित', 'Einladen'],
    hostMute: ['Mute', 'Nyamazisha', 'Couper', '静音', 'كتم', 'Silenciar', 'म्यूट', 'Stumm'],
    hostAllowMic: ['Allow mic', 'Ruhusu maiki', 'Autoriser le micro', '允许发言', 'السماح بالميكروفون', 'Liberar microfone', 'माइक दें', 'Mikro erlauben'],
    hostRemove: ['Remove', 'Ondoa', 'Retirer', '移下', 'إزالة', 'Remover', 'हटाएं', 'Entfernen'],
    hostOnStage: ['On stage', 'Jukwaani', 'Sur scène', '连麦中', 'على المسرح', 'No palco', 'मंच पर', 'Auf der Bühne'],
    hostBroadcastOnly: ['This Live is broadcast-only, so guests cannot join the stage.', 'Live hii ni ya kutangaza tu, wageni hawawezi kujiunga jukwaani.', 'Ce Live est en diffusion seule : pas d’invités sur scène.', '此直播仅限单向直播，嘉宾无法连麦。', 'هذا البث للبث فقط، لا يمكن للضيوف الانضمام.', 'Esta Live é só transmissão; convidados não sobem ao palco.', 'यह लाइव केवल प्रसारण है, मेहमान मंच पर नहीं आ सकते।', 'Dieses Live ist nur Übertragung, Gäste können nicht auf die Bühne.'],
    tapToHear: ['Tap anywhere to hear the Live', 'Gusa popote kusikia Live', 'Touchez l’écran pour entendre le Live', '点击任意位置收听直播', 'المس أي مكان لسماع البث', 'Toque em qualquer lugar para ouvir', 'लाइव सुनने के लिए कहीं भी टैप करें', 'Tippe irgendwo, um zuzuhören']
  };
  const say = key => { let language = 'sw';try { language = window.MilkyWayI18n?.language?.() || localStorage.getItem('mw_lang') || 'sw'; } catch {} const row = stageCopy[key] || [key];return row[Math.max(0, stageLanguages.indexOf(language))] || row[0]; };
  async function roomAction(action, values = {}, record = session, retry = true) {
    if (!record?.room_name?.startsWith('mw-conversation-')) throw new Error('Start a new conversation room to use these controls.');
    const roomName = record.room_name;
    const authSession = (await sb.auth.getSession()).data.session;
    if (!authSession) throw new Error('Your sign-in expired. Please sign in again.');
    const response = await fetch('/.netlify/functions/milkyway-room', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}`, apikey: sb.supabaseKey || '' }, body: JSON.stringify({ room: roomName, action, ...values }), signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => { throw new Error(translate('liveInvalidResponse')); });
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(translate('liveInvalidResponse'));
    if (response.status === 401 && retry) {
      const refreshed = await sb.auth.refreshSession();
      if (!refreshed.error && refreshed.data.session?.user.id === user?.id) return roomAction(action, values, record, false);
    }
    if (!response.ok) throw Object.assign(new Error(window.MilkyWayI18n?.text(result.error) || result.error || 'Room action failed.'), { status: response.status });
    if (action === 'status' && (!result.settings || !Number.isInteger(result.settings.layout) || !['approval', 'direct', 'broadcast'].includes(result.settings.admission) || !result.self || result.self.userId !== authSession.user?.id && result.self.userId !== user?.id || !Array.isArray(result.members) || !Array.isArray(result.messages) || !Array.isArray(result.connected))) throw new Error(translate('liveInvalidResponse'));
    return result;
  }
  function paintServiceStatus() {
    const panel = byId('mwLiveServiceStatus');
    if (!panel) return;
    panel.dataset.state = serviceChecking ? 'checking' : serviceState?.available ? 'configured' : ['configuration_missing', 'configuration_invalid', 'provider_authentication', 'provider_unavailable', 'platform_restricted'].includes(serviceState?.reason) ? 'unavailable' : 'unknown';
    const failureKeys = { authentication_required: 'liveHealthAuthentication', access_denied: 'liveAccessDenied', platform_restricted: 'livePlatformRestricted', endpoint_missing: 'liveEndpointMissing', endpoint_incompatible: 'liveEndpointIncompatible', invalid_response: 'liveInvalidResponse', configuration_invalid: 'liveConfigurationInvalid', configuration_missing: 'liveConfigurationMissing', provider_authentication: 'liveProviderAuthentication', provider_unavailable: 'liveProviderUnavailable' };
    const key = serviceChecking ? 'liveCheckingConfiguration' : serviceState?.available ? serviceState.reason === 'service_ready' ? 'liveServiceReady' : 'liveConfigurationPresent' : failureKeys[serviceState?.reason] || 'liveConfigurationNetwork';
    byId('mwLiveServiceText').textContent = translate(key);
    byId('mwLiveServiceVariables').textContent = '';
    byId('mwLiveServiceRetry').disabled = serviceChecking;
  }
  function checkService(force = false) {
    if (serviceRequest) return serviceRequest;
    if (!force && serviceState && Date.now() - lastServiceCheck < 60000) return Promise.resolve(serviceState);
    serviceChecking = true;paintServiceStatus();
    serviceRequest = (async () => { try {
      const currentSession = (await sb.auth.getSession()).data.session;
      const response = await fetch('/.netlify/functions/milkyway-room', { headers: { apikey: sb.supabaseKey || '', ...(currentSession ? { Authorization: `Bearer ${currentSession.access_token}` } : {}) }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(translate('liveConfigurationNetwork'));
      const result = await response.json();
      if (typeof result.available !== 'boolean' || !['supabase', 'netlify'].includes(result.service)) throw new Error(translate('liveInvalidResponse'));
      serviceState = { available: result.available, reason: result.reason || (result.available ? 'configuration_present' : 'configuration_missing'), missing: result.missing };
      return serviceState;
    } catch (error) {
      serviceState = { available: false, reason: 'network_error' };
      throw new Error(translate('liveConfigurationNetwork'));
    } finally { lastServiceCheck = Date.now();serviceChecking = false;serviceRequest = null;paintServiceStatus(); } })();
    return serviceRequest;
  }
  const seatHues = [188, 280, 45, 145, 330, 210, 20, 100];
  const alienFace = hue => `<svg class="mwx-alien" viewBox="0 0 64 64" aria-hidden="true" style="--hue:${hue}"><defs><radialGradient id="mwxAlien${hue}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="hsl(${hue} 95% 72%)"/><stop offset="1" stop-color="hsl(${hue} 80% 34%)"/></radialGradient></defs><path d="M32 7c-13 0-22 9-22 21 0 12 11 27 22 29 11-2 22-17 22-29C54 16 45 7 32 7Z" fill="url(#mwxAlien${hue})"/><path d="M14 27c5-1 12 2 14 9-6 2-13-1-14-9Zm36 0c-5-1-12 2-14 9 6 2 13-1 14-9Z" fill="#0F172A"/><circle cx="21" cy="30" r="2" fill="#FACC15"/><circle cx="43" cy="30" r="2" fill="#FACC15"/><path d="M28 47c2.5 1.4 5.5 1.4 8 0" stroke="#0F172A" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M24 9 19 2m21 7 5-7" stroke="hsl(${hue} 90% 70%)" stroke-width="2" stroke-linecap="round"/><circle cx="19" cy="2" r="2" fill="#FACC15"/><circle cx="45" cy="2" r="2" fill="#FACC15"/></svg>`;
  function participantTile(participant) {
    const grid = byId('mwLiveGrid');
    let tile = grid.querySelector('.mw-stage-tile');
    if (!tile || tile.dataset.identity !== participant.identity) {
      grid.querySelectorAll('.mw-stage-tile').forEach(element => { clearTileVideos(element);element.remove(); });
      tile = document.createElement('div');tile.className = 'mw-stage-tile';tile.dataset.identity = participant.identity;tile.dataset.host = 'true';
      const picture = document.createElement('span');picture.className = 'mw-stage-initial mw-live-avatar';picture.setAttribute('aria-hidden', 'true');
      const member = roomState?.members.find(item => item.userId === participant.identity);
      avatar(picture, { avatar_url: member?.avatar }, participant.name || session?.host_name);
      tile.append(picture);grid.append(tile);
    }
    tile.dataset.camera = participant.isCameraEnabled ? 'on' : 'off';
    tile.dataset.microphone = participant.isMicrophoneEnabled ? 'on' : 'off';
    tile.classList.toggle('is-speaking', participant.isSpeaking === true);
    return tile;
  }
  function clearTileVideos(tile) {
    tile.querySelectorAll('video').forEach(video => { video.mwTrack?.detach(video);video.pause();video.srcObject = null;video.remove(); });
  }
  function attachCamera(container, participant) {
    const publication = [...participant.videoTrackPublications.values()].find(item => item.track);
    const current = container.querySelector('video');
    if (!publication || !participant.isCameraEnabled) { if (current) clearTileVideos(container);return; }
    if (current?.mwTrack === publication.track) return;
    clearTileVideos(container);
    const video = publication.track.attach();video.mwTrack = publication.track;video.autoplay = true;video.playsInline = true;video.muted = true;video.dataset.trackSid = publication.track.sid || '';
    video.setAttribute('aria-label', participant.name || translate('participant'));
    if (participant === room.localParticipant) video.classList.add('mw-live-local');
    container.prepend(video);video.play().catch(() => message(translate('resumeVideo')));
  }
  function renderSeats(participants) {
    const seats = byId('mwLiveSeats');
    if (!seats) return;
    seats.hidden = !conversationRoom() || !room || roomState?.settings.admission === 'broadcast';
    if (seats.hidden) { seats.querySelectorAll('.mwx-seat').forEach(clearTileVideos);seats.replaceChildren();return; }
    const capacity = Math.max(1, Math.min(20, (roomState?.settings.layout || 3) - 1));
    const guests = (roomState?.members || []).filter(member => member.state === 'speaker' && member.userId !== session.host_id);
    const pending = (roomState?.members || []).filter(member => member.state === 'pending').length;
    seats.dataset.count = String(capacity);
    while (seats.children.length > capacity) { clearTileVideos(seats.lastElementChild);seats.lastElementChild.remove(); }
    for (let index = 0; index < capacity; index++) {
      let seat = seats.children[index];
      const hue = seatHues[index % seatHues.length];
      if (!seat) {
        seat = document.createElement('button');seat.type = 'button';seat.className = 'mwx-seat';seat.style.setProperty('--hue', String(hue));
        seat.innerHTML = `<span class="mwx-seat-face">${alienFace(hue)}<span class="mwx-seat-photo mw-live-avatar"></span></span><span class="mwx-seat-name"></span>`;
        seat.onclick = event => {
          const waiting = (roomState?.members || []).some(member => member.state === 'pending');
          if (host && seat.dataset.state === 'empty' && waiting) action('requests');
          else if (host || seat.dataset.self === 'true') action('guest-panel');else if (seat.dataset.state === 'empty') {
            // One touch on any open seat or "+" asks to join; with auto-accept on, the guest is seated straight away.
            if (roomState?.self.state === 'speaker') return action('guest-panel');
            if (roomState?.self.state === 'pending') return;
            action('request');
          } else action('guest-panel');
        };
        seats.append(seat);
      }
      const member = guests[index];
      const participant = member && participants.find(item => item.identity === member.userId);
      const photo = seat.querySelector('.mwx-seat-photo');
      seat.dataset.state = member ? participant ? 'live' : 'away' : 'empty';
      seat.dataset.self = String(member?.userId === user?.id);
      seat.classList.toggle('is-speaking', participant?.isSpeaking === true);
      seat.dataset.microphone = participant?.isMicrophoneEnabled && !member?.hostMuted ? 'on' : 'off';
      if (seat.dataset.member !== (member?.userId || '')) {
        seat.dataset.member = member?.userId || '';
        clearTileVideos(seat.querySelector('.mwx-seat-face'));
        if (member) avatar(photo, { avatar_url: member.avatar }, member.name);else photo.textContent = '+';
      }
      const label = member ? member.name : host ? `${translate('pending')} ${pending || ''}`.trim() : roomState?.self.state === 'pending' ? translate('requestPending') : roomState?.settings.admission === 'direct' ? say('joinNow') : translate('requestJoin');
      seat.querySelector('.mwx-seat-name').textContent = member ? member.name : index === guests.length ? label : '';
      seat.setAttribute('aria-label', member ? `${member.name} · ${translate('speaker')}` : label);
      if (participant) attachCamera(seat.querySelector('.mwx-seat-face'), participant);
    }
    const guestButton = byId('mwLiveGuestButton');
    if (guestButton) guestButton.dataset.pending = String(host ? pending : 0);
    paintHostAlien(host ? pending : 0);
    renderRequests();
  }
  // The alien join / request control lives only in the bottom-right overlay (TikTok style), never up on the seats:
  // guests get the join alien, the host gets the gold alien raising its hand with the waiting-request count.
  function paintHostAlien(pending) {
    const button = byId('mwLiveHostAlien');
    if (!button) return;
    button.hidden = !host || !conversationRoom() || !connected() || roomState?.settings.admission === 'broadcast';
    if (button.hidden) return;
    const count = button.querySelector('.mwx-alien-count');
    count.textContent = pending ? String(pending > 99 ? '99+' : pending) : '';count.hidden = !pending;
    button.dataset.pending = String(pending);
    const label = pending ? `${say('hostRequests')} (${pending})` : say('reviewRequests');
    button.setAttribute('aria-label', label);button.title = label;
  }
  // Full-screen layout: seats wrap into extra columns and shrink so every seat fits without scrolling.
  function fitSeats(seats) {
    const stage = byId('mwLiveStage');
    const count = seats.children.length;
    if (!count || seats.hidden || stage.dataset.typing === 'true') return;
    const actions = stage.querySelector('.mw-live-actions');
    let height = seats.clientHeight;
    if (actions?.offsetHeight) height = Math.min(height, actions.getBoundingClientRect().top - seats.getBoundingClientRect().top - 6);
    const width = stage.clientWidth * (count > 8 ? .64 : .5);
    if (height <= 0 || !width) return;
    // Host and guests share one seat size so the stage layout is identical for everyone.
    const base = 74, label = 18, gap = 8;
    let best = null;
    for (let columns = 1; columns <= 6; columns++) {
      const rows = Math.ceil(count / columns);
      const size = Math.min(base, Math.floor((height - (rows - 1) * gap) / rows - label), Math.floor((width - (columns - 1) * gap) / columns - 14));
      if (!best || size > best.size + 2) best = { rows, size };
      if (size >= base) break;
    }
    seats.style.setProperty('--seat-fit', `${Math.max(28, best.size)}px`);
    seats.style.setProperty('--seat-rows', String(best.rows));
  }
  function renderGrid() {
    const grid = byId('mwLiveGrid');
    if (!grid) return;
    grid.hidden = !conversationRoom() || !room;
    byId('mwLiveStage').dataset.conversation = String(conversationRoom());
    if (grid.hidden) { renderSeats([]);paintStageLayout();return; }
    const participants = [room.localParticipant, ...room.remoteParticipants.values()];
    const hostParticipant = participants.find(participant => participant.identity === session.host_id);
    if (hostParticipant) attachCamera(participantTile(hostParticipant), hostParticipant);
    else grid.querySelectorAll('.mw-stage-tile').forEach(tile => { clearTileVideos(tile);tile.remove(); });
    grid.dataset.camera = hostParticipant?.isCameraEnabled ? 'on' : 'off';
    renderSeats(participants);
    paintStageLayout();
  }
  // Multi-guest layouts: Full screen keeps the floating seat column; every other style tiles host and guests.
  function paintStageLayout() {
    const stage = byId('mwLiveStage'), grid = byId('mwLiveGrid'), seats = byId('mwLiveSeats'), layouts = window.MilkyWayLiveLayouts;
    if (!stage || !grid || !seats) return;
    const settings = roomState?.settings || {};
    const style = layouts ? layouts.normalize(settings.layoutStyle) : 'fullscreen';
    const tiled = !!layouts && !grid.hidden && !seats.hidden && style !== 'fullscreen';
    stage.dataset.layout = tiled ? style : 'fullscreen';
    const hostTile = grid.querySelector('.mw-stage-tile');
    const all = [...seats.children];
    const reset = element => { element.removeAttribute('style');delete element.dataset.round;delete element.dataset.featured;delete element.dataset.layoutHidden; };
    if (!tiled) { all.forEach(seat => { const hue = seat.style.getPropertyValue('--hue');reset(seat);if (hue) seat.style.setProperty('--hue', hue); });if (hostTile) reset(hostTile);fitSeats(seats);return; }
    const emptyShown = layouts.showsEmptySeats(style);
    let spare = false;
    const visible = all.filter(seat => {
      if (seat.dataset.state !== 'empty' || emptyShown) return true;
      if (spare) return false;
      return spare = true;
    });
    const featuredSeat = settings.featuredId ? visible.findIndex(seat => seat.dataset.member === settings.featuredId) : -1;
    const box = seats.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const rects = layouts.compute(style, { count: visible.length + 1, featured: featuredSeat + 1, hostPosition: settings.hostPosition, width: box.width, height: box.height });
    const place = (element, rect) => {
      const hue = element.style.getPropertyValue('--hue');
      element.removeAttribute('style');if (hue) element.style.setProperty('--hue', hue);
      Object.assign(element.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      element.dataset.round = String(!!rect.round);element.dataset.featured = String(!!rect.featured);delete element.dataset.layoutHidden;
    };
    if (hostTile) place(hostTile, rects[0]);
    all.forEach(seat => { const index = visible.indexOf(seat);if (index < 0) seat.dataset.layoutHidden = 'true';else place(seat, rects[index + 1]); });
  }
  function controlButton(label, action, target, confirmation = false) {
    const button = document.createElement('button');button.type = 'button';button.textContent = translate(label);
    button.onclick = async () => {
      if (confirmation && !(await window.MilkyWayDialog.confirm({ message: translate('confirmModeration'), danger: true }))) return;
      button.disabled = true;
      try { await roomAction(action, { target });await pollRoom();message(translate('saved')); }
      catch (error) { message(error.message, true); }
      finally { button.disabled = false; }
    };
    return button;
  }
  function renderConversationParticipants() {
    if (!roomState || !room) return;
    const connectedIds = new Set([room.localParticipant.identity, ...room.remoteParticipants.keys()]);
    const list = byId('mwLiveParticipants');
    const speakers = roomState.members.filter(member => member.state === 'speaker' && connectedIds.has(member.userId));
    const pending = roomState.members.filter(member => member.state === 'pending').length;
    paintCount(connectedIds.size);
    byId('mwLiveCount').setAttribute('aria-label', `${say('watching')}: ${speakers.length} ${translate('speakers')} · ${connectedIds.size - speakers.length} ${translate('viewers')}${host && pending ? ' · ' + pending + ' ' + translate('pending') : ''}`);
    const review = byId('mwLiveReviewRequests');
    if (review) { review.hidden = !host || !pending;review.textContent = `${say('reviewRequests')} (${pending})`; }
    byId('mwLiveCount').dataset.pending = String(host ? pending : 0);
    // The room is polled every second; rebuild the people lists only when something visible changed.
    const tracks = [room.localParticipant, ...room.remoteParticipants.values()].map(participant => [participant.identity, participant.isMicrophoneEnabled, participant.isCameraEnabled]);
    const signature = JSON.stringify([document.documentElement.lang, host, session?.host_id, roomState.settings, roomState.members, tracks]);
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;list.replaceChildren();
      for (const member of roomState.members.filter(member => connectedIds.has(member.userId) || host && ['pending', 'speaker'].includes(member.state))) {
        const row = document.createElement('div');row.className = 'mw-live-participant';
        const picture = document.createElement('span');picture.className = 'mw-live-avatar';avatar(picture, { avatar_url: member.avatar }, member.name);row.append(picture);
        const label = document.createElement('div');label.textContent = `${member.name} · ${translate(member.state)}${member.hostMuted ? ' · ' + translate('hostMuted') : ''}`;row.append(label);
        const participant = member.userId === room.localParticipant.identity ? room.localParticipant : room.remoteParticipants.get(member.userId);
        if (participant) label.append(document.createTextNode(` · ${translate(participant.isMicrophoneEnabled ? 'micOn' : 'micOff')} · ${translate(participant.isCameraEnabled ? 'cameraOn' : 'cameraOff')}`));
        if (!connectedIds.has(member.userId)) label.append(document.createTextNode(` · ${translate('notConnected')}`));
        if (host && member.userId !== session.host_id && member.state !== 'banned') {
          const controls = document.createElement('div');controls.className = 'mw-participant-controls';
          if (member.state !== 'speaker' && roomState.settings.admission !== 'broadcast') controls.append(controlButton('invite', 'approve', member.userId));
          if (member.state === 'pending') controls.append(controlButton('reject', 'reject', member.userId));
          if (member.state === 'speaker') controls.append(controlButton(member.hostMuted ? 'allowMic' : 'mute', member.hostMuted ? 'allow-mic' : 'mute', member.userId), controlButton('remove', 'remove', member.userId, true));
          if (roomState.settings.admission === 'broadcast') controls.append(controlButton('remove', 'remove', member.userId, true));
          controls.append(controlButton('block', 'ban', member.userId, true));row.append(controls);
        }
        list.append(row);
      }
      const guestList = byId('mwLiveGuestList');
      guestList.replaceChildren();
      byId('mwLiveParticipants').hidden = !host;
      guestList.hidden = host;
      const admitted = roomState.members.filter(member => member.state === 'speaker');
      byId('mwLiveGuestCapacity').textContent = `${admitted.filter(member => member.userId !== session.host_id).length} / ${Math.max(1, roomState.settings.layout - 1)} · ${translate('visibleSeats')}`;
      byId('mwLiveGuestPolicy').textContent = translate(roomState.settings.admission === 'broadcast' ? 'broadcastLive' : roomState.settings.admission === 'direct' ? 'guestDirectHelp' : 'guestApprovalHelp');
      admitted.forEach(member => {
        const row = document.createElement('p');row.className = 'mw-live-participant';
        row.textContent = `${member.name} · ${translate(connectedIds.has(member.userId) ? 'speaker' : 'notConnected')}${member.hostMuted ? ' · ' + translate('hostMuted') : ''}`;guestList.append(row);
      });
    }
    renderViewers();renderHostPanel();
  }
  function floatHeart(burst = 1) {
    const layer = byId('mwLiveHearts');
    if (!layer || layer.childElementCount > 24) return;
    for (let index = 0; index < burst; index++) {
      const heart = document.createElement('span');heart.className = 'mwx-heart';
      heart.style.setProperty('--drift', `${Math.round(Math.random() * 60 - 30)}px`);
      heart.style.setProperty('--hue', String(seatHues[Math.floor(Math.random() * seatHues.length)]));
      heart.style.animationDelay = `${index * 120}ms`;
      heart.innerHTML = svg('heart');
      heart.addEventListener('animationend', () => heart.remove());
      layer.append(heart);
    }
  }
  function renderChat(messages) {
    const list = byId('mwLiveComments');
    const firstPaint = roomChatSignature === '';
    const signature = JSON.stringify(messages.map(item => [item.id, item.deleted]));
    if (signature === roomChatSignature) return;
    roomChatSignature = signature;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const known = new Map([...list.querySelectorAll('[data-message-id]')].map(row => [row.dataset.messageId, row]));
    const visible = new Set();
    let hearts = 0;
    for (const item of messages) {
      if (item.kind === 'reaction') { if (!firstPaint && !reactionIds.has(item.id) && item.userId !== user?.id) hearts++;reactionIds.add(item.id);continue; }
      visible.add(item.id);
      const existing = known.get(item.id);
      if (existing && existing.dataset.deleted === String(item.deleted)) continue;
      let content = item.deleted ? translate('messageRemoved') : item.body;
      if (item.kind === 'system' && !item.deleted) { try { const event = JSON.parse(item.body);if (event.mwSystem === 1 && typeof event.name === 'string' && typeof event.key === 'string') content = `${event.name} · ${translate(event.key)}`; } catch {} }
      // Gifts arrive as their own chat rows; new ones from other viewers also play the gift animation.
      let giftKey = '';
      if (item.kind === 'gift' && !item.deleted) { try { const event = JSON.parse(item.body);if (event.mwGift === 1 && typeof event.gift === 'string') { giftKey = event.gift;content = window.MilkyWayGifts?.chatText(giftKey) || '🎁'; } } catch {} }
      if (giftKey && !existing && !firstPaint && item.userId !== user?.id) window.MilkyWayGifts?.celebrate(giftKey, item.name);
      const row = commentRow(item.name, content, item.kind === 'system', item.avatar);
      if (giftKey) { row.classList.add('mw-live-gift');row.dataset.gift = giftKey; }
      row.dataset.messageId = item.id;row.dataset.deleted = String(item.deleted);
      if (firstPaint) row.classList.add('is-history');
      if (host && !item.deleted && item.kind !== 'system') {
        const button = document.createElement('button');button.type = 'button';button.className = 'mwx-comment-delete';button.textContent = '×';button.setAttribute('aria-label', translate('delete'));
        button.onclick = async () => { if (!(await window.MilkyWayDialog.confirm({ message: translate('confirmModeration'), danger: true }))) return;button.disabled = true;try { await roomAction('delete-message', { id: item.id });await pollRoom(); } catch (error) { message(error.message, true);button.disabled = false; } };
        row.append(button);
      }
      if (existing) existing.replaceWith(row);else list.append(row);
    }
    known.forEach((row, id) => { if (!visible.has(id)) row.remove(); });
    list.querySelector('p.muted')?.remove();
    while (list.children.length > 120) list.firstElementChild.remove();
    if (atBottom || firstPaint) list.scrollTo({ top: list.scrollHeight, behavior: firstPaint ? 'auto' : 'smooth' });
    if (hearts) floatHeart(Math.min(hearts, 6));
  }
  let syncTimer = null;
  let pollQueued = false;
  const requestSync = () => { clearTimeout(syncTimer);syncTimer = setTimeout(() => pollRoom(), 120); };
  const reactionIds = new Set();
  // Puts a guest who was just seated (auto-accept or the host's approval) live on stage: the microphone, plus the camera
  // in a Video Live, turn on as soon as LiveKit confirms the new publishing rights.
  async function enterStage(activeRoom) {
    const participant = activeRoom.localParticipant;
    if (participant.permissions?.canPublish !== true) {
      const changed = (window.LivekitClient || window.LiveKitClient)?.RoomEvent?.ParticipantPermissionsChanged || 'participantPermissionsChanged';
      await new Promise(resolve => {
        const done = () => { clearTimeout(timer);activeRoom.off(changed, done);resolve(); };
        const timer = setTimeout(done, 4000);
        activeRoom.on(changed, done);
      });
    }
    if (activeRoom !== room || !connected() || roomState?.self.state !== 'speaker') return;
    try {
      if (!roomState.self.hostMuted && !participant.isMicrophoneEnabled) await participant.setMicrophoneEnabled(true);
      if (mode === 'video' && !participant.isCameraEnabled) await participant.setCameraEnabled(true).catch(() => {});
    } catch (error) { message(startError(error, 'microphone'), true); }
    if (activeRoom === room) { syncMedia();renderGrid(); }
  }
  // Applies this person's own stage state locally, so the seat, the controls and the alien update in the same moment.
  function applySelfState(nextState) {
    if (!roomState || !nextState) return;
    const previous = roomState.self.state;
    const self = { ...roomState.self, state: nextState };
    const members = roomState.members.some(member => member.userId === self.userId) ? roomState.members.map(member => member.userId === self.userId ? { ...member, state: nextState } : member) : [...roomState.members, self];
    roomState = { ...roomState, self, members };
    selfChangedAt = Date.now();
    const speaker = nextState === 'speaker';
    byId('mwLiveMic').hidden = !speaker;byId('mwLiveMic').disabled = self.hostMuted;
    byId('mwLiveCamera').hidden = !speaker || mode === 'audio';
    if (!speaker && room) {
      if (room.localParticipant.isMicrophoneEnabled) room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      if (room.localParticipant.isCameraEnabled) room.localParticipant.setCameraEnabled(false).catch(() => {});
    }
    paintParticipation();renderGrid();
    if (speaker && previous !== 'speaker') enterStage(room);
  }
  let selfChangedAt = 0;
  async function pollRoom() {
    if (!conversationRoom() || !connected()) return;
    if (roomPolling) { pollQueued = true;return; }
    const activeRoom = room;
    const startedAt = Date.now();
    roomPolling = true;
    try {
      const state = await roomAction('status');
      if (activeRoom !== room) return;
      // A refresh that left before this person joined or left the stage would briefly undo the change; the next one is current.
      if (startedAt < selfChangedAt) { pollQueued = true;return; }
      const previousSelf = roomState?.self.state;
      if (host && roomState) state.members.filter(member => member.state === 'pending' && !roomState.members.some(previous => previous.userId === member.userId && previous.state === 'pending')).forEach(member => { toast(`${member.name} · ${translate('requestedToSpeak')}`);if (localStorage.getItem('mw_notify_sound') !== 'off') playNotificationSound(); });
      roomState = state;
      const speaker = state.self.state === 'speaker';
      if (!speaker || state.self.hostMuted) { if (room.localParticipant.isMicrophoneEnabled) await room.localParticipant.setMicrophoneEnabled(false); }
      if (!speaker && room.localParticipant.isCameraEnabled) await room.localParticipant.setCameraEnabled(false);
      byId('mwLiveMic').hidden = !speaker;byId('mwLiveMic').disabled = state.self.hostMuted;
      byId('mwLiveCamera').hidden = !speaker || mode === 'audio';
      paintParticipation();
      byId('mwLiveLayoutControls').hidden = !host;
      if (!settingsBusy) {
        byId('mwLiveLayout').value = String(Math.max(1, Math.min(20, state.settings.layout - 1)));byId('mwLiveAdmission').value = state.settings.admission;
        byId('mwLiveAdmission').disabled = state.settings.admission === 'broadcast';paintAutoAccept();
        window.MilkyWayLiveLayouts?.paintTrigger(byId('mwLiveLayoutTrigger'), state.settings.layoutStyle, Math.max(1, state.settings.layout - 1));
      }
      renderGrid();renderConversationParticipants();syncMedia();
      renderChat(state.messages);
      if (!host && speaker && previousSelf && previousSelf !== 'speaker') enterStage(activeRoom);
    } catch (error) {
      if (activeRoom !== room) return;
      if ([401, 403, 404].includes(error.status)) { await disconnect();message(error.message, true); }
      else message(error.message, true);
    } finally { roomPolling = false;if (pollQueued) { pollQueued = false;requestSync(); } }
  }
  function paintAutoAccept() {
    const admission = byId('mwLiveAdmission')?.value;
    for (const label of document.querySelectorAll('#mwLivePage .mwx-live-auto')) {
      const input = label.querySelector('input');
      label.hidden = !host || !conversationRoom() || admission === 'broadcast';
      input.checked = admission === 'direct';
      if (admission === 'broadcast') input.disabled = true;
      label.querySelector('b').textContent = say('autoAccept');
      label.querySelector('small').textContent = say(input.checked ? 'autoAcceptOn' : 'autoAcceptOff');
    }
    const setup = byId('mwLiveAutoAccept');
    if (setup) {
      const requests = byId('mwLiveAllowRequests')?.checked !== false;
      setup.disabled = !requests;setup.closest('label').hidden = !requests;
      byId('mwLiveAutoAcceptLabel').textContent = say('autoAccept');
      byId('mwLiveAutoAcceptHint').textContent = say(setup.checked ? 'autoAcceptOn' : 'autoAcceptOff');
    }
  }
  const serverUrl = 'wss://masiyatunda-milkyway-live-mgh6b1np.livekit.cloud';
  function paintParticipation() {
    const request = byId('mwLiveRequest');
    const guest = byId('mwLiveGuestButton');
    if (!request || !guest) return;
    const state = roomState?.self.state;
    request.hidden = host || !conversationRoom() || !connected() || roomState?.settings.admission === 'broadcast';
    guest.hidden = !conversationRoom() || !connected();
    request.disabled = participationBusy || !state || ['rejected', 'removed', 'banned'].includes(state);
    const label = state === 'speaker' ? 'leaveStage' : state === 'pending' ? 'cancelRequest' : state === 'rejected' ? 'rejected' : state === 'removed' ? 'removed' : 'requestJoin';
    const direct = roomState?.settings.admission === 'direct' && label === 'requestJoin';
    request.querySelector('b').textContent = direct ? say('joinNow') : translate(label);
    request.querySelector('small').textContent = direct ? say('joinInstant') : translate(state === 'pending' ? 'requestPending' : state === 'speaker' ? 'returnToAudience' : 'hostApproval');
    request.setAttribute('aria-label', request.querySelector('b').textContent);request.title = request.querySelector('b').textContent;request.dataset.pending = String(state === 'pending');
    guest.querySelector('b').textContent = translate('guestParticipation');
    guest.querySelector('small').textContent = translate('viewGuestSeats');
  }
  const audioTracks = new Map();
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
  const connected = () => room?.state === 'connected';
  const status = text => { byId('mwLiveStatus').textContent = window.MilkyWayI18n?.text(text) || text; byId('mwLiveStatus').dataset.connected = String(connected()); };
  const message = (text, error = false) => {
    const feedback = byId('mwLiveMessage');
    feedback.textContent = window.MilkyWayI18n?.text(text) || text;
    feedback.dataset.error = String(error);
    const inSetup = !byId('mwLiveLobby').hidden && !byId('mwLiveSetup').hidden;
    (inSetup ? byId('mwLiveStart') : byId('mwLiveStage')).after(feedback);
    if (text && !byId('mwLivePage').hidden && byId('mwLivePage').dataset.view !== 'stage') feedback.scrollIntoView({ block: 'nearest' });
  };
  const modeFor = record => /^(mw-audio-live-|mw-conversation-audio-)/.test(record.room_name || '') ? 'audio' : 'video';

  function avatar(element, profile, fallback) {
    const initial = (profile?.display_name || fallback || 'M').slice(0, 1).toUpperCase();
    element.textContent = initial;
    if (!profile?.avatar_url) return;
    try {
      const address = new URL(profile.avatar_url, location.origin);
      if (!['https:', 'http:'].includes(address.protocol)) return;
      const image = document.createElement('img');
      image.src = window.MilkyWayMedia?.image(address.href, 160) || address.href;
      image.alt = '';
      image.addEventListener('error', () => { element.textContent = initial; });
      element.replaceChildren(image);
    } catch {}
  }

  function setMode(nextMode) {
    if (joining || room) return;
    stopPreview();
    mode = nextMode;
    delete byId('mwLivePage').dataset.entry;
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    byId('mwLiveSetup').hidden = false;
    byId('mwLiveStart').textContent = translate(mode === 'audio' ? 'startAudioLive' : 'startVideoLive');
  }

  function updateExitControl() {
    const button = byId('mwLivePage')?.querySelector('.mw-live-exit');
    if (!button) return;
    const label = translate(pendingEndSession ? 'retryLiveCleanup' : host && session ? 'endLive' : room ? 'leaveRoom' : 'back');
    button.textContent = label;
    button.setAttribute('aria-label', label);
  }

  // Viewer entry (Watch, the top LIVE pill, a shared link or a notification) hides the host "Go LIVE" setup.
  function open(options = {}) {
    const page = byId('mwLivePage');
    const sharedLink = /^#(mw-live-|live=)/.test(location.hash) && consumedHash !== location.hash;
    if (!room && !joining) { if (options.entry === 'viewer' || sharedLink) page.dataset.entry = 'viewer';else if (page.hidden) delete page.dataset.entry; }
    if (!page.hidden) return;
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    page.hidden = false;
    page.classList.add('open');
    page.scrollTop = 0;
    page.querySelector('[data-action="close"]').focus();
    // Warm the LiveKit SDK while the person looks at the list, so a tap on a Live or a seat connects at once.
    window.MilkyWayLoadLiveKit?.().catch(() => {});
    refresh();
    checkService().catch(() => {});
  }

  // One touch from any Live listing goes straight into the room as an audience member. Joining the
  // stage is a separate step through the 3D alien button.
  function watch(record) {
    if (!record?.room_name) return;
    const own = record.host_id === user?.id;
    open(own ? {} : { entry: 'viewer' });
    connect(own, record);
  }

  // The viewer sees the host and the stage immediately while the token and connection finish.
  function showJoining(record) {
    const stage = byId('mwLiveStage');
    byId('mwLiveLobby').hidden = true;stage.hidden = false;
    stage.dataset.role = 'viewer';stage.dataset.mode = modeFor(record);stage.dataset.joining = 'true';
    byId('mwLivePage').dataset.view = 'stage';byId('mwLivePage').scrollTop = 0;
    avatar(byId('mwLiveHostAvatar'), record.profile, record.host_name);
    avatar(byId('mwLiveAudioAvatar'), record.profile, record.host_name);
    delete byId('mwLiveHostName').dataset.mwI18n;byId('mwLiveHostName').textContent = record.profile?.display_name || record.host_name || translate('liveHost');
    byId('mwLiveBroadcastTitle').textContent = record.title || translate('liveSession');
    byId('mwLiveModeTag').textContent = modeFor(record) === 'audio' ? 'AUDIO LIVE' : 'VIDEO LIVE';
    byId('mwLiveMedia').hidden = true;byId('mwLiveAudioStage').hidden = false;
    byId('mwLiveMediaStatus').textContent = say('joiningLive');
    byId('mwLiveMic').hidden = true;byId('mwLiveCamera').hidden = true;
  }

  function reset() {
    byId('mwLivePage').dataset.view = 'lobby';
    delete byId('mwLiveStage').dataset.joining;
    byId('mwLiveSeats')?.replaceChildren();byId('mwLiveHearts')?.replaceChildren();
    byId('mwLiveLobby').hidden = false;
    byId('mwLiveStage').hidden = true;
    byId('mwLiveSettings').hidden = true;
    if (byId('mwLiveMenu')) byId('mwLiveMenu').hidden = true;
    closeStageSheets();
    if (byId('mwLiveRequestTrack')) byId('mwLiveRequestTrack').dataset.signature = '';
    if (byId('mwLiveSheetBackdrop')) byId('mwLiveSheetBackdrop').hidden = true;
    if (byId('mwLiveFollowHost')) byId('mwLiveFollowHost').hidden = true;
    if (byId('mwLiveShowComments')) byId('mwLiveShowComments').checked = true;
    byId('mwLiveComments').hidden = false;
    byId('mwLiveGuests').hidden = true;
    byId('mwLiveGuestButton').setAttribute('aria-expanded', 'false');
    byId('mwLiveCount').hidden = true;
    byId('mwLiveMedia').replaceChildren();
    byId('mwLiveRemoteAudio').replaceChildren();
    byId('mwLiveComments').replaceChildren();
    byId('mwLiveHostName').dataset.mwI18n = 'yourSpace';byId('mwLiveHostName').textContent = translate('yourSpace');
    byId('mwLiveHostAvatar').textContent = 'M';
    byId('mwLiveAudioOrbit').classList.remove('is-speaking');
    byId('mwLiveSetup').hidden = true;
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    mode = null;
    status('Not connected');
    paintListening();
    updateExitControl();
  }

  async function endRecord(record) {
    if (!record?.host_id) return;
    if (record.host_id !== user?.id) throw new Error(translate('liveCleanupHostRequired'));
    if (record.room_name.startsWith('mw-conversation-')) { await roomAction('end', {}, record);return; }
    const result = await sb.from('mw_video_live_sessions').update({ is_live: false, ended_at: new Date().toISOString() }).eq('room_name', record.room_name).eq('host_id', user.id);
    if (result.error) throw new Error('The session ended locally, but its listing could not be closed. Use “Close listing” after reconnecting.');
  }

  async function disconnect() {
    if (closing) return closing;
    if (!host && conversationRoom() && ['speaker', 'pending'].includes(roomState?.self.state)) roomAction('leave-stage').catch(() => {});
    generation++;
    clearTimeout(announcementTimer);announcementTimer = null;
    stopPreview();
    accessRequest?.abort();
    accessRequest = null;
    const endingRoom = room;
    const endingSession = session || pendingEndSession;
    const wasHost = host || !!pendingEndSession;
    if (wasHost) pendingEndSession = endingSession;
    window.clearInterval(roomPoll);roomPoll = null;roomState = null;roomChatSignature = '';pendingComment = null;
    byId('mwLiveGrid')?.querySelectorAll('.mw-stage-tile').forEach(clearTileVideos);
    byId('mwLiveGrid')?.replaceChildren();
    room = null;
    session = null;
    host = false;
    connectionAccountId = null;
    connectionSession = null;
    joining = false;
    soundEnabled = false;if (byId('mwLiveTapHear')) byId('mwLiveTapHear').hidden = true;
    soundRequest = null;
    for (const item of audioTracks.values()) {
      item.track.detach(item.element);
      item.element.pause();
      item.element.srcObject = null;
      item.element.remove();
    }
    audioTracks.clear();
    const cleanup = (async () => {
      let cleanupError = null;
      try {
        if (endingRoom) {
          if (wasHost && endingRoom.state === 'connected') {
            await endingRoom.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'mw-live-ended' })), { reliable: true }).catch(() => {});
          }
          await endingRoom.disconnect(true);
        }
      } catch (error) { cleanupError = error; }
      finally {
        endingRoom?.localParticipant?.trackPublications?.forEach(publication => { publication.track?.detach();publication.track?.stop(); });
      }
      try { if (wasHost) { await endRecord(endingSession);pendingEndSession = null; } }
      catch (error) { cleanupError = error; }
      try {
        if (cleanupError) message(cleanupError.message || 'Could not finish closing the session listing.', true);
      } finally {
        reset();
        byId('mwLiveStart').disabled = false;
      }
      return { clean: !cleanupError, error: cleanupError?.message };
    })();
    closing = cleanup;
    try { return await cleanup; }
    finally { if (closing === cleanup) closing = null; }
  }

  function hidePage() {
    const page = byId('mwLivePage');
    page.classList.remove('open');
    page.hidden = true;
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus();
  }

  async function close() {
    if (host && session && !(await window.MilkyWayDialog.confirm({ message: translate('confirmEndLive'), danger: true }))) return;
    const result = await disconnect();
    if (result?.clean === false) { refresh();message(result.error || translate('retry'), true);return; }
    hidePage();
    refresh();
  }

  function updateParticipants() {
    const participants = connected() ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
    byId('mwLiveCount').hidden = !room;
    paintCount(participants.length);
    byId('mwLiveCount').setAttribute('aria-label', `${say('watching')}: ${participants.length} ${say('viewerCount')}`);
    const list = byId('mwLiveParticipants');
    list.replaceChildren();delete list.dataset.signature;
    for (const participant of participants) {
      const row = document.createElement('div');
      row.className = 'mw-live-participant';
      row.textContent = `${participant.name || 'Participant'}${participant.identity === session?.host_id ? ' · Host' : ''}${participant.identity === user?.id ? ' · You' : ''}`;
      list.append(row);
    }
    if (conversationRoom()) { renderGrid();renderConversationParticipants(); }
    renderViewers();
  }
  function paintCount(total) {
    const count = byId('mwLiveCount');
    let label = String(total);
    try { label = new Intl.NumberFormat(document.documentElement.lang || undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(total); } catch {}
    if (count.dataset.label === label && count.querySelector('b')) return;
    count.dataset.label = label;
    count.innerHTML = `<span class="mwx-count-dot" aria-hidden="true"></span>${svg('eye')}<b></b>`;
    count.querySelector('b').textContent = label;
  }
  // TikTok-style viewer list: everyone connected right now, host first, then guests on stage, then viewers.
  const viewerProfiles = new Map();
  function viewerEntries() {
    if (!connected()) return [];
    const rank = { host: 0, guest: 1, viewer: 2 };
    return [room.localParticipant, ...room.remoteParticipants.values()].map(participant => {
      const member = roomState?.members.find(item => item.userId === participant.identity);
      const profile = viewerProfiles.get(participant.identity);
      return { id: participant.identity, member, self: participant.identity === user?.id, name: member?.name || profile?.display_name || participant.name || translate('participant'), avatar: member?.avatar || profile?.avatar_url || '', role: participant.identity === session?.host_id ? 'host' : member?.state === 'speaker' ? 'guest' : 'viewer' };
    }).sort((first, second) => rank[first.role] - rank[second.role] || first.name.localeCompare(second.name));
  }
  function renderViewers() {
    const panel = byId('mwLiveViewers');
    if (!panel || panel.hidden) return;
    const entries = viewerEntries();
    const list = byId('mwLiveViewerList');
    const signature = JSON.stringify([document.documentElement.lang, host, roomState?.settings.admission, entries.map(entry => [entry.id, entry.name, entry.avatar, entry.role, entry.member?.state])]);
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature;
    byId('mwLiveViewersTotal').textContent = `${entries.length} ${say('viewerCount')}`;
    list.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement('div');row.className = 'mwx-viewer';row.dataset.role = entry.role;
      const picture = document.createElement('span');picture.className = 'mw-live-avatar';avatar(picture, { avatar_url: entry.avatar }, entry.name);
      const text = document.createElement('div');text.className = 'mwx-viewer-text';
      const name = document.createElement('b');name.textContent = entry.name;
      const detail = document.createElement('small');detail.textContent = [say(entry.role), entry.self ? say('you') : '', entry.member?.state === 'pending' ? say('requested') : ''].filter(Boolean).join(' · ');
      text.append(name, detail);row.append(picture, text);
      if (host && conversationRoom() && entry.role === 'viewer' && !entry.self && entry.member && entry.member.state !== 'banned' && roomState?.settings.admission !== 'broadcast') row.append(controlButton('invite', 'approve', entry.id));
      list.append(row);
      if (!entry.avatar && !viewerProfiles.has(entry.id) && typeof getProfile === 'function') {
        viewerProfiles.set(entry.id, null);
        getProfile(entry.id).then(profile => { viewerProfiles.set(entry.id, profile || {});if (profile?.avatar_url || profile?.display_name) renderViewers(); }).catch(() => {});
      }
    }
    if (entries.length <= 1) { const empty = document.createElement('p');empty.className = 'muted mwx-viewers-empty';empty.textContent = say('noViewers');list.append(empty); }
  }
  // Host controls (taskbar): requests, people and layout in one sheet, so the host never leaves the stage.
  function renderHostPanel() {
    const button = byId('mwLiveHostControls');
    const available = host && conversationRoom() && connected() && !!roomState;
    if (button) button.hidden = !available;
    const panel = byId('mwLiveHostPanel');
    if (!panel) return;
    if (!available) { if (!panel.hidden) { panel.hidden = true;byId('mwLiveSheetBackdrop').hidden = true; } return; }
    const pending = roomState.members.filter(member => member.state === 'pending');
    if (button) button.dataset.pending = String(pending.length);
    if (panel.hidden) return;
    const settings = roomState.settings, layouts = window.MilkyWayLiveLayouts, broadcast = settings.admission === 'broadcast';
    const people = viewerEntries().filter(entry => !entry.self);
    const seats = Math.max(1, Math.min(20, settings.layout - 1)), style = layouts?.normalize(settings.layoutStyle) || 'fullscreen';
    const signature = JSON.stringify([document.documentElement.lang, settingsBusy, settings, pending.map(member => [member.userId, member.name, member.avatar]), people.map(entry => [entry.id, entry.name, entry.avatar, entry.role, entry.member?.state, entry.member?.hostMuted])]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    byId('mwLiveHostTitle').textContent = say('hostControls');byId('mwLiveHostHint').textContent = say('hostControlsHint');
    panel.querySelector('.mwx-sheet-close').textContent = say('close');
    for (const [identity, key] of [['mwLiveHostRequestsTitle', 'hostRequestsTitle'], ['mwLiveHostLayoutTitle', 'hostLayoutTitle'], ['mwLiveHostPeopleTitle', 'hostPeopleTitle']]) byId(identity).textContent = say(key);
    const command = (key, name, target, danger = false) => { const control = controlButton(name === 'ban' ? 'block' : name, name, target, danger);control.textContent = say(key);control.className = `mwx-host-cmd${danger ? ' is-danger' : ''}${name === 'approve' ? ' is-go' : ''}`;return control; };
    const person = (entry, detail) => {
      const row = document.createElement('div');row.className = 'mwx-host-row';row.dataset.role = entry.role;
      const picture = document.createElement('span');picture.className = 'mw-live-avatar';avatar(picture, { avatar_url: entry.avatar }, entry.name);
      const text = document.createElement('div');text.className = 'mwx-viewer-text';
      const name = document.createElement('b');name.textContent = entry.name;
      const small = document.createElement('small');small.textContent = detail;
      text.append(name, small);row.append(picture, text);
      const commands = document.createElement('div');commands.className = 'mwx-host-cmds';row.append(commands);
      return [row, commands];
    };
    // Requests: auto-accept switch, then each waiting viewer with Accept / Decline / Block.
    const requests = byId('mwLiveHostRequests');requests.replaceChildren();
    if (broadcast) { const note = document.createElement('p');note.className = 'muted';note.textContent = say('hostBroadcastOnly');requests.append(note); }
    else {
      for (const member of pending) {
        const [row, commands] = person({ id: member.userId, name: member.name, avatar: member.avatar, role: 'viewer' }, say('requested'));
        commands.append(command('hostAccept', 'approve', member.userId), command('hostDecline', 'reject', member.userId), command('hostBlock', 'ban', member.userId, true));
        requests.append(row);
      }
      if (!pending.length) { const note = document.createElement('p');note.className = 'muted mwx-viewers-empty';note.textContent = say('hostNoPending');requests.append(note); }
      else if (pending.length > 1) { const swipe = document.createElement('button');swipe.type = 'button';swipe.className = 'mwx-review-requests';swipe.textContent = `${say('hostSwipe')} (${pending.length})`;swipe.onclick = () => action('requests');requests.append(swipe); }
    }
    // Layout: every style as a one-tap chip, plus a seat stepper; both apply instantly to the running Live.
    const chips = byId('mwLiveHostLayouts');chips.replaceChildren();
    for (const name of layouts?.names || []) {
      const chip = document.createElement('button');chip.type = 'button';chip.className = 'mw-layout-trigger mwx-host-layout';chip.setAttribute('aria-pressed', String(name === style));chip.disabled = settingsBusy;
      layouts.paintTrigger(chip, name, layouts.pairOnly(name) ? 1 : seats);
      chip.querySelector('small')?.remove();
      chip.onclick = () => { if (name === style || settingsBusy) return;const next = layouts.pairOnly(name) ? 1 : seats;byId('mwLiveLayout').value = String(next);applyHostSettings?.({ layout: next + 1, layoutStyle: name }); };
      chips.append(chip);
    }
    byId('mwLiveHostSeatsLabel').textContent = say('hostSeats');byId('mwLiveHostSeatsValue').textContent = String(seats);
    const pairOnly = layouts?.pairOnly(style);
    byId('mwLiveHostSeatsLess').disabled = settingsBusy || pairOnly || seats <= 1;byId('mwLiveHostSeatsMore').disabled = settingsBusy || pairOnly || seats >= 20;
    byId('mwLiveHostMoreLayouts').textContent = say('hostMoreLayouts');
    // People: guests on stage (Mute / Remove / Block) and viewers (Invite / Block).
    const list = byId('mwLiveHostPeople');list.replaceChildren();
    for (const entry of people) {
      if (entry.role === 'host' || entry.member?.state === 'pending') continue;
      const guest = entry.role === 'guest';
      const [row, commands] = person(entry, guest ? say('hostOnStage') + (entry.member?.hostMuted ? ` · ${translate('hostMuted')}` : '') : say('viewer'));
      if (entry.member) {
        if (guest) commands.append(command(entry.member.hostMuted ? 'hostAllowMic' : 'hostMute', entry.member.hostMuted ? 'allow-mic' : 'mute', entry.id), command('hostRemove', 'remove', entry.id, true));
        else if (!broadcast) commands.append(command('hostInvite', 'approve', entry.id));
        commands.append(command('hostBlock', 'ban', entry.id, true));
      }
      list.append(row);
    }
    if (!list.children.length) { const note = document.createElement('p');note.className = 'muted mwx-viewers-empty';note.textContent = say('noViewers');list.append(note); }
    // A command that just ran is repainted away; keep keyboard focus inside the sheet.
    if (!document.activeElement || document.activeElement === document.body) panel.querySelector('.mwx-sheet-close').focus({ preventScroll: true });
  }
  // Host join-request slider: one card per waiting viewer, browsed by swiping (scroll snap) or the arrows.
  let requestIndex = 0;
  function renderRequests() {
    const panel = byId('mwLiveRequests');
    if (!panel || panel.hidden) return;
    const pending = (roomState?.members || []).filter(member => member.state === 'pending');
    const capacity = Math.max(1, (roomState?.settings.layout || 2) - 1);
    const filled = (roomState?.members || []).filter(member => member.state === 'speaker' && member.userId !== session?.host_id).length;
    byId('mwLiveRequestSeats').textContent = `${filled} / ${capacity} ${say('seatsFilled')}`;
    const track = byId('mwLiveRequestTrack');
    const signature = JSON.stringify(pending.map(member => [member.userId, member.name, member.avatar]));
    if (track.dataset.signature !== signature) {
      track.dataset.signature = signature;track.replaceChildren();
      pending.forEach((member, index) => {
        const card = document.createElement('article');card.className = 'mwx-req-card';card.dataset.user = member.userId;
        card.setAttribute('aria-roledescription', 'slide');card.setAttribute('aria-label', `${index + 1} / ${pending.length} · ${member.name}`);
        const picture = document.createElement('span');picture.className = 'mw-live-avatar mwx-req-avatar';avatar(picture, { avatar_url: member.avatar }, member.name);
        const name = document.createElement('b');name.textContent = member.name;
        const note = document.createElement('small');note.textContent = say('requested');
        const buttons = document.createElement('div');buttons.className = 'mwx-req-actions';
        for (const [key, verb] of [['decline', 'reject'], ['accept', 'approve']]) {
          const button = document.createElement('button');button.type = 'button';button.className = `mwx-req-${key}`;button.textContent = say(key);
          button.onclick = async () => {
            buttons.querySelectorAll('button').forEach(item => { item.disabled = true; });
            try { await roomAction(verb, { target: member.userId });await pollRoom(); }
            catch (error) { message(error.message, true);buttons.querySelectorAll('button').forEach(item => { item.disabled = false; }); }
          };
          buttons.append(button);
        }
        card.append(picture, name, note, buttons);track.append(card);
      });
    }
    byId('mwLiveRequestEmpty').hidden = pending.length > 0;
    panel.querySelector('.mwx-req-nav').hidden = pending.length < 2;
    requestIndex = Math.max(0, Math.min(requestIndex, pending.length - 1));
    paintRequestPosition();
  }
  function paintRequestPosition() {
    const cards = [...byId('mwLiveRequestTrack').children];
    byId('mwLiveRequestPosition').textContent = cards.length ? `${requestIndex + 1} / ${cards.length}` : '';
    const dots = byId('mwLiveRequestDots');
    if (dots.childElementCount !== cards.length) dots.replaceChildren(...cards.map(() => document.createElement('span')));
    [...dots.children].forEach((dot, index) => dot.classList.toggle('is-on', index === requestIndex));
    byId('mwLiveRequestPrev').disabled = requestIndex <= 0;byId('mwLiveRequestNext').disabled = requestIndex >= cards.length - 1;
  }
  function showRequest(index, smooth = true) {
    const track = byId('mwLiveRequestTrack'), card = track.children[index];
    if (!card) return;
    requestIndex = index;paintRequestPosition();
    const offset = card.getBoundingClientRect().left - track.getBoundingClientRect().left - (track.clientWidth - card.offsetWidth) / 2;
    track.scrollBy({ left: offset, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  }
  function closeStageSheets(except = '') {
    for (const identity of ['mwLiveMenu', 'mwLiveSettings', 'mwLiveGuests', 'mwLiveViewers', 'mwLiveRequests', 'mwLiveHostPanel']) if (identity !== except && byId(identity)) byId(identity).hidden = true;
    byId('mwLiveCount')?.setAttribute('aria-expanded', String(except === 'mwLiveViewers'));
  }

  function syncMedia() {
    if (conversationRoom()) {
      byId('mwLiveMedia').hidden = true;byId('mwLiveAudioStage').hidden = true;
      if (room) { byId('mwLiveMic').setAttribute('aria-pressed', String(room.localParticipant.isMicrophoneEnabled));byId('mwLiveMic').setAttribute('aria-label', translate(room.localParticipant.isMicrophoneEnabled ? 'muteMicrophone' : 'unmuteMicrophone'));byId('mwLiveCamera').setAttribute('aria-pressed', String(room.localParticipant.isCameraEnabled));byId('mwLiveCamera').setAttribute('aria-label', translate(room.localParticipant.isCameraEnabled ? 'turnCameraOff' : 'turnCameraOn'));renderGrid(); }
      return;
    }
    const participant = room ? host ? room.localParticipant : room.remoteParticipants.get(session?.host_id) : null;
    const hasVideo = !!byId('mwLiveMedia').querySelector('video') && participant?.isCameraEnabled;
    byId('mwLiveMedia').hidden = mode !== 'video' || !hasVideo;
    byId('mwLiveAudioStage').hidden = mode === 'video' && hasVideo;
    byId('mwLiveMediaStatus').textContent = mode === 'audio' ? 'MICROPHONE-ONLY BROADCAST' : 'Waiting for the host’s camera';
    if (!room) return;
    if (mode === 'audio' && participant) byId('mwLiveMediaStatus').textContent = participant.isMicrophoneEnabled ? 'MICROPHONE-ONLY BROADCAST' : 'HOST MICROPHONE MUTED';
    byId('mwLiveMic').setAttribute('aria-pressed', String(room.localParticipant.isMicrophoneEnabled));
    byId('mwLiveMic').setAttribute('aria-label', room.localParticipant.isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone');
    byId('mwLiveCamera').setAttribute('aria-pressed', String(room.localParticipant.isCameraEnabled));
    byId('mwLiveCamera').setAttribute('aria-label', room.localParticipant.isCameraEnabled ? 'Turn camera off' : 'Turn camera on');
  }

  function attachTrack(track, participant) {
    if (!track || !room || !conversationRoom() && participant.identity !== session?.host_id) return;
    if (conversationRoom() && track.kind === 'video') { renderGrid();return; }
    if (track.kind === 'video' && mode === 'video') {
      byId('mwLiveMedia').querySelectorAll('video').forEach(element => { element.srcObject = null; element.remove(); });
      const video = track.attach();
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.dataset.trackSid = track.sid || '';
      video.setAttribute('aria-label', 'Host live video');
      if (host) video.classList.add('mw-live-local');
      byId('mwLiveMedia').append(video);
      video.play().catch(() => message('Tap the broadcast to resume video playback.'));
      syncMedia();
    }
    if (track.kind === 'audio' && participant !== room.localParticipant && (conversationRoom() || !host) && !audioTracks.has(track.sid)) {
      const element = track.attach();
      element.autoplay = true;
      element.muted = !soundEnabled;
      element.volume = Number(byId('mwLiveVolume').value) / 100;
      byId('mwLiveRemoteAudio').append(element);
      audioTracks.set(track.sid, { track, element });
      const activeRoom = room;
      element.play().catch(() => {
        if (room !== activeRoom || audioTracks.get(track.sid)?.element !== element) return;
        soundEnabled = false;paintListening();if (!armTapToHear()) message(translate('liveListeningBlocked'), true);
      });
    }
  }

  function detachTrack(track) {
    const audio = audioTracks.get(track.sid);
    if (audio) {
      track.detach(audio.element);
      audio.element.pause();
      audio.element.srcObject = null;
      audio.element.remove();
      audioTracks.delete(track.sid);
    } else track.detach().forEach(element => element.remove());
    syncMedia();
  }

  function commentRow(name, text, system = false, picture = '') {
    const row = document.createElement('div');
    row.className = `mw-live-comment${system ? ' mw-live-system' : ''}`;
    if (!system) { const face = document.createElement('span');face.className = 'mw-live-avatar mwx-comment-avatar';avatar(face, { avatar_url: picture }, name);row.append(face); }
    const body = document.createElement('p');
    const author = document.createElement('b');
    author.textContent = String(name || 'Participant').slice(0, 80);
    const content = document.createElement('span');
    content.textContent = String(text).slice(0, 500);
    body.append(author, content);row.append(body);
    return row;
  }
  function appendComment(name, text, reaction = false) {
    if (reaction) { floatHeart();return; }
    const list = byId('mwLiveComments');
    list.querySelector('p.muted')?.remove();
    list.append(commentRow(name, text));
    while (list.children.length > 120) list.firstElementChild.remove();
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }

  // live-in-feed.js listens for this to carry the viewer straight on to the next ongoing Live.
  function announceHostEnded() {
    if (session?.room_name) window.dispatchEvent(new CustomEvent('mw-live-host-ended', { detail: { room_name: session.room_name } }));
  }

  function receiveData(payload, participant) {
    if (!participant || payload.byteLength > 4096) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      if (data.type === 'mw-live-ended' && participant.identity === session?.host_id && !host) {
        message('The host ended this Live.');
        announceHostEnded();
        disconnect();
      } else if (data.type === 'mw-live-comment' && typeof data.message === 'string') appendComment(participant.name, data.message);
      else if (data.type === 'mw-live-reaction' && data.reaction === 'heart') appendComment(participant.name, 'sent a heart', true);
      else if (data.type === 'mw-live-sync' && conversationRoom()) requestSync();
    } catch {}
  }

  async function publish(data) {
    if (!connected()) throw new Error('Connect to Live before sending.');
    if (conversationRoom()) {
      const text = data.type === 'mw-live-reaction' ? translate('heartReaction') : data.message;
      if (!pendingComment || pendingComment.text !== text) pendingComment = { text, id: crypto.randomUUID() };
      await roomAction('message', { id: pendingComment.id, message: text, reaction: data.type === 'mw-live-reaction' });pendingComment = null;
      // A lightweight data ping lets every connected client fetch the new comment immediately instead of waiting for the next poll.
      if (room.localParticipant.permissions?.canPublishData !== false) room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: 'mw-live-sync' })), { reliable: false }).catch(() => {});
      await pollRoom();return;
    }
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(data)), { reliable: true });
  }

  async function requestAccess(authSession, body, retry = true) {
    const controller = new AbortController();
    accessRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const conversation = body.room?.startsWith('mw-conversation-');
      let state = {};
      const requestHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}`, apikey: sb.supabaseKey || '' };
      if (conversation) {
        const prepared = await fetch('/.netlify/functions/milkyway-room', { method: 'POST', signal: controller.signal, headers: requestHeaders, body: JSON.stringify({ room: body.roomName, action: 'token', layout: Number(byId('mwLiveSeatCount').value) + 1, admission: byId('mwLiveAutoAccept')?.checked ? 'direct' : 'approval', liveType: byId('mwLiveAllowRequests').checked ? 'conversation' : 'broadcast', layoutStyle: window.MilkyWayLiveLayouts?.setup().style || 'fullscreen', hostPosition: window.MilkyWayLiveLayouts?.setup().hostPosition || 'start' }) });
        state = await prepared.json().catch(() => { throw new Error(translate('liveInvalidResponse')); });
        if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error(translate('liveInvalidResponse'));
        if (prepared.status === 401 && retry) {
          const refreshed = await sb.auth.refreshSession();
          if (!refreshed.error && refreshed.data.session?.user.id === user?.id) return requestAccess(refreshed.data.session, body, false);
        }
        if (!prepared.ok) throw Object.assign(new Error(state.error || 'Live room authorization failed.'), { status: prepared.status });
        if (state.roomName !== body.roomName) throw new Error('The room authorization returned a different room.');
        if (!state.settings || !Number.isInteger(state.settings.layout) || !['approval', 'direct', 'broadcast'].includes(state.settings.admission) || state.self?.userId !== body.identity) throw new Error(translate('liveInvalidResponse'));
      }
      // The room authorization already carries a signed token when the site holds LiveKit credentials, so joining takes one round trip.
      const signed = conversation && typeof state.token === 'string' && state.token && typeof state.serverUrl === 'string';
      const response = signed ? { ok: true, status: 200 } : await fetch(tokenEndpoint, { method: 'POST', signal: controller.signal, headers: requestHeaders, body: JSON.stringify(conversation ? { action: 'token', roomName: body.roomName } : { ...body, action: 'token' }) });
      let payload = signed ? { token: state.token, serverUrl: state.serverUrl, roomName: state.roomName } : null;
      if (!signed) {
        try { payload = await response.json(); }
        catch { if (response.ok) throw new Error('The token service returned an invalid response. Contact the administrator.'); }
      }
      if (response.status === 401 && retry) {
        const refreshed = await sb.auth.refreshSession();
        if (!refreshed.error && refreshed.data.session?.user.id === user?.id) return requestAccess(refreshed.data.session, body, false);
      }
      if (response.status === 401) throw new Error('Your sign-in expired. Sign in again before starting Live.');
      if (!response.ok && typeof payload?.error === 'string' && payload.error.length <= 500) throw new Error(window.MilkyWayI18n?.text(payload.error) || payload.error);
      if (response.status === 403) throw new Error('The token service denied access to this Live room. Check your account and audience permissions.');
      if (response.status === 503) throw new Error('The Live token service is unavailable. The administrator must check server-side LiveKit credentials and room access policies.');
      if (!response.ok) throw new Error(`The secure token service could not authorize Live (HTTP ${response.status}). Try again or contact the administrator.`);
      if (payload?.roomName !== body.roomName) throw new Error('The token service returned a different room. Contact the administrator.');
      if (typeof payload?.token !== 'string' || !payload.token.trim() || typeof payload.serverUrl !== 'string' || !payload.serverUrl.trim()) throw new Error('The token service did not return a LiveKit server URL and token. Contact the administrator.');
      let address;
      try { address = new URL(payload.serverUrl); }
      catch { throw new Error('The token service returned an invalid LiveKit server URL. Contact the administrator.'); }
      if (address.protocol !== 'wss:' || address.username || address.password || address.pathname !== '/' || address.search || address.hash || address.origin !== serverUrl) throw new Error('The token service returned an invalid LiveKit server URL. Contact the administrator.');
      return { ...state, ...payload };
    } finally {
      window.clearTimeout(timeout);
      if (accessRequest === controller) accessRequest = null;
    }
  }

  function stopPreview() {
    previewGeneration++;
    cancelAnimationFrame(previewFrame);
    previewFrame = null;
    previewContext?.close().catch(() => {});
    previewContext = null;
    for (const track of previewTracks) { track.detach(); track.stop(); }
    previewTracks = [];
    byId('mwLivePreviewVideo').srcObject = null;
    byId('mwLivePreview').hidden = true;
    byId('mwLiveMicLevel').value = 0;
  }

  async function captureTracks(selectedMode, onPhase) {
    const sdk = await window.MilkyWayLoadLiveKit?.().catch(() => null) || window.LivekitClient || window.LiveKitClient;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !sdk?.createLocalAudioTrack) throw new Error('Device access requires HTTPS and the loaded LiveKit SDK. Open Preview in a separate tab.');
    const tracks = [];
    try {
      onPhase('microphone');
      tracks.push(await sdk.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }));
      if (selectedMode === 'video') {
        onPhase('camera');
        tracks.push(await sdk.createLocalVideoTrack({ facingMode: 'user' }));
      }
      for (const track of tracks) {
        if (track.mediaStreamTrack?.readyState !== 'live') throw new Error('The device did not provide a live media track. Check that another app is not using it.');
      }
      return tracks;
    } catch (error) { tracks.forEach(track => track.stop()); throw error; }
  }

  async function preview() {
    if (joining || room) return;
    if (!mode) { message('Choose Video Live or Audio Live first.', true); return; }
    stopPreview();
    const attempt = previewGeneration;
    let phase = 'microphone';
    byId('mwLivePreviewButton').disabled = true;
    try {
      const tracks = await captureTracks(mode, next => { phase = next; message(`Checking ${next}…`); });
      if (attempt !== previewGeneration) { tracks.forEach(track => track.stop()); return; }
      previewTracks = tracks;
      const camera = tracks.find(track => track.kind === 'video');
      byId('mwLivePreviewVideo').hidden = !camera;
      if (camera) camera.attach(byId('mwLivePreviewVideo'));
      byId('mwLivePreview').hidden = false;
      byId('mwLivePreviewStatus').textContent = 'Microphone captured. Speak to check the input level. Nothing is broadcast yet.';
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        previewContext = new AudioContext();
        await previewContext.resume();
        if (attempt !== previewGeneration) return;
        const analyser = previewContext.createAnalyser();
        analyser.fftSize = 256;
        previewContext.createMediaStreamSource(new MediaStream([tracks[0].mediaStreamTrack])).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const measure = () => {
          if (attempt !== previewGeneration) return;
          analyser.getFloatTimeDomainData(samples);
          byId('mwLiveMicLevel').value = Math.min(1, Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) * 5);
          previewFrame = requestAnimationFrame(measure);
        };
        measure();
      }
      message('Devices ready. Start Live when you are ready.');
    } catch (error) { if (attempt === previewGeneration) { stopPreview(); message(startError(error, phase), true); } }
    finally { byId('mwLivePreviewButton').disabled = false; }
  }

  function startError(error, phase) {
    if (phase === 'microphone' || phase === 'camera') {
      const device = phase === 'microphone' ? 'Microphone' : 'Camera';
      if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)) return `${device} permission was denied. Allow access in your browser's site settings. If Preview blocks access, open this page in a separate tab and try again.`;
      if (['NotFoundError', 'DevicesNotFoundError'].includes(error.name)) return `${device} not found. Connect or enable the device and try again.`;
      if (['NotReadableError', 'TrackStartError'].includes(error.name)) return `${device} could not be opened. Close other apps using it and try again.`;
      return `${device} could not start. Check the device, browser permissions, and Preview access, then try again.`;
    }
    if (phase === 'connection') return 'Could not connect to LiveKit. Check your network and the server-side LiveKit URL, then try again.';
    if (phase === 'token' && ['AbortError', 'TimeoutError'].includes(error.name)) return 'The Live token request timed out after 30 seconds. Check your connection and try again.';
    if (phase === 'token' && error instanceof TypeError) return 'Could not reach the Live token service. Check your connection and the token endpoint/CORS configuration.';
    if (phase === 'token' && error instanceof SyntaxError) return 'The token service returned an invalid response. Contact the administrator.';
    return error.message || 'Live could not start. Please try again.';
  }

  async function connect(asHost, record = null) {
    if (joining || closing) return;
    if (pendingEndSession) { message(translate('liveCleanupPending'), true);return; }
    if (!requireLogin('kujiunga na Live')) {
      hidePage();
      byId('authEmail')?.focus();
      // A guest who tapped Watch is taken into that Live right after signing in.
      if (!asHost && record) { pendingWatch = record;toast(say('signInToWatch')); }
      else message('Sign in to your MilkyWay account, then reopen LIVE to start your broadcast.', true);
      return;
    }
    if (room) {
      if (session?.id === record?.id) return open();
      message('Leave your current Live before joining another session.', true);
      return;
    }
    if (asHost && !mode && !record) { message('Choose Video Live or Audio Live first.', true); return; }
    if (window.MilkyWayCalls?.isActive()) { message('Finish your DM call before joining Live.', true); return; }
    joining = true;
    connectionAccountId = user.id;
    const attempt = ++generation;
    const selectedMode = record ? modeFor(record) : mode;
    mode = selectedMode;
    byId('mwLiveStart').disabled = true;
    if (!asHost && record) showJoining(record);
    status('Connecting…');
    message(asHost ? 'Requesting secure access…' : '');
    let connectingRoom = null;
    let createdRecord = null;
    let phase = 'preflight';
    let capturedTracks = [];
    try {
      if (asHost) {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Live broadcasting requires an HTTPS page and a browser with microphone/camera support. Open the secure Preview in a separate tab.');
        const policy = document.permissionsPolicy || document.featurePolicy;
        if (policy?.allowsFeature && !policy.allowsFeature('microphone')) throw new Error('This Preview blocks microphone access. Open the page in a separate tab that allows microphone access and try again.');
        if (selectedMode === 'video' && policy?.allowsFeature && !policy.allowsFeature('camera')) throw new Error('This Preview blocks camera access. Open the page in a separate tab that allows camera access and try again.');
      }
      const authSession = (await sb.auth.getSession()).data.session;
      if (!authSession?.access_token) throw new Error('Your sign-in expired. Please sign in again.');
      connectionSession = authSession;
      // The LiveKit SDK, the host's profile and the token request all start together instead of one after another.
      const sdkLoading = window.MilkyWayLoadLiveKit?.().catch(() => null) || Promise.resolve(null);
      const profileLoading = record?.host_id ? getProfile(record.host_id).catch(() => null) : null;
      if (!record && asHost) await checkService().catch(() => {});
      const conversationsReady = record || !asHost || serviceState?.available === true || !['configuration_missing', 'configuration_invalid', 'provider_authentication', 'provider_unavailable', 'platform_restricted', 'endpoint_missing'].includes(serviceState?.reason);
      if (generation !== attempt) return;
      if (!conversationsReady) throw new Error(translate(serviceState?.reason === 'configuration_invalid' ? 'liveConfigurationInvalid' : serviceState?.reason === 'configuration_missing' ? 'liveConfigurationMissing' : 'liveConfigurationNetwork'));
      if (asHost) {
        stopPreview();
        capturedTracks = await captureTracks(selectedMode, next => { phase = next; message(`Allow ${next} access to prepare Live…`); });
        if (generation !== attempt) return;
      }
      const roomName = record?.room_name || `mw-conversation-${mode}-${crypto.randomUUID()}`;
      const title = record?.title || byId('mwLiveTitle').value.trim() || `${mode === 'audio' ? 'Audio' : 'Video'} Live`;
      const scope = record?.scope || byId('mwLiveScope').value;
      if (asHost && !record) {
        const row = { room_name: roomName, host_id: user.id, host_name: nameOf(), title, scope, is_live: true, started_at: new Date().toISOString(), ended_at: null };
        const saved = await sb.from('mw_video_live_sessions').insert(row).select('id').single();
        if (saved.error) throw new Error('The room could not be saved. Check live-session access permissions.');
        createdRecord = { ...row, id: saved.data.id };record = createdRecord;session = createdRecord;host = true;
        if (generation !== attempt) { await endRecord(createdRecord);return; }
      }
      phase = 'token';
      const payload = await requestAccess(authSession, { room: roomName, roomName, identity: user.id, name: nameOf(), participantName: nameOf(), role: asHost ? 'host' : 'viewer', title, scope });
      roomState = payload.settings ? { settings: payload.settings, self: payload.self, members: [payload.self], messages: [] } : null;
      if (generation !== attempt) return;
      const sdk = await sdkLoading || window.LivekitClient || window.LiveKitClient;
      if (!sdk?.Room) throw new Error('LiveKit did not load. Check your connection and retry.');
      if (generation !== attempt) return;
      connectingRoom = new sdk.Room({ adaptiveStream: true, dynacast: true });
      room = connectingRoom;
      host = asHost;
      session = record || { room_name: roomName, host_id: user.id, host_name: nameOf(), title, scope };
      updateExitControl();
      const event = sdk.RoomEvent;
      connectingRoom.on(event.TrackSubscribed, (track, publication, participant) => { if (room === connectingRoom) attachTrack(track, participant); });
      connectingRoom.on(event.TrackUnsubscribed, track => { if (room === connectingRoom) detachTrack(track); });
      connectingRoom.on(event.LocalTrackPublished, publication => { if (room === connectingRoom) attachTrack(publication.track, connectingRoom.localParticipant); });
      connectingRoom.on(event.LocalTrackUnpublished, publication => { if (room === connectingRoom && publication.track) detachTrack(publication.track); });
      connectingRoom.on(event.TrackMuted, syncMedia);
      connectingRoom.on(event.TrackUnmuted, syncMedia);
      connectingRoom.on(event.ParticipantConnected, participant => { updateParticipants();if (!joining) { toast(`${participant.name || translate('participant')} · ${translate('joinedRoom')}`);if (localStorage.getItem('mw_notify_sound') !== 'off') playNotificationSound(); }pollRoom(); });
      connectingRoom.on(event.ParticipantDisconnected, participant => {
        if (room !== connectingRoom) return;
        updateParticipants();
        toast(`${participant.name || translate('participant')} · ${translate('leftRoom')}`);pollRoom();
        if (participant.identity === session?.host_id && !host) { message('The host disconnected.');announceHostEnded();disconnect(); }
      });
      connectingRoom.on(event.ActiveSpeakersChanged, speakers => { byId('mwLiveAudioOrbit').classList.toggle('is-speaking', speakers.some(participant => participant.identity === session?.host_id));byId('mwLiveGrid').querySelectorAll('[data-identity]').forEach(tile => tile.classList.toggle('is-speaking', speakers.some(participant => participant.identity === tile.dataset.identity))); });
      connectingRoom.on(event.DataReceived, receiveData);
      connectingRoom.on(event.ParticipantPermissionsChanged, () => { if (room === connectingRoom) pollRoom(); });
      connectingRoom.on(event.ConnectionStateChanged, state => {
        if (room !== connectingRoom) return;
        status(state === 'connected' ? joining ? 'Connected · Preparing Live…' : 'Live · Connected' : state === 'reconnecting' ? 'Reconnecting…' : state === 'connecting' ? 'Connecting…' : 'Disconnected');
        updateParticipants();
      });
      connectingRoom.on(event.Disconnected, () => {
        if (room !== connectingRoom) return;
        if (joining) return;
        message('Live connection ended. Rejoin to continue.', true);
        disconnect();
      });
      phase = 'connection';
      message('Connecting to LiveKit…');
      await connectingRoom.connect(payload.serverUrl, payload.token);
      if (generation !== attempt) { await connectingRoom.disconnect(true); return; }
      if (!soundEnabled) toggleSound().catch(() => {});
      if (asHost) {
        phase = 'publication';
        if (connectingRoom.localParticipant.permissions?.canPublish === false) throw new Error('The server issued a viewer token to the host. Deploy the corrected token function before broadcasting.');
        for (const track of capturedTracks) {
          message(`Publishing ${track.kind === 'audio' ? 'microphone' : 'camera'}…`);
          const publication = await connectingRoom.localParticipant.publishTrack(track, { source: track.kind === 'audio' ? sdk.Track.Source.Microphone : sdk.Track.Source.Camera });
          if (!publication?.trackSid || track.mediaStreamTrack.readyState !== 'live') throw new Error('LiveKit did not confirm a live published track. Check publishing permissions and your devices.');
          attachTrack(track, connectingRoom.localParticipant);
        }
      }
      if (generation !== attempt) { await connectingRoom.disconnect(true); return; }
      phase = 'connection';
      if (connectingRoom.state !== 'connected') throw new Error('Live disconnected while starting.');
      phase = 'profile';
      const profile = await (session.host_id === record?.host_id && profileLoading || getProfile(session.host_id).catch(() => null));
      if (generation !== attempt) { await connectingRoom.disconnect(true); return; }
      avatar(byId('mwLiveHostAvatar'), profile, session.host_name);
      avatar(byId('mwLiveAudioAvatar'), profile, session.host_name);
      delete byId('mwLiveHostName').dataset.mwI18n;byId('mwLiveHostName').textContent = profile?.display_name || session.host_name || translate('liveHost');
      byId('mwLiveFollowHost').hidden = asHost;
      if (!asHost) refreshFollowButton(session.host_id, byId('mwLiveFollowHost')).catch(() => {}); else delete byId('mwLiveFollowHost').dataset.follow;
      byId('mwLiveBroadcastTitle').textContent = title;
      byId('mwLiveModeTag').textContent = selectedMode === 'audio' ? 'AUDIO LIVE' : 'VIDEO LIVE';
      byId('mwLiveLobby').hidden = true;
      byId('mwLiveStage').hidden = false;
      delete byId('mwLiveStage').dataset.joining;
      byId('mwLiveStage').dataset.role = asHost ? 'host' : 'viewer';byId('mwLiveStage').dataset.mode = selectedMode;
      byId('mwLivePage').dataset.view = 'stage';
      byId('mwLivePage').scrollTop = 0;
      byId('mwLiveMic').hidden = !asHost;
      byId('mwLiveCamera').hidden = !asHost || selectedMode === 'audio';
      byId('mwLiveSound').hidden = asHost && !conversationRoom();
      byId('mwLiveSound').setAttribute('aria-pressed', 'false');
      byId('mwLiveComments').innerHTML = `<p class="muted mw-live-system">${translate('liveWelcome')}</p>`;reactionIds.clear();
      connectingRoom.remoteParticipants.forEach(participant => participant.trackPublications.forEach(publication => { if (publication.track) attachTrack(publication.track, participant); }));
      connectingRoom.localParticipant.videoTrackPublications.forEach(publication => { if (publication.track) attachTrack(publication.track, connectingRoom.localParticipant); });
      syncMedia();
      updateParticipants();
      status('Live · Connected');
      message('');
      if (!soundEnabled) await toggleSound().catch(() => {});
      if (generation !== attempt || room !== connectingRoom || connectingRoom.state !== 'connected') return;
      if (asHost) {
        const row = { room_name: roomName, host_id: user.id, host_name: nameOf(), title, scope, is_live: true, started_at: record?.started_at || new Date().toISOString(), ended_at: null };
        const saved = record?.id ? await sb.from('mw_video_live_sessions').update(row).eq('id', record.id).eq('host_id', user.id).select('id').single() : await sb.from('mw_video_live_sessions').insert(row).select('id').single();
        if (saved.error) {
          if (generation === attempt) message('Connected, but this broadcast could not be listed. Check mw_video_live_sessions permissions.', true);
        } else {
          createdRecord = { ...row, id: saved.data.id };
          if (generation !== attempt) await endRecord(createdRecord);
          else { session = createdRecord; refresh(); }
        }
      } else session = record;
      if (conversationRoom()) { await pollRoom();roomPoll = window.setInterval(() => { if (document.visibilityState !== 'hidden') pollRoom(); }, syncInterval); }
      if (asHost && conversationRoom() && connected()) {
        await roomAction('started');
        const announcedRoom = session.room_name;
        let retries = 0;
        const announce = async () => {
          if (!connected() || !host || session?.room_name !== announcedRoom) return;
          try {
            const result = await window.MilkyWayLiveNotifications.api('live-started', { room: announcedRoom });
            if (!result.complete) announcementTimer = setTimeout(announce, 1000);
          } catch {
            // Follower alerts retry quietly; a failed announcement never interrupts the Live with a banner.
            if (++retries < 5) announcementTimer = setTimeout(announce, Math.min(60000, 5000 * 2 ** retries));
          }
        };
        announcementTimer = setTimeout(announce, 5500);
      }
    } catch (error) {
      if (generation === attempt) {
        await disconnect();
        // Viewers stay in the audience list; only hosts go back to the broadcast setup.
        if (asHost) setMode(selectedMode);
        else byId('mwLivePage').dataset.entry = 'viewer';
        message(asHost ? startError(error, phase) : `${say('joinFailed')} ${startError(error, phase)}`, true);
      } else if (connectingRoom) await connectingRoom.disconnect(true).catch(() => {});
    } finally {
      if (!connected() || generation !== attempt) capturedTracks.forEach(track => track.stop());
      if (generation === attempt) { joining = false; byId('mwLiveStart').disabled = false; }
    }
  }

  function paintTaskbar() {
    const taskbar = byId('mwLiveTaskbar');
    if (!taskbar) return;
    taskbar.setAttribute('aria-label', say('taskbar'));
    // Captions render from an attribute so the page-wide translators cannot rewrite them into other phrases.
    taskbar.querySelectorAll('.mwx-tb-label').forEach(caption => { caption.dataset.text = say(caption.dataset.label); });
    const settings = byId('mwLiveMenuTrigger');
    if (settings) { settings.setAttribute('aria-label', say('tbSettingsLong'));settings.title = settings.getAttribute('aria-label'); }
  }

  function paintListening() {
    for (const item of audioTracks.values()) item.element.muted = !soundEnabled;
    if (soundEnabled && byId('mwLiveTapHear')) byId('mwLiveTapHear').hidden = true;
    const button = byId('mwLiveSound');
    if (button) {
      button.setAttribute('aria-pressed', String(soundEnabled));
      button.setAttribute('aria-label', translate(soundEnabled ? 'muteSound' : 'enableSound'));
      button.title = button.getAttribute('aria-label');
    }
    for (const id of ['mwLiveAudioNotice', 'mwLiveListeningHint']) {
      const notice = byId(id);
      if (notice) { notice.dataset.mwI18n = soundEnabled ? 'liveListeningEnabled' : 'liveListeningMuted';notice.textContent = translate(notice.dataset.mwI18n); }
    }
  }

  // Open viewing: if the browser blocks autoplay sound, the first tap anywhere on the stage turns it on.
  function armTapToHear() {
    const stage = byId('mwLiveStage');
    if (!stage || !connected()) return false;
    let chip = byId('mwLiveTapHear');
    if (!chip) { chip = document.createElement('button');chip.type = 'button';chip.id = 'mwLiveTapHear';chip.className = 'mwx-tap-hear';stage.append(chip); }
    chip.innerHTML = `${svg('volume')}<span>${say('tapToHear')}</span>`;chip.hidden = false;
    if (stage.mwxHearArmed) return true;
    stage.mwxHearArmed = true;
    const unlock = () => { stage.mwxHearArmed = false;stage.removeEventListener('pointerdown', unlock, true);chip.hidden = true;if (!soundEnabled) toggleSound().catch(() => {}); };
    stage.addEventListener('pointerdown', unlock, true);
    return true;
  }
  async function toggleSound() {
    if (soundRequest) return soundRequest;
    if (!connected()) return;
    const activeRoom = room;
    const enable = !soundEnabled;
    const operation = (async () => {
      try {
        if (enable) {
          await activeRoom.startAudio();
          if (activeRoom !== room) return;
          const tracks = [...audioTracks.values()];
          tracks.forEach(item => { item.element.muted = false; });
          await Promise.all(tracks.map(item => item.element.play()));
          if (activeRoom !== room) return;
        }
        soundEnabled = enable;paintListening();
      } catch {
        if (activeRoom !== room) return;
        soundEnabled = false;paintListening();if (!armTapToHear()) message(translate('liveListeningBlocked'), true);
      }
    })();
    soundRequest = operation;
    try { return await operation; }
    finally { if (soundRequest === operation) soundRequest = null; }
  }

  function sessionCard(record, history = false, legacy = false) {
    const article = document.createElement('article');
    article.className = 'mw-live-session';
    const photo = document.createElement('div');photo.className = 'mw-live-avatar';avatar(photo, record.profile, record.host_name);article.append(photo);
    if (!history && record.verified) { const badge = document.createElement('span');badge.className = 'mw-discovery-live-badge';badge.textContent = 'LIVE';article.append(badge); }
    const info = document.createElement('div');
    info.className = 'mw-live-session-info';
    const title = document.createElement('strong');
    title.textContent = record.title || translate('liveSession');
    const detail = document.createElement('small');
    const stamp = record.started_at || record.created_at;
    detail.textContent = `${record.profile?.display_name || record.host_name || translate('liveHost')}${record.profile?.username ? ' · @' + record.profile.username : ''} · ${translate(legacy || modeFor(record) === 'audio' ? 'audioMode' : 'videoMode')}${history && stamp ? ` · ${new Date(stamp).toLocaleString(window.MilkyWayI18n?.language() || 'en')}` : ''}${legacy ? ' · ' + translate('previousAudioEngine') : ''}`;
    if (!history && (!record.verified || Number.isInteger(record.connectedCount))) detail.append(document.createTextNode(record.verified ? ` · ${record.connectedCount} ${translate('connectedParticipants')}` : ` · ${translate('unverifiedListing')}`));
    if (history && record.ended_at && stamp) {
      const duration = Math.max(0, Math.round((new Date(record.ended_at) - new Date(stamp)) / 1000));
      detail.append(document.createTextNode(` · ${translate(record.lifecycleStatus === 'failed' ? 'failed' : record.lifecycleStatus === 'interrupted' ? 'interrupted' : 'ended')} · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`));
    }
    info.append(title, detail);
    article.append(info);
    if (history && record.host_id === user?.id) {
      const remove = document.createElement('button');remove.type = 'button';remove.className = 'mw-history-delete';remove.textContent = translate('removeHistory');remove.disabled = historyBusy;
      remove.addEventListener('click', () => archiveHistory([{ id: record.id, source: legacy ? 'audio' : 'video' }]));article.append(remove);
    }
    if (!history) {
      const own = record.host_id === user?.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = translate(own ? 'resumeLive' : modeFor(record) === 'audio' ? 'listen' : 'watch');
      button.addEventListener('click', () => watch(record));
      article.append(button);
      if (own) {
        const end = document.createElement('button');
        end.type = 'button';
        end.textContent = translate('closeListing');
        end.addEventListener('click', async () => {
          end.disabled = true;
          try { if (session?.room_name === record.room_name) await disconnect(); else await endRecord(record); await refresh(); }
          catch (error) { message(error.message, true); end.disabled = false; }
        });
        article.append(end);
      }
    }
    return article;
  }

  async function refresh(force = true) {
    if (connectionAccountId && user?.id !== connectionAccountId) {
      await disconnect();
      message('Your account changed. Sign in and rejoin Live to continue.');
    }
    if (discoveryBusy || typeof sb === 'undefined' || !byId('mwLiveSessions')) return;
    if (!force && Date.now() - lastDiscoveryCheck < syncInterval) return;
    discoveryBusy = true;
    try {
      const result = await sb.from('mw_video_live_sessions').select('id,room_name,host_id,host_name,title,scope,is_live,started_at').eq('is_live', true).order('started_at', { ascending: false }).limit(100);
      if (result.error) throw new Error('Live discovery is unavailable. Check the existing session table and access policies.');
      const records = await accessibleRecords((result.data || []).filter(record => record.room_name && record.host_id));
      let activeRecords = [];
      {
        const authSession = (await sb.auth.getSession()).data.session;
        const verified = await fetch('/.netlify/functions/milkyway-discovery', { headers: { apikey: sb.supabaseKey || '', ...(authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {}) }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
        const verification = await verified.json().catch(() => null);
        const errorKey = { endpoint_incompatible: 'liveEndpointIncompatible', authentication_required: 'liveHealthAuthentication', platform_restricted: 'livePlatformRestricted', access_denied: 'liveAccessDenied', endpoint_missing: 'liveEndpointMissing' }[verification?.reason];
        if (!verified.ok) throw new Error(errorKey ? translate(errorKey) : window.MilkyWayI18n.text(verification?.error || translate('liveDiscoveryUnavailable')));
        const active = verification?.sessions;
        if (!Array.isArray(active)) throw new Error('Discovery unavailable');
        activeRecords = records.filter(record => active.some(session => session.room_name === record.room_name));
        activeRecords.forEach(record => { record.verified = true;record.connectedCount = active.find(session => session.room_name === record.room_name)?.connectedCount; });
      }
      const ids = [...new Set(records.map(record => record.host_id))];
      const signatureIds = ids.sort().join(',');
      if (ids.length && signatureIds !== profileSignature) { const profiles = await sb.from('mw_profiles').select('id,display_name,username,avatar_url').in('id', ids);if (!profiles.error) { discoveryProfiles = profiles.data || [];profileSignature = signatureIds; } }
      records.forEach(record => { record.profile = discoveryProfiles.find(profile => profile.id === record.host_id); });
      const liveHosts = new Set(activeRecords.map(record => record.host_id));
      if (previousLiveHosts) activeRecords.filter(record => !previousLiveHosts.has(record.host_id)).forEach(record => {
        // Lives for Everyone get the platform-wide broadcast banner (live-broadcast.js); follower-only Lives keep the short notice.
        if (record.scope === 'followers') toast(`${record.host_name || translate('participant')} · ${translate('startedLive')}`);
        if (localStorage.getItem('mw_notify_sound') !== 'off') playNotificationSound();
      });
      previousLiveHosts = liveHosts;
      paintLiveNow(records.filter(record => record.verified || record.host_id === user?.id), activeRecords.length);
      const signature = JSON.stringify([user?.id, activeRecords]);
      if (signature !== discoverySignature) { discoverySignature = signature;announceDiscovery(activeRecords); }
      const hashId = location.hash.startsWith('#mw-live-') ? location.hash.slice(9) : location.hash.startsWith('#live=') ? decodeURIComponent(location.hash.slice(6)) : '';
      if (hashId && user && consumedHash !== location.hash) {
        consumedHash = location.hash;
        const shared = records.find(record => record.id === hashId || record.room_name === hashId);
        if (shared) watch(shared);
        else { open({ entry: 'viewer' });message('This Live has ended or is not available to your account.', true); }
      }
    } catch (error) {
      byId('mwLiveSessions').textContent = error.message;
      paintLiveCount(null);
      if (discoverySignature) announceDiscovery([]);
      discoverySignature = '';
    } finally { lastDiscoveryCheck = Date.now();discoveryBusy = false; }
  }

  // The single list of Lives sits inside the Live screen; the home screen only shows the top toolbar LIVE pill.
  let liveNowSignature = '';
  function paintLiveNow(records, activeCount) {
    const list = byId('mwLiveSessions');
    // Discovery runs every second; repaint the cards only when the list of Lives actually changed.
    const signature = JSON.stringify([document.documentElement.lang, user?.id, activeCount, records.map(record => [record.id, record.room_name, record.title, record.scope, record.verified, record.connectedCount, record.host_name, record.profile?.display_name, record.profile?.avatar_url])]);
    if (signature === liveNowSignature && list.childElementCount) return;
    liveNowSignature = signature;
    list.replaceChildren();list.setAttribute('aria-busy', 'false');
    paintLiveCount(activeCount);
    if (!records.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.dataset.mwI18n = 'noVerifiedLive'; empty.textContent = translate('noVerifiedLive'); list.append(empty);return; }
    records.forEach(record => {
      const card = sessionCard(record);
      const type = document.createElement('span');type.className = 'mw-stories-live-type';
      type.innerHTML = svg(modeFor(record) === 'audio' ? 'mic' : 'camera');
      type.append(document.createTextNode(modeFor(record) === 'audio' ? 'Audio LIVE' : 'Video LIVE'));
      card.querySelector('.mw-live-session-info').prepend(type);
      list.append(card);
    });
  }
  function paintLiveCount(count) {
    const badge = byId('mwLiveNowCount');
    if (!badge) return;
    badge.hidden = !count;badge.textContent = count ? `${count} ${say('liveNowCount')}` : '';
  }
  // The top toolbar pill (engage.js) listens for this instead of reading cards off the home screen.
  function announceDiscovery(records) {
    liveRecords = records;
    window.dispatchEvent(new CustomEvent('mw-live-discovery', { detail: { records } }));
  }

  async function accessibleRecords(records) {
    const restricted = record => (record.scope || record.audience_scope) === 'followers';
    if (!user) return records.filter(record => !restricted(record));
    const hostIds = [...new Set(records.filter(record => restricted(record) && record.host_id !== user.id).map(record => record.host_id))];
    if (!hostIds.length) return records;
    const follows = await window.MilkyWayFollows.query(q => q.select('following_id').eq('follower_id', user.id).in('following_id', hostIds));
    if (follows.error) throw new Error('Could not verify follower-only session access.');
    const allowed = new Set((follows.data || []).map(follow => follow.following_id));
    return records.filter(record => !restricted(record) || record.host_id === user.id || allowed.has(record.host_id));
  }

  async function historyRequest(options = {}, ids = [], rooms = []) {
    const authSession = (await sb.auth.getSession()).data.session;
    if (!authSession) throw new Error(translate('signInFirst'));
    const response = await fetch(`/.netlify/functions/milkyway-account?action=live-history&ids=${encodeURIComponent(ids.join(','))}&rooms=${encodeURIComponent(rooms.join(','))}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}`, apikey: sb.supabaseKey || '' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => { throw new Error(translate('historyUnavailable')); });
    if (!response.ok) throw new Error(window.MilkyWayI18n?.text(result.error) || translate('historyUnavailable'));
    return result;
  }
  async function archiveHistory(sessions) {
    if (historyBusy || !sessions.length || !(await window.MilkyWayDialog.confirm({ message: translate('confirmArchiveHistory'), danger: true }))) return;
    historyBusy = true;
    byId('mwLiveHistory').querySelectorAll('button').forEach(button => { button.disabled = true; });
    byId('mwLiveClearHistory').disabled = true;
    try {
      for (const item of sessions) {
        const record = displayedHistory.find(entry => entry.record.id === item.id)?.record;
        if (record?.is_live && record.ended_at && record.host_id === user?.id) await endRecord(record);
      }
      await historyRequest({ method: 'POST', body: JSON.stringify({ sessions }) });
      message(translate('historyArchived'));await history(historyOffset);
    } catch (error) { message(window.MilkyWayI18n?.text(error.message) || translate('historyUnavailable'), true); }
    finally {
      historyBusy = false;
      byId('mwLiveHistory').querySelectorAll('button').forEach(button => { button.disabled = false; });
      byId('mwLiveClearHistory').disabled = false;
    }
  }
  async function history(offset = 0) {
    const attempt = ++historyGeneration;
    const accountId = user?.id;
    const list = byId('mwLiveHistory');
    list.textContent = translate('historyLoading');list.setAttribute('aria-busy', 'true');
    byId('mwLiveClearHistory').hidden = true;
    byId('mwLiveOlderHistory').hidden = true;
    try {
      const results = await Promise.all([
      accountId ? sb.from('mw_video_live_sessions').select('id,room_name,host_id,host_name,title,scope,started_at,ended_at,is_live').eq('host_id', accountId).order('started_at', { ascending: false }).range(offset, offset + 29) : sb.from('mw_video_live_sessions').select('id,room_name,host_id,host_name,title,scope,started_at,ended_at,is_live').eq('is_live', false).order('started_at', { ascending: false }).range(offset, offset + 29),
      accountId ? sb.from('mw_audio_live_rooms').select('id,host_id,host_name,title,created_at,ended_at,audience_scope').eq('host_id', accountId).eq('status', 'ended').order('created_at', { ascending: false }).range(offset, offset + 29) : sb.from('mw_audio_live_rooms').select('id,host_id,host_name,title,created_at,ended_at,audience_scope').eq('status', 'ended').order('created_at', { ascending: false }).range(offset, offset + 29)
    ]);
      const available = await accessibleRecords(results.flatMap(result => result.data || []));
      const historyState = accountId && available.length ? await historyRequest({}, available.map(record => record.id), available.map(record => record.room_name).filter(room => room?.startsWith('mw-conversation-'))) : { archived: [], metadata: [] };
      const archived = historyState.archived;
      for (const record of available) {
        const metadata = historyState.metadata?.find(item => item.room === record.room_name);
        if (metadata) Object.assign(record, { started_at: metadata.startedAt || record.started_at, ended_at: metadata.endedAt || record.ended_at, lifecycleStatus: metadata.lifecycleStatus });
      }
      if (attempt !== historyGeneration || accountId !== user?.id) return;
      list.replaceChildren();
      const records = results.flatMap((result, index) => (result.data || []).filter(record => (!record.is_live || record.ended_at) && available.includes(record) && !archived.some(item => item.id === record.id && item.source === (index === 1 ? 'audio' : 'video'))).map(record => ({ record, legacy: index === 1 })));
    records.sort((first, second) => new Date(second.record.started_at || second.record.created_at) - new Date(first.record.started_at || first.record.created_at));
      displayedHistory = records;historyLoaded = true;historyOffset = offset;
      const hasOlder = results.some(result => result.data?.length === 30);
      byId('mwLiveOlderHistory').hidden = !hasOlder;
      displayedHistory.forEach(item => list.append(sessionCard(item.record, true, item.legacy)));
      byId('mwLiveClearHistory').hidden = !displayedHistory.some(item => item.record.host_id === accountId);
      if (results.some(result => result.error)) { const error = document.createElement('p');error.textContent = translate('historyPartial');list.append(error); }
      else if (!records.length) list.textContent = translate(hasOlder || offset > 0 ? 'historyPageEmpty' : 'historyEmpty');
    } catch (error) {
      if (attempt !== historyGeneration || accountId !== user?.id) return;
      list.textContent = translate('historyUnavailable');message(error.message, true);
    } finally { if (attempt === historyGeneration) list.setAttribute('aria-busy', 'false'); }
  }

  async function action(name) {
    try {
      if (name === 'close') return close();
      if (name === 'refresh') return refresh();
      if (name === 'history') return history();
      if (['menu', 'settings', 'guest-panel', 'requests', 'viewers'].includes(name) && byId('mwLiveHostPanel')) { byId('mwLiveHostPanel').hidden = true;byId('mwLiveHostControls')?.setAttribute('aria-expanded', 'false'); }
      if (['menu', 'settings', 'guest-panel', 'host-panel'].includes(name)) { byId('mwLiveViewers').hidden = true;byId('mwLiveRequests').hidden = true;byId('mwLiveCount').setAttribute('aria-expanded', 'false'); }
      if (name === 'host-panel') {
        if (!host || !conversationRoom() || !connected()) return;
        const panel = byId('mwLiveHostPanel');
        for (const identity of ['mwLiveMenu', 'mwLiveSettings', 'mwLiveGuests']) byId(identity).hidden = true;
        for (const identity of ['mwLiveMenuTrigger', 'mwLiveGuestButton']) byId(identity)?.setAttribute('aria-expanded', 'false');
        panel.hidden = !panel.hidden;byId('mwLiveSheetBackdrop').hidden = panel.hidden;
        byId('mwLiveHostControls').setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) { panel.dataset.signature = '';renderHostPanel();panel.querySelector('.mwx-sheet-close').focus({ preventScroll: true }); }
        return;
      }
      if (name === 'viewers' || name === 'requests') {
        if (!connected() || name === 'requests' && (!host || !conversationRoom())) return;
        const identity = name === 'viewers' ? 'mwLiveViewers' : 'mwLiveRequests';
        const opening = byId(identity).hidden;
        closeStageSheets(opening ? identity : '');
        byId(identity).hidden = !opening;byId('mwLiveSheetBackdrop').hidden = !opening;
        byId('mwLiveMenuTrigger')?.setAttribute('aria-expanded', 'false');byId('mwLiveGuestButton')?.setAttribute('aria-expanded', 'false');
        if (!opening) return;
        if (name === 'viewers') renderViewers();else { requestIndex = 0;renderRequests();requestAnimationFrame(() => showRequest(0, false)); }
        byId(identity).querySelector('.mwx-sheet-close').focus({ preventScroll: true });
        return;
      }
      if (name === 'menu') {
        const panel = byId('mwLiveMenu');
        byId('mwLiveSettings').hidden = true;byId('mwLiveGuests').hidden = true;
        panel.hidden = !panel.hidden;
        byId('mwLiveSheetBackdrop').hidden = panel.hidden;
        byId('mwLiveMenuTrigger').setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) {
          byId('mwLiveMenuTitleInput').value = session?.title || '';
          byId('mwLiveMenuTitleInput').readOnly = !host;
          byId('mwLiveSaveTitle').hidden = !host || !conversationRoom();
          const microphone = [...(room?.localParticipant.audioTrackPublications.values() || [])].find(publication => publication.track)?.track;
          byId('mwLiveNoiseControl').hidden = !microphone?.restartTrack || !navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression;
          byId('mwLiveAboutHost').textContent = session?.host_name || byId('mwLiveHostName').textContent;
          const hostId = session?.host_id;
          getProfile(hostId).then(profile => { if (session?.host_id === hostId && !panel.hidden) byId('mwLiveAboutHost').textContent = [profile?.display_name || session.host_name, profile?.bio].filter(Boolean).join(' · '); }).catch(() => {});
          byId('mwLiveReportProblem').href = `mailto:info@masiyatunda.com?subject=MilkyWay%20Live&body=${encodeURIComponent(session?.room_name || '')}`;
          byId('mwLiveMenuClose').focus({ preventScroll: true });
        }
        return;
      }
      if (name === 'settings') {
        byId('mwLiveMenu').hidden = true;byId('mwLiveGuests').hidden = true;
        const panel = byId('mwLiveSettings');
        panel.hidden = !panel.hidden;
        byId('mwLiveSheetBackdrop').hidden = panel.hidden;
        byId('mwLivePage').querySelector('[data-action="settings"]').setAttribute('aria-expanded', String(!panel.hidden));
        updateParticipants();
        if (!panel.hidden) byId('mwLiveSettingsClose').focus({ preventScroll: true });
        if (!panel.hidden && navigator.mediaDevices?.enumerateDevices) {
          const select = byId('mwLiveOutput');
          const selected = select.value;
          select.innerHTML = '<option value="default">Default speaker</option>';
          const devices = await navigator.mediaDevices.enumerateDevices();
          devices.filter(device => device.kind === 'audiooutput' && device.deviceId !== 'default').forEach((device, index) => { const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Speaker ${index + 1}`; select.append(option); });
          select.value = [...select.options].some(option => option.value === selected) ? selected : 'default';
          select.disabled = typeof HTMLMediaElement.prototype.setSinkId !== 'function';
        }
        return;
      }
      if (name === 'reaction') { floatHeart();await publish({ type: 'mw-live-reaction', reaction: 'heart' }); }
      if (name === 'mic' && (host || roomState?.self.state === 'speaker' && !roomState.self.hostMuted) && connected()) { await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);syncMedia(); }
      if (name === 'camera' && (host || roomState?.self.state === 'speaker') && mode === 'video' && connected()) { await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);syncMedia(); }
      if (name === 'request') {
        if (participationBusy || host || !conversationRoom() || !connected() || !roomState) return;
        const leaving = ['speaker', 'pending'].includes(roomState.self.state);
        participationBusy = true;paintParticipation();
        // The alien's press reaction plays alongside the request instead of holding it back.
        if (!leaving) window.MilkyWayAlien?.react(byId('mwLiveRequest'));
        try {
          const result = await roomAction(leaving ? 'leave-stage' : 'request');
          participationBusy = false;
          applySelfState(result.state);
          pollRoom();
        } finally { participationBusy = false;paintParticipation(); }
      }
      if (name === 'guest-panel') {
        if (!conversationRoom() || !connected()) return;
        byId('mwLiveMenu').hidden = true;byId('mwLiveSettings').hidden = true;
        const panel = byId('mwLiveGuests');panel.hidden = !panel.hidden;
        byId('mwLiveSheetBackdrop').hidden = panel.hidden;
        byId('mwLiveGuestButton').setAttribute('aria-expanded', String(!panel.hidden));
        renderConversationParticipants();
        if (!panel.hidden) panel.querySelector('button').focus({ preventScroll: true });
      }
      if (name === 'sound') await toggleSound();
      if (name === 'share') {
        if (!session?.id) throw new Error('This broadcast has no saved listing to share.');
        const url = new URL(location.pathname, location.origin);
        url.hash = `mw-live-${session.id}`;
        if (navigator.share) await navigator.share({ title: session.title, url: url.href });
        else { await navigator.clipboard.writeText(url.href); message('Live link copied.'); }
      }
    } catch (error) { if (error.name !== 'AbortError') message(error.message || 'This action could not be completed.', true); }
  }

  function initialize() {
    const listeningHint = document.createElement('p');listeningHint.id = 'mwLiveListeningHint';listeningHint.className = 'muted mw-live-listening-hint';listeningHint.setAttribute('role', 'status');byId('mwLiveCommentForm').before(listeningHint);paintListening();
    const liveNowCount = document.createElement('span');liveNowCount.id = 'mwLiveNowCount';liveNowCount.className = 'mwx-live-now-count';liveNowCount.hidden = true;
    byId('mwLiveSessions').parentElement.querySelector('h2')?.append(liveNowCount);
    sb.auth.onAuthStateChange((event, authSession) => {
      if (!authSession?.user || !pendingWatch) return;
      const record = pendingWatch;pendingWatch = null;
      // Wait for the page's own sign-in handling to set the account before joining.
      (async () => { for (let wait = 0; wait < 40 && !logged(); wait++) await new Promise(resolve => setTimeout(resolve, 150));if (logged()) watch(record); })();
    });
    byId('mwLiveHostName').dataset.mwI18n = 'yourSpace';byId('mwLiveHostName').textContent = translate('yourSpace');
    const servicePanel = document.createElement('aside');servicePanel.id = 'mwLiveServiceStatus';servicePanel.className = 'mw-live-service-status';servicePanel.setAttribute('role', 'status');
    servicePanel.innerHTML = '<div><p id="mwLiveServiceText"></p><code id="mwLiveServiceVariables"></code></div><button id="mwLiveServiceRetry" type="button" data-mw-i18n="retry"></button>';
    byId('mwLiveSetup').before(servicePanel);byId('mwLiveServiceRetry').onclick = () => { checkService(true).catch(() => {});refresh(); };paintServiceStatus();
    const clearHistory = document.createElement('button');clearHistory.id = 'mwLiveClearHistory';clearHistory.type = 'button';clearHistory.hidden = true;clearHistory.dataset.mwI18n = 'clearDisplayedHistory';
    clearHistory.onclick = () => archiveHistory(displayedHistory.filter(item => item.record.host_id === user?.id).map(item => ({ id: item.record.id, source: item.legacy ? 'audio' : 'video' })));
    byId('mwLiveHistory').before(clearHistory);
    const olderHistory = document.createElement('button');olderHistory.id = 'mwLiveOlderHistory';olderHistory.type = 'button';olderHistory.hidden = true;olderHistory.dataset.mwI18n = 'loadOlderHistory';
    olderHistory.onclick = () => { if (!historyBusy) history(historyOffset + 30); };byId('mwLiveHistory').after(olderHistory);
    const historyHelp = document.createElement('p');historyHelp.className = 'muted';historyHelp.dataset.mwI18n = 'historyRetention';byId('mwLiveHistory').before(historyHelp);
    const grid = document.createElement('div');grid.id = 'mwLiveGrid';grid.className = 'mw-stage-grid';grid.hidden = true;byId('mwLiveStage').prepend(grid);
    if (window.ResizeObserver) new ResizeObserver(() => paintStageLayout()).observe(byId('mwLiveStage'));
    const controls = document.createElement('div');controls.id = 'mwLiveLayoutControls';controls.hidden = true;
    controls.innerHTML = '<h3 data-mw-i18n="guestParticipation"></h3><button type="button" id="mwLiveLayoutTrigger" class="mw-layout-trigger" aria-haspopup="dialog"></button><div class="mw-layout-native" hidden><label data-mw-i18n="visibleSeats" for="mwLiveLayout"></label><select id="mwLiveLayout">' + Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join('') + '</select></div><label class="mwx-admission-native" data-mw-i18n="admission" for="mwLiveAdmission"></label><select id="mwLiveAdmission" class="mwx-admission-native"><option value="approval" data-mw-i18n="approvalRequired"></option><option value="direct" data-mw-i18n="directJoin"></option><option value="broadcast" data-mw-i18n="broadcastLive" disabled></option></select>';
    byId('mwLiveSettings').prepend(controls);
    const settingsClose = document.createElement('button');settingsClose.id = 'mwLiveSettingsClose';settingsClose.type = 'button';settingsClose.className = 'mwx-sheet-close';settingsClose.dataset.mwI18n = 'close';
    settingsClose.onclick = () => { byId('mwLiveSettings').hidden = true;const gear = byId('mwLivePage').querySelector('[data-action="settings"]');gear.setAttribute('aria-expanded', 'false');gear.focus(); };
    byId('mwLiveSettings').prepend(settingsClose);
    const settingsIds = ['mwLiveLayout', 'mwLiveAdmission', 'mwLiveLayoutTrigger', 'mwLiveAutoAcceptLive', 'mwLiveAutoAcceptGuests'];
    const saveSettings = async (changes = {}) => {
      if (settingsBusy || !host) return;
      settingsBusy = true;
      settingsIds.forEach(identity => { byId(identity).disabled = true; });
      try {
        const current = roomState?.settings || {};
        const result = { layout: Number(byId('mwLiveLayout').value) + 1, admission: byId('mwLiveAdmission').value, layoutStyle: window.MilkyWayLiveLayouts?.normalize(current.layoutStyle) || 'fullscreen', hostPosition: current.hostPosition === 'end' ? 'end' : 'start', mobileLayout: current.mobileLayout === 'compact' ? 'compact' : 'stack', ...changes };
        await roomAction('settings', result);
        if (roomState) { Object.assign(roomState.settings, result);renderGrid(); }
        message(translate('saved'));
      } catch (error) { message(error.message, true); }
      finally { settingsBusy = false;settingsIds.forEach(identity => { byId(identity).disabled = false; });byId('mwLiveAdmission').disabled = byId('mwLiveAdmission').value === 'broadcast';paintAutoAccept();await pollRoom(); }
    };
    for (const id of ['mwLiveLayout', 'mwLiveAdmission']) byId(id).onchange = () => saveSettings();
    // Host Auto-accept switch, shown in live settings and the guest panel; it drives the admission select.
    const autoToggle = identity => {
      const label = document.createElement('label');label.className = 'mwx-live-auto';label.hidden = true;
      label.innerHTML = `<span><b></b><small></small></span><input type="checkbox" role="switch" id="${identity}">`;
      const input = label.querySelector('input');
      input.onchange = () => { byId('mwLiveAdmission').value = input.checked ? 'direct' : 'approval';paintAutoAccept();saveSettings(); };
      return label;
    };
    controls.append(autoToggle('mwLiveAutoAcceptLive'));
    byId('mwLiveLayoutTrigger').onclick = () => {
      const layouts = window.MilkyWayLiveLayouts;
      if (!layouts || !host || settingsBusy) return;
      const current = roomState?.settings || {};
      layouts.open({ style: current.layoutStyle, seats: Number(byId('mwLiveLayout').value), hostPosition: current.hostPosition, onApply: choice => {
        byId('mwLiveLayout').value = String(choice.seats);
        saveSettings({ layout: choice.seats + 1, layoutStyle: choice.style, hostPosition: choice.hostPosition });
      } });
    };
    const participation = document.createElement('div');participation.className = 'mw-live-participation';
    for (const [identity, name, icon] of [['mwLiveRequest', 'request', 'alienJoin'], ['mwLiveGuestButton', 'guest-panel', 'alienGuests']]) {
      const button = document.createElement('button');button.id = identity;button.type = 'button';button.dataset.action = name;button.hidden = true;
      button.innerHTML = `${name === 'request' && window.MilkyWayAlien ? window.MilkyWayAlien.markup('join') : svg(icon)}<span><b></b><small></small></span>`;
      if (name === 'request') button.classList.add('mwx-alien-touch');
      if (name === 'guest-panel') { button.setAttribute('aria-controls', 'mwLiveGuests');button.setAttribute('aria-expanded', 'false'); }
      participation.append(button);
    }
    const hostAlien = document.createElement('button');hostAlien.id = 'mwLiveHostAlien';hostAlien.type = 'button';hostAlien.hidden = true;hostAlien.className = 'mwx-alien-touch';
    hostAlien.innerHTML = `${window.MilkyWayAlien ? window.MilkyWayAlien.markup('host') : svg('alienGuests')}<b class="mwx-alien-count" hidden></b>`;
    hostAlien.onclick = () => action(Number(hostAlien.dataset.pending) ? 'requests' : 'host-panel');
    participation.append(hostAlien);
    byId('mwLiveStage').querySelector('.mw-live-actions').prepend(...participation.children);
    const guests = document.createElement('aside');guests.id = 'mwLiveGuests';guests.className = 'mw-live-settings mw-live-glass';guests.hidden = true;
    guests.innerHTML = '<button type="button" data-mw-i18n="close"></button><h3 data-mw-i18n="guestParticipation"></h3><p id="mwLiveGuestCapacity"></p><p id="mwLiveGuestPolicy"></p><button type="button" id="mwLiveReviewRequests" class="mwx-review-requests" hidden></button><div id="mwLiveGuestList"></div>';
    guests.querySelector('button').onclick = () => { guests.hidden = true;byId('mwLiveSheetBackdrop').hidden = true;byId('mwLiveGuestButton').setAttribute('aria-expanded', 'false');byId('mwLiveGuestButton').focus(); };
    byId('mwLiveStage').append(guests);
    guests.append(byId('mwLiveParticipants'));
    byId('mwLiveReviewRequests').onclick = () => action('requests');
    byId('mwLiveReviewRequests').before(autoToggle('mwLiveAutoAcceptGuests'));
    const setupAuto = byId('mwLiveAutoAccept');
    if (setupAuto) {
      try { setupAuto.checked = localStorage.getItem('mw_live_auto_accept') === 'on'; } catch {}
      setupAuto.onchange = () => { try { localStorage.setItem('mw_live_auto_accept', setupAuto.checked ? 'on' : 'off'); } catch {} paintAutoAccept(); };
      byId('mwLiveAllowRequests')?.addEventListener('change', paintAutoAccept);
    }
    paintAutoAccept();window.addEventListener('mw-language-change', paintAutoAccept);
    const viewers = document.createElement('aside');viewers.id = 'mwLiveViewers';viewers.className = 'mw-live-settings mw-live-glass mwx-viewers';viewers.hidden = true;
    viewers.setAttribute('role', 'dialog');viewers.setAttribute('aria-modal', 'true');viewers.setAttribute('aria-labelledby', 'mwLiveViewersTitle');
    viewers.innerHTML = '<button type="button" class="mwx-sheet-close"></button><h3 id="mwLiveViewersTitle"></h3><p id="mwLiveViewersTotal" class="mwx-sheet-sub"></p><div id="mwLiveViewerList" class="mwx-viewer-list"></div>';
    byId('mwLiveStage').append(viewers);
    const requests = document.createElement('aside');requests.id = 'mwLiveRequests';requests.className = 'mw-live-settings mw-live-glass mwx-requests';requests.hidden = true;
    requests.setAttribute('role', 'dialog');requests.setAttribute('aria-modal', 'true');requests.setAttribute('aria-labelledby', 'mwLiveRequestsTitle');
    requests.innerHTML = `<button type="button" class="mwx-sheet-close"></button><h3 id="mwLiveRequestsTitle"></h3><p class="mwx-sheet-sub"><span id="mwLiveRequestSeats"></span> <b id="mwLiveRequestPosition"></b></p><div class="mwx-req-viewport"><div id="mwLiveRequestTrack" class="mwx-req-track" tabindex="0" aria-roledescription="carousel"></div><div class="mwx-req-nav"><button type="button" id="mwLiveRequestPrev" class="mwx-req-arrow">${svg('chevronLeft')}</button><button type="button" id="mwLiveRequestNext" class="mwx-req-arrow">${svg('chevronRight')}</button></div></div><p id="mwLiveRequestEmpty" class="muted mwx-viewers-empty"></p><div id="mwLiveRequestDots" class="mwx-req-dots" aria-hidden="true"></div><p class="mwx-req-hint" id="mwLiveRequestHint"></p>`;
    byId('mwLiveStage').append(requests);
    const paintSheetLabels = () => {
      viewers.querySelector('.mwx-sheet-close').textContent = say('close');requests.querySelector('.mwx-sheet-close').textContent = say('close');
      byId('mwLiveViewersTitle').textContent = say('watching');byId('mwLiveRequestsTitle').textContent = say('requests');
      byId('mwLiveRequestEmpty').textContent = say('noRequests');byId('mwLiveRequestHint').textContent = say('swipe');
      byId('mwLiveRequestPrev').setAttribute('aria-label', say('previous'));byId('mwLiveRequestNext').setAttribute('aria-label', say('next'));
    };
    paintSheetLabels();window.addEventListener('mw-language-change', () => { paintSheetLabels();byId('mwLiveRequestTrack').dataset.signature = '';renderRequests();renderViewers(); });
    const closeSheet = panel => { panel.hidden = true;byId('mwLiveSheetBackdrop').hidden = true;byId('mwLiveCount').setAttribute('aria-expanded', 'false');(panel === viewers ? byId('mwLiveCount') : byId('mwLiveGuestButton'))?.focus({ preventScroll: true }); };
    viewers.querySelector('.mwx-sheet-close').onclick = () => closeSheet(viewers);
    requests.querySelector('.mwx-sheet-close').onclick = () => closeSheet(requests);
    const track = byId('mwLiveRequestTrack');
    byId('mwLiveRequestPrev').onclick = () => showRequest(requestIndex - (document.dir === 'rtl' ? -1 : 1));
    byId('mwLiveRequestNext').onclick = () => showRequest(requestIndex + (document.dir === 'rtl' ? -1 : 1));
    track.addEventListener('keydown', event => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();showRequest(requestIndex + (document.dir === 'rtl' ? -step : step));
    });
    let trackFrame = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(trackFrame);
      trackFrame = requestAnimationFrame(() => {
        const middle = track.getBoundingClientRect().left + track.clientWidth / 2;
        let nearest = 0, distance = Infinity;
        [...track.children].forEach((card, index) => { const box = card.getBoundingClientRect(), gap = Math.abs(box.left + box.width / 2 - middle);if (gap < distance) { distance = gap;nearest = index; } });
        if (nearest !== requestIndex) { requestIndex = nearest;paintRequestPosition(); }
      });
    }, { passive: true });
    guests.setAttribute('role', 'dialog');guests.setAttribute('aria-modal', 'true');guests.setAttribute('aria-label', translate('guestParticipation'));
    const gear = byId('mwLivePage').querySelector('[data-action="settings"]');gear.classList.add('mw-galaxy-gear');gear.id = 'mwLiveMenuTrigger';gear.dataset.action = 'menu';gear.dataset.icon = 'more';gear.dataset.mwI18nAria = 'liveMenu';gear.setAttribute('aria-label', translate('liveMenu'));gear.setAttribute('aria-controls', 'mwLiveMenu');gear.title = translate('liveMenu');
    const menu = document.createElement('aside');menu.id = 'mwLiveMenu';menu.className = 'mw-live-settings mw-live-glass';menu.hidden = true;menu.setAttribute('role', 'dialog');menu.setAttribute('aria-modal', 'true');menu.setAttribute('aria-labelledby', 'mwLiveMenuHeading');
    menu.innerHTML = '<button type="button" id="mwLiveMenuClose" data-mw-i18n="close"></button><h3 id="mwLiveMenuHeading" data-mw-i18n="liveMenu"></h3><label for="mwLiveMenuTitleInput" data-mw-i18n="liveTitle"></label><input id="mwLiveMenuTitleInput" maxlength="100"><button type="button" id="mwLiveSaveTitle" data-mw-i18n="save"></button><label class="mw-live-menu-toggle"><input type="checkbox" id="mwLiveShowComments" checked><span data-mw-i18n="showComments"></span></label><label id="mwLiveNoiseControl" class="mw-live-menu-toggle" hidden><input type="checkbox" id="mwLiveNoiseReduction" checked><span data-mw-i18n="noiseReduction"></span></label><h4 data-mw-i18n="aboutHost"></h4><p id="mwLiveAboutHost"></p><button type="button" data-action="settings" data-mw-i18n="galaxySettings"></button><a id="mwLiveReportProblem" href="mailto:info@masiyatunda.com?subject=MilkyWay%20Live" data-mw-i18n="reportProblem"></a>';
    byId('mwLiveStage').append(menu);
    byId('mwLiveMenuClose').onclick = () => { menu.hidden = true;byId('mwLiveSheetBackdrop').hidden = true;gear.setAttribute('aria-expanded', 'false');gear.focus(); };
    byId('mwLiveSettingsClose').onclick = () => { byId('mwLiveSettings').hidden = true;byId('mwLiveSheetBackdrop').hidden = true;gear.setAttribute('aria-expanded', 'false');gear.focus(); };
    const backdrop = document.createElement('div');backdrop.id = 'mwLiveSheetBackdrop';backdrop.hidden = true;backdrop.onclick = () => {
      if (!viewers.hidden) closeSheet(viewers);
      else if (!requests.hidden) closeSheet(requests);
      else if (!menu.hidden) byId('mwLiveMenuClose').click();
      else if (!byId('mwLiveHostPanel').hidden) byId('mwLiveHostPanel').querySelector('.mwx-sheet-close').click();
      else if (!guests.hidden) guests.querySelector('button').click();
      else byId('mwLiveSettingsClose').click();
    };byId('mwLiveStage').append(backdrop);
    byId('mwLiveShowComments').onchange = event => { byId('mwLiveComments').hidden = !event.target.checked; };
    byId('mwLiveSaveTitle').onclick = async event => {
      const button = event.target;button.disabled = true;
      try { const title = byId('mwLiveMenuTitleInput').value.trim();await roomAction('title', { title });session.title = title;byId('mwLiveBroadcastTitle').textContent = title;message(translate('saved')); }
      catch (error) { message(error.message, true); }
      finally { button.disabled = false; }
    };
    byId('mwLiveNoiseReduction').onchange = async event => {
      const control = event.target;control.disabled = true;
      try { const microphone = [...room.localParticipant.audioTrackPublications.values()].find(publication => publication.track)?.track;await microphone.restartTrack({ noiseSuppression: control.checked, echoCancellation: true, autoGainControl: true }); }
      catch (error) { control.checked = !control.checked;message(error.message, true); }
      finally { control.disabled = false; }
    };
    const follow = document.createElement('button');follow.type = 'button';follow.id = 'mwLiveFollowHost';follow.dataset.mwI18n = 'follow';/* Taps go through the shared follow handler once data-follow names the host. */byId('mwLiveHostName').parentElement.after(follow);follow.hidden = true;
    byId('mwLivePreviewButton').addEventListener('click', preview);
    byId('mwLivePreviewStop').addEventListener('click', stopPreview);
    document.querySelectorAll('#mwLivePage [data-icon]').forEach(element => { element.innerHTML = svg(element.dataset.icon); });
    document.querySelectorAll('#mwLivePage [data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    document.querySelectorAll('#mwLivePage [data-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.action)));
    // Bottom taskbar: every Live control and the settings hub sit in one row under the comment box. The right-hand
    // rail keeps only the 3D alien join button and the heart, so the stage itself stays uncluttered.
    const taskbar = document.createElement('nav');taskbar.id = 'mwLiveTaskbar';taskbar.className = 'mwx-taskbar';
    for (const [identity, label] of [['mwLiveMic', 'tbMic'], ['mwLiveCamera', 'tbCamera'], ['mwLiveSound', 'tbSound'], ['mwLiveGuestButton', 'tbGuests'], ['mwLiveShare', 'tbShare'], ['mwLiveMenuTrigger', 'tbSettings']]) {
      const button = identity === 'mwLiveShare' ? byId('mwLiveStage').querySelector('.mw-live-actions [data-action="share"]') : byId(identity);
      if (!button) continue;
      if (identity === 'mwLiveShare') button.id = identity;
      if (identity === 'mwLiveMenuTrigger') { button.innerHTML = svg('settings');button.dataset.icon = 'settings'; }
      const caption = document.createElement('i');caption.className = 'mwx-tb-label';caption.dataset.label = label;caption.setAttribute('aria-hidden', 'true');
      button.append(caption);taskbar.append(button);
    }
    byId('mwLiveCommentForm').after(taskbar);
    // Host controls: the first taskbar button (hosts only) opens one sheet with every direct command.
    const hostButton = document.createElement('button');hostButton.type = 'button';hostButton.id = 'mwLiveHostControls';hostButton.hidden = true;
    hostButton.setAttribute('aria-controls', 'mwLiveHostPanel');hostButton.setAttribute('aria-expanded', 'false');hostButton.setAttribute('aria-haspopup', 'dialog');
    hostButton.innerHTML = `${svg('crown')}<i class="mwx-tb-label" data-label="tbHost" aria-hidden="true"></i>`;hostButton.onclick = () => action('host-panel');
    taskbar.prepend(hostButton);
    const hostPanel = document.createElement('aside');hostPanel.id = 'mwLiveHostPanel';hostPanel.className = 'mw-live-settings mw-live-glass mwx-host-panel';hostPanel.hidden = true;
    hostPanel.setAttribute('role', 'dialog');hostPanel.setAttribute('aria-modal', 'true');hostPanel.setAttribute('aria-labelledby', 'mwLiveHostTitle');
    hostPanel.innerHTML = `<button type="button" class="mwx-sheet-close"></button><h3 id="mwLiveHostTitle"></h3><p id="mwLiveHostHint" class="mwx-sheet-sub"></p>
      <section class="mwx-host-section"><h4 id="mwLiveHostRequestsTitle"></h4><div id="mwLiveHostAuto"></div><div id="mwLiveHostRequests"></div></section>
      <section class="mwx-host-section"><h4 id="mwLiveHostLayoutTitle"></h4><div id="mwLiveHostLayouts" class="mwx-host-layouts"></div><div class="mwx-host-seats"><span id="mwLiveHostSeatsLabel"></span><button type="button" id="mwLiveHostSeatsLess" aria-label="−">−</button><b id="mwLiveHostSeatsValue" aria-live="polite"></b><button type="button" id="mwLiveHostSeatsMore" aria-label="+">+</button></div><button type="button" id="mwLiveHostMoreLayouts" class="mwx-ghost"></button></section>
      <section class="mwx-host-section"><h4 id="mwLiveHostPeopleTitle"></h4><div id="mwLiveHostPeople"></div></section>`;
    byId('mwLiveStage').append(hostPanel);
    byId('mwLiveHostAuto').append(autoToggle('mwLiveAutoAcceptHost'));settingsIds.push('mwLiveAutoAcceptHost');paintAutoAccept();
    applyHostSettings = saveSettings;
    const closeHostPanel = () => { hostPanel.hidden = true;byId('mwLiveSheetBackdrop').hidden = true;hostButton.setAttribute('aria-expanded', 'false');hostButton.focus({ preventScroll: true }); };
    hostPanel.querySelector('.mwx-sheet-close').onclick = closeHostPanel;
    const stepSeats = step => {
      const current = roomState?.settings;
      if (!current || settingsBusy) return;
      const next = Math.max(1, Math.min(20, current.layout - 1 + step));
      byId('mwLiveLayout').value = String(next);saveSettings({ layout: next + 1 });
    };
    byId('mwLiveHostSeatsLess').onclick = () => stepSeats(-1);byId('mwLiveHostSeatsMore').onclick = () => stepSeats(1);
    byId('mwLiveHostMoreLayouts').onclick = () => byId('mwLiveLayoutTrigger').click();
    paintTaskbar();
    byId('mwLiveSetup').addEventListener('submit', event => { event.preventDefault(); connect(true); });
    byId('mwLiveCommentForm').addEventListener('submit', async event => {
      event.preventDefault();
      const input = byId('mwLiveCommentInput');
      const text = input.value.trim();
      if (!text) return;
      const button = event.currentTarget.querySelector('button');
      if (button.disabled) return;
      button.disabled = true;
      try { await publish({ type: 'mw-live-comment', message: text });if (!conversationRoom()) appendComment(nameOf(), text);if (input.value.trim() === text) input.value = ''; }
      catch (error) { message(error.message || 'Comment could not be sent.', true); }
      finally { button.disabled = false; }
    });
    // Typing a comment: the stage keeps its pre-keyboard height and stays anchored to the top of the screen; only the
    // comment bar and chat lift above the keyboard, so the video and guest seats never shift or scroll.
    const livePage = byId('mwLivePage'), liveShell = livePage.querySelector('.mw-live-shell'), liveStage = byId('mwLiveStage'), commentInput = byId('mwLiveCommentInput');
    let lockedHeight = 0;
    const settleKeyboard = () => {
      if (liveStage.dataset.typing !== 'true') return;
      const viewport = window.visualViewport;
      const visible = viewport ? viewport.height : window.innerHeight, panned = viewport ? Math.max(0, viewport.offsetTop) : 0;
      liveStage.style.setProperty('--mw-keyboard', `${Math.max(0, Math.round(lockedHeight - visible))}px`);
      liveShell.style.transform = panned ? `translateY(${panned}px)` : '';
      livePage.scrollTop = 0;liveShell.scrollTop = 0;liveStage.scrollTop = 0;
    };
    commentInput.addEventListener('focus', () => {
      if (livePage.dataset.view !== 'stage') return;
      lockedHeight = liveShell.getBoundingClientRect().height;
      liveShell.style.height = `${lockedHeight}px`;liveStage.dataset.typing = 'true';settleKeyboard();
    });
    commentInput.addEventListener('blur', () => {
      delete liveStage.dataset.typing;liveShell.style.height = '';liveShell.style.transform = '';liveStage.style.removeProperty('--mw-keyboard');
      requestAnimationFrame(() => paintStageLayout());
    });
    window.visualViewport?.addEventListener('resize', settleKeyboard);window.visualViewport?.addEventListener('scroll', settleKeyboard);
    // Keep the keyboard open after sending, like other live apps.
    byId('mwLiveCommentForm').querySelector('button').addEventListener('pointerdown', event => { if (document.activeElement === commentInput) event.preventDefault(); });
    for (const element of [livePage, liveShell, liveStage]) element.addEventListener('scroll', () => { if (livePage.dataset.view === 'stage' && element.scrollTop) element.scrollTop = 0; }, { passive: true });
    byId('mwLiveVolume').addEventListener('input', event => { for (const item of audioTracks.values()) item.element.volume = Number(event.target.value) / 100; });
    byId('mwLiveOutput').addEventListener('change', async event => {
      try { for (const item of audioTracks.values()) if (item.element.setSinkId) await item.element.setSinkId(event.target.value === 'default' ? '' : event.target.value); }
      catch { message('The browser could not switch speakers. Use your device audio settings.', true); }
    });
    byId('mwLiveMedia').addEventListener('click', () => byId('mwLiveMedia').querySelector('video')?.play().catch(() => message('Video playback remains blocked.', true)));
    let lastTap = 0;
    byId('mwLiveStage').addEventListener('pointerup', event => {
      if (event.target.closest('button,input,select,a,form,.mw-live-settings,.mw-live-comments,.mwx-seats')) return;
      if (event.timeStamp - lastTap < 320 && connected()) { lastTap = 0;action('reaction'); } else lastTap = event.timeStamp;
    });
    byId('mwLivePage').addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!byId('mwLiveViewers').hidden) byId('mwLiveViewers').querySelector('.mwx-sheet-close').click();
        else if (!byId('mwLiveRequests').hidden) byId('mwLiveRequests').querySelector('.mwx-sheet-close').click();
        else if (!byId('mwLiveMenu').hidden) byId('mwLiveMenuClose').click();
        else if (!byId('mwLiveHostPanel').hidden) byId('mwLiveHostPanel').querySelector('.mwx-sheet-close').click();
        else if (!byId('mwLiveGuests').hidden) byId('mwLiveGuests').querySelector('button').click();
        else if (!byId('mwLiveSettings').hidden) byId('mwLiveSettingsClose').click();
        else close();
      }
      if (event.key !== 'Tab') return;
      const dialog = ['mwLiveViewers', 'mwLiveRequests', 'mwLiveMenu', 'mwLiveHostPanel', 'mwLiveSettings', 'mwLiveGuests'].map(byId).find(panel => !panel.hidden) || byId('mwLivePage');
      const targets = [...dialog.querySelectorAll('button:not(:disabled),input,select,a[href]')].filter(element => element.getClientRects().length);
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    updateExitControl();refresh();
    let historyAccount = user?.id || null;
    sb.auth.onAuthStateChange((event, authSession) => {
      const account = authSession?.user?.id || null;
      if (account === historyAccount) return;
      historyAccount = account;historyGeneration++;historyLoaded = false;historyOffset = 0;displayedHistory = [];
      byId('mwLiveHistory').replaceChildren();byId('mwLiveHistory').setAttribute('aria-busy', 'false');
      byId('mwLiveClearHistory').hidden = true;byId('mwLiveOlderHistory').hidden = true;
      window.setTimeout(() => { refresh(); }, 0);
    });
    window.setInterval(() => { if (document.visibilityState !== 'hidden' && Date.now() - lastDiscoveryCheck >= (window.mwSyncPeriod?.() ?? syncInterval) - 150) refresh(false); }, syncInterval);
    sb.channel('mw-galaxy-live-discovery').on('postgres_changes', { event: '*', schema: 'public', table: 'mw_video_live_sessions' }, () => refresh()).subscribe();
  }

  window.MilkyWayLive = { open, close, refresh, disconnect, watch, current: () => session, isHost: () => host, browse: () => open({ entry: 'viewer' }), liveNow: () => liveRecords, openSettings: () => { open();if (room) action('settings');else { if (!mode) setMode('video');byId('mwLiveSetup').scrollIntoView({ block: 'center' }); } }, start: nextMode => { open();if (!room) { setMode(nextMode === 'audio' ? 'audio' : 'video');byId('mwLiveTitle').focus(); } }, isActive: () => !!room || joining || !!pendingEndSession || previewTracks.length > 0 };
  window.addEventListener('pagehide', () => {
    if (host && conversationRoom() && connectionSession?.user?.id === session.host_id) {
      fetch('/.netlify/functions/milkyway-room', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${connectionSession.access_token}`, apikey: sb.supabaseKey || '' }, body: JSON.stringify({ room: session.room_name, action: 'end' }) }).catch(() => {});
    }
    disconnect();connectionSession = null;
  });
  window.addEventListener('hashchange', refresh);
  window.addEventListener('mw-language-change', () => {
    if (!byId('mwLivePage')) return;
    if (mode && !room) byId('mwLiveStart').textContent = translate(mode === 'audio' ? 'startAudioLive' : 'startVideoLive');
    roomChatSignature = '';
    discoverySignature = '';
    updateExitControl();renderGrid();renderConversationParticipants();paintParticipation();syncMedia();paintListening();paintServiceStatus();paintTaskbar();refresh();
    if (historyLoaded && !historyBusy) { const list = byId('mwLiveHistory');list.replaceChildren();displayedHistory.forEach(item => list.append(sessionCard(item.record, true, item.legacy)));if (!displayedHistory.length) list.textContent = translate('historyEmpty'); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
