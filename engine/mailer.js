/* ============================================================
   OpenContact — moteur · envoi direct (Gmail, Outlook)
   Fournisseurs isolés derrière une même porte : construire le
   message, obtenir l'autorisation (OAuth côté navigateur, client
   PUBLIC — aucun secret dans le code), envoyer, dire clairement
   « expiré » quand il faut se reconnecter. L'utilisateur emploie
   SON compte : rien ne passe par un serveur OpenContact.
   · Gmail : jeton implicite en popup, envoi par l'API Gmail
     (message MIME encodé base64url).
   · Outlook : code + PKCE en popup (app déclarée « SPA », le
     guichet de jetons accepte le navigateur), envoi par Graph.
   Fonctions pures + fetch ; aucun accès au DOM (la popup et le
   postMessage vivent dans ui/connexions.js).
   ============================================================ */

/* identifiants d'application OAuth — PUBLICS (clients navigateur,
   sans secret). Vides tant que le mainteneur n'a pas déclaré les
   apps chez Google / Microsoft : l'interface propose alors de
   coller son propre identifiant (option avancée, utile en test). */
export const MAIL_CLIENTS = { gmail: '', outlook: '' };

export const MAIL_SCOPES = {
  gmail: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
  outlook: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access'
};

/* ---------- MIME (RFC 2822/2047) — pour l'API Gmail ---------- */
const b64 = u8 => {
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
};
export const toB64Url = s => b64(new TextEncoder().encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function encodeHeader(s){
  return /^[\x20-\x7E]*$/.test(s) ? s : '=?UTF-8?B?' + b64(new TextEncoder().encode(s)) + '?=';
}
export function buildMime(m){
  const lines = [
    'From: ' + m.from,
    'To: ' + m.to,
    'Subject: ' + encodeHeader(m.subject || ''),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(new TextEncoder().encode(m.body || '')).replace(/(.{76})/g, '$1\r\n')
  ];
  return lines.join('\r\n');
}

/* ---------- OAuth : URLs et PKCE ---------- */
export function authUrl(provider, clientId, redirectUri, o){
  o = o || {};
  if (provider === 'gmail'){
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'token',
      scope: MAIL_SCOPES.gmail, state: o.state || '', prompt: 'select_account',
      include_granted_scopes: 'true'
    });
  }
  if (provider === 'outlook'){
    return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
      scope: MAIL_SCOPES.outlook, state: o.state || '',
      code_challenge: o.challenge || '', code_challenge_method: 'S256'
    });
  }
  throw new Error('fournisseur');
}
/* le retour de popup : hash (implicite) et query (code) confondus */
export function parseCallback(href){
  const u = new URL(href);
  const out = {};
  for (const [k, v] of new URLSearchParams(u.hash.replace(/^#/, ''))) out[k] = v;
  for (const [k, v] of u.searchParams) if (!(k in out)) out[k] = v;
  return out;
}
export async function pkcePair(){
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dig = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64(dig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}
async function msToken(body){
  const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('autorisation');
  return j;
}
export const exchangeOutlookCode = o => msToken({
  client_id: o.clientId, grant_type: 'authorization_code', code: o.code,
  redirect_uri: o.redirectUri, code_verifier: o.verifier, scope: MAIL_SCOPES.outlook
});
export const refreshOutlook = o => msToken({
  client_id: o.clientId, grant_type: 'refresh_token', refresh_token: o.refresh,
  scope: MAIL_SCOPES.outlook
});

/* ---------- qui suis-je (adresse d'envoi affichée) ---------- */
export async function whoAmI(provider, token){
  if (provider === 'gmail'){
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error(r.status === 401 ? 'expire' : 'compte');
    return (await r.json()).email || '';
  }
  const r = await fetch('https://graph.microsoft.com/v1.0/me',
    { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error(r.status === 401 ? 'expire' : 'compte');
  const j = await r.json();
  return j.mail || j.userPrincipalName || '';
}

/* ---------- envoyer ----------
   Ne dit « parti » QUE sur confirmation du fournisseur ; 401 = à
   reconnecter (le brouillon ne bouge pas) ; le reste = « pas parti ». */
export async function sendMail(provider, token, msg){
  let r;
  if (provider === 'gmail'){
    r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: toB64Url(buildMime(msg)) })
    });
  } else if (provider === 'outlook'){
    r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: msg.subject || '',
          body: { contentType: 'Text', content: msg.body || '' },
          toRecipients: [{ emailAddress: { address: msg.to } }]
        },
        saveToSentItems: true
      })
    });
  } else throw new Error('fournisseur');
  if (r.status === 401 || r.status === 403) throw new Error('expire');
  if (!(r.ok || r.status === 202)) throw new Error('envoi');
  return true;
}
