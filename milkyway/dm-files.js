(() => {
  const endpoint = '/.netlify/functions/milkyway-attachment';
  const urls = new Map();
  let accountId = null;
  async function authorization() {
    const session = (await sb.auth.getSession()).data.session;
    if (!session) throw new Error(mwLang() === 'en' ? 'Sign in again to access private files.' : 'Ingia tena kufikia faili binafsi.');
    if (accountId !== session.user.id) { release(); accountId = session.user.id; }
    return `Bearer ${session.access_token}`;
  }
  function release() { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); accountId = null; }
  async function resolve(key) {
    const header = await authorization();
    if (urls.has(key)) return urls.get(key);
    const response = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, { headers: { Authorization: header, apikey: sb.supabaseKey || '' }, cache: 'no-store' });
    if (!response.ok) throw new Error((await response.json()).error || 'Private file unavailable.');
    const url = URL.createObjectURL(await response.blob());
    urls.set(key, url);
    return url;
  }
  async function upload(file, recipient, progress) {
    const header = await authorization();
    return new Promise((resolveUpload, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${endpoint}?recipient=${encodeURIComponent(recipient)}`);
      xhr.setRequestHeader('Authorization', header);
      xhr.setRequestHeader('apikey', sb.supabaseKey || '');
      xhr.timeout = 120000;
      xhr.upload.onprogress = event => progress(event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null);
      xhr.onerror = () => reject(new Error(mwLang() === 'en' ? 'Upload interrupted. Retry the remaining files.' : 'Upakiaji umekatika. Jaribu faili zilizobaki.'));
      xhr.ontimeout = xhr.onerror;
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status !== 201) reject(new Error(result.error || `Upload failed (${xhr.status}).`));
          else resolveUpload(result);
        } catch { reject(new Error('Private file service returned an invalid response.')); }
      };
      const form = new FormData();
      form.set('file', file);
      xhr.send(form);
    });
  }
  async function removeUnsent(key) {
    await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Authorization: await authorization(), apikey: sb.supabaseKey || '' } });
  }
  window.MilkyWayFiles = { resolve, upload, removeUnsent, release };
  window.addEventListener('pagehide', release);
})();
