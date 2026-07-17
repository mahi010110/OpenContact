/* Compagnon — le cerveau (webview). Il exécute les MÊMES modules
   engine/ que la PWA (copiés par preparer.mjs — source unique) et
   demande tout le natif à la coquille Rust par `invoke` : jamais de
   réseau ni de secret côté JS (D17). C2 : état, appairage par code
   court, démarrage auto. */
const T = window.__TAURI__;
const invoke = T && T.core ? T.core.invoke : async () => { throw new Error('hors Tauri'); };

const q = s => document.querySelector(s);

async function majEtat(){
  try {
    const e = await invoke('etat_compagnon');
    q('#cgVer').textContent = 'v' + e.version;
    q('#cgAssoc').textContent = e.associe
      ? `Associé à « ${e.pair || 'ton OpenContact'} » ✓`
      : 'Pas encore associé.';
    q('#cgPair').hidden = e.associe;
    q('#cgUnpair').hidden = !e.associe;
    if (e.associe){ q('#cgCode').hidden = true; }
  } catch (err) {
    q('#cgAssoc').textContent = 'Coquille injoignable — lance le Compagnon, pas la page seule.';
  }
}
await majEtat();

/* appairage : un code court à recopier dans OpenContact */
q('#cgPair').disabled = false;
q('#cgPair').addEventListener('click', async () => {
  try {
    const code = await invoke('appairage_demarrer');
    const el = q('#cgCode');
    el.hidden = false;
    el.textContent = code;
    q('#cgPairHint').textContent =
      'Recopie ce code dans OpenContact : Moi → Mes appareils → « Ajouter le Compagnon ». Il expire dans 2 minutes.';
  } catch (e) {}
});
q('#cgUnpair').addEventListener('click', async () => {
  try { await invoke('dissocier'); } catch (e) {}
  q('#cgPairHint').textContent = '';
  majEtat();
});
if (T && T.event) T.event.listen('oc://associe', () => {
  q('#cgPairHint').textContent = '';
  majEtat();
});

/* messagerie : Gmail (mot de passe d'application) en chemin principal */
try {
  const r = await invoke('mail_reglage_lire');
  if (r){
    q('#cgDe').value = r.de || '';
    q('#cgHote').value = r.hote || '';
    q('#cgPort').value = r.port || '';
    q('#cgSec').value = r.securite || 'tls';
    if (r.de) q('#cgMailEtat').textContent = 'réglée ✓';
  }
} catch (e) {}
q('#cgMailOk').addEventListener('click', async () => {
  const de = q('#cgDe').value.trim();
  const reglage = {
    de,
    utilisateur: de,
    hote: q('#cgHote').value.trim() || 'smtp.gmail.com',
    port: +q('#cgPort').value || 465,
    securite: q('#cgSec').value || 'tls'
  };
  try {
    await invoke('mail_reglage_ecrire', { reglage, mdp: q('#cgMdp').value });
    q('#cgMdp').value = '';
    q('#cgMailEtat').textContent = 'réglée ✓ — le mot de passe est au trousseau';
  } catch (e) { q('#cgMailEtat').textContent = 'pas enregistré — réessaie'; }
});

/* démarrage automatique (optionnel) */
const auto = q('#cgAuto');
try { auto.checked = await invoke('autostart_etat'); } catch (e) {}
auto.addEventListener('change', async () => {
  try { await invoke('autostart_regler', { actif: auto.checked }); }
  catch (e) { auto.checked = !auto.checked; }
});

/* preuve que le moteur partagé se charge tel quel */
try {
  const { MISSION_KINDS } = await import('./moteur/engine/mission.js');
  const { DAILY_CAP, SEND_WINDOW_TXT } = await import('./moteur/engine/campaign.js');
  q('#cgMoteur').textContent =
    `moteur partagé chargé ✓ — missions : ${MISSION_KINDS.join(', ')} · ` +
    `${DAILY_CAP}/jour, ${SEND_WINDOW_TXT}`;
} catch (e) {
  q('#cgMoteur').textContent = 'moteur partagé absent — lance `node compagnon/preparer.mjs`.';
}
