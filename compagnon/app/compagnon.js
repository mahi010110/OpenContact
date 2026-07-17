/* Compagnon — le cerveau (webview). Il exécute les MÊMES modules
   engine/ que la PWA (copiés par preparer.mjs — source unique) et
   demande tout le natif à la coquille Rust par `invoke` : jamais de
   réseau ni de secret côté JS (D17). C1 : état + démarrage auto ;
   l'association, les missions et les envois arrivent aux phases
   suivantes. */
const invoke = window.__TAURI__ && window.__TAURI__.core
  ? window.__TAURI__.core.invoke
  : async () => { throw new Error('hors Tauri'); };

const q = s => document.querySelector(s);

/* état de la coquille */
try {
  const e = await invoke('etat_compagnon');
  q('#cgVer').textContent = 'v' + e.version;
  q('#cgAssoc').textContent = e.associe
    ? 'Associé à ton OpenContact ✓'
    : 'Pas encore associé.';
} catch (err) {
  q('#cgAssoc').textContent = 'Coquille injoignable — lance le Compagnon, pas la page seule.';
}

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
