/* ============================================================
   OpenContact v4 — couche interface (app.js)
   Tout ce qui touche l'écran vit ici : état de l'application,
   rendus, modales, carte Leaflet, écouteurs. Le moteur (modèle,
   stockage, crypto, fusion, score, filtres, géocodage) vit dans
   engine/ : il ne lit jamais l'écran — il reçoit des paramètres
   et rend des valeurs.
   Sommaire (numérotation historique conservée ; les sections
   parties au moteur pointent vers leur module) :
   2.utils écran 4.alerte sauvegarde 7.carte 8.thème/routes
   9.filtres/rendus 10.fiche 11.actions 12.suivi 13.formulaire
   14.email 15.docs 16.prompts 17.sélection 18.échange (volet
   interface) 19.écouteurs 21.init — auto-tests : tests.js (?test)
   ============================================================ */
import { esc, uid, fmtDate, todayISO, isLate, debounce, normName, extractCity,
         distKm, fmtDT, fmtSize, directionsUrl } from './engine/utils.js';
import { APP_VERSION, DOMAINS, STATUSES, POSITIONS, normalizeContact,
         contactHasData, normalizeCompany, normalizeProfile, pushHist,
         fillTpl } from './engine/model.js';
import { scoreOf } from './engine/score.js';
import { encryptOC2 } from './engine/crypto.js';
import { DATA_KEY, PROFILE_KEY, JOURNAL_KEY, THEME_KEY, VIEW_KEY, OLD_V2, OLD_V1,
         kvInit, kvGet, kvSet, getBackend, docGet, docPut, docDel } from './engine/storage.js';
import { filterCompanies } from './engine/filter.js';
import { mergeIncoming } from './engine/merge.js';
import { parseInput, sharePayload, fullPayload } from './engine/exchange.js';
import { geocodeAddress } from './engine/geo.js';

/* ---------- état ---------- */
let companies = [];
let profile = null;
let theme = 'light';
let route = 'pistes';
let viewMode = 'map';
let colorMode = 'domain';
let editingId = null;
let formPos = null;
let formContacts = [];
let placing = false;
let tempMarker = null;
let mailCompany = null;
let mailRecipients = [];
let cardShownId = null;
let selecting = null;              // null | 'share' | 'delete' | 'multi'
let selFrom = null;                // 'io' | 'home' — d'où la sélection a été lancée
let selectedIds = new Set();
let prevViewMode = null;
let lastFocus = null;
let journal = [];                  // journal global privé (jamais partagé)
let pq = null;                     // file de prospection : { ids:[], i }
let mailLogged = false;            // « email préparé » : une seule entrée par ouverture
let ioMode = 'recv';               // volet actif de la page Échanger
let docsMeta = {};                 // { cv:{name,size}, lettre:{name,size} } — les PDF vivent dans IndexedDB
let userPos = null;                // position volontaire (tri distance) — jamais enregistrée
let pendingFit = null;             // cadrage de carte différé tant qu'elle est masquée
let undoSnap = null, undoTimer = null;   // filet de sécurité fusion/restauration
let map = null, markersLayer = null, tileLayer = null;
const markerById = {};

/* ---------- 2. utilitaires d'écran (le reste : engine/utils.js) ---------- */
const $ = s => document.querySelector(s);
/* icône pixel (assets/icons/) teintée par currentColor — masque CSS .ic.
   mask-image est posé en style direct : une url() relative dans une
   variable CSS ne se résout pas pareil selon les navigateurs. */
function icHTML(name, extra){
  const u = 'url(assets/icons/' + name + '.svg)';
  return '<span class="ic' + (extra || '') + '" style="-webkit-mask-image:' + u + ';mask-image:' + u + '" aria-hidden="true"></span>';
}
function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('up', !$('#undoBar').hidden);   /* ne recouvre pas la barre « Annuler » */
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), Math.min(6500, 2400 + msg.length * 35));
}
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0B7268';
}
/* bouton à confirmation en deux temps (factorisé) */
function armButton(btn, confirmLabel, fn){
  if (btn.dataset.arm){
    delete btn.dataset.arm;
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    delete btn.dataset.orig;
    fn();
    return;
  }
  btn.dataset.orig = btn.innerHTML;
  btn.dataset.arm = '1';
  btn.textContent = confirmLabel;
  setTimeout(() => {
    if (btn.dataset.arm){
      delete btn.dataset.arm;
      btn.innerHTML = btn.dataset.orig;
      delete btn.dataset.orig;
    }
  }, 3200);
}
/* journal global (privé, jamais partagé ni exporté) : « qu'est-ce que j'ai fait, et quand ? » */
function logJ(txt, cid){
  journal.push({ t: Date.now(), txt, cid: cid || null });
  if (journal.length > 200) journal = journal.slice(-200);
  kvSet(JOURNAL_KEY, JSON.stringify(journal));
}
/* ---------- 3. encodage & chiffrement : engine/crypto.js ---------- */

/* ---------- 4. stockage : engine/storage.js — ici : alerte d'échec + enregistrement ---------- */
let saveWarnOn = false;
function setSaveWarn(bad){
  if (bad === saveWarnOn) return;
  saveWarnOn = bad;
  $('#saveWarn').hidden = !bad;
}
function saveData(){ kvSet(DATA_KEY, JSON.stringify(companies)).then(ok => setSaveWarn(!ok)); }
function saveProfile(){ kvSet(PROFILE_KEY, JSON.stringify(profile)).then(ok => setSaveWarn(!ok)); }

/* ---------- 5. modèle de données : engine/model.js ---------- */

/* ---------- 6. indice de complétude : engine/score.js — ici : sa pastille ---------- */
function scoreChipHTML(c){
  const s = scoreOf(c);
  const tone = s >= 70 ? 'ok' : s >= 40 ? 'mid' : 'low';
  return `<button type="button" class="score score--${tone}" data-sinfo="${s}" aria-label="Complétude ${s} sur 100 — toucher pour l'explication">${s}</button>`;
}

/* ---------- 7. carte ---------- */
function initMap(){
  /* si le CDN Leaflet n'a pas chargé (hors-ligne, réseau filtré), l'app doit
     rester pleinement utilisable en Liste/Grille — jamais d'écran mort */
  if (!window.L){
    const b = document.querySelector('.vswitch button[data-vm="map"]');
    if (b){ b.disabled = true; b.style.opacity = '.45'; b.title = 'Carte indisponible (pas de réseau)'; }
    $('#fabMap').hidden = true;                 /* pas de raccourci vers une carte morte */
    return;
  }
  map = L.map('map', {
    zoomControl: true,
    maxBounds: L.latLngBounds([[40.5,-6.5],[52.8,10.5]]),
    maxBoundsViscosity: 0.6,
    minZoom: 5
  }).setView([48.6, 2.6], 6);
  markersLayer = L.layerGroup().addTo(map);
  setTiles();
  map.on('click', e => {
    if (!placing) return;
    setFormPos(e.latlng.lat, e.latlng.lng);
    endPlacing(true);
  });
  window.addEventListener('resize', () => map.invalidateSize());
}
function setTiles(){
  if (!map) return;
  if (tileLayer) map.removeLayer(tileLayer);
  const style = theme === 'dark' ? 'dark_all' : 'light_all';
  tileLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19, subdomains: 'abcd'
  });
  tileLayer.once('tileerror', () => {
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);
  });
  tileLayer.addTo(map);
}
function colorOf(c){
  return colorMode === 'domain'
    ? (DOMAINS[c.domain]?.color || '#8A99A6')
    : (STATUSES[c.status]?.color || '#8A99A6');
}
/* zone tactile du marqueur : 44px au doigt (pointeur grossier), 26px à la souris — le point visuel reste 14px */
const PIN_HIT = (window.matchMedia && matchMedia('(pointer:coarse)').matches) ? 44 : 26;
function makeIcon(color, ping){
  return L.divIcon({
    className: '',
    html: `<span class="pin ${ping ? 'ping' : ''}" style="--c:${color}"></span>`,
    iconSize: [PIN_HIT, PIN_HIT], iconAnchor: [PIN_HIT/2, PIN_HIT/2], popupAnchor: [0,-12]
  });
}
function locateMe(target){
  if (!navigator.geolocation){
    toast('Géolocalisation non disponible sur cet appareil');
    if (target === 'sort'){ $('#fSort').value = 'recent'; renderResults(); updateFilterBtn(); }
    return;
  }
  toast('Recherche de ta position… (jamais enregistrée ni partagée)');
  navigator.geolocation.getCurrentPosition(pos => {
    const la = pos.coords.latitude, lo = pos.coords.longitude;
    userPos = { lat: la, lng: lo };                 /* en mémoire seulement, pour le tri distance */
    if (target === 'form'){ setFormPos(la, lo); toast('Position utilisée pour cette piste ✓'); return; }
    if (target === 'sort'){ renderResults(); toast('Pistes triées des plus proches ✓ — ta position n’est jamais enregistrée'); return; }
    if (!map){ $('#fSort').value = 'dist'; renderResults(); updateFilterBtn(); toast('Carte indisponible — pistes triées des plus proches ✓'); return; }
    if (viewMode !== 'map') setViewMode('map', { persist: false });
    map.setView([la, lo], 12);
    const mk = L.circleMarker([la, lo], { radius: 8, weight: 3, color: cssVar('--primary'), fillOpacity: .25 }).addTo(map);
    setTimeout(() => map.removeLayer(mk), 12000);
    renderResults();
    toast('Carte centrée sur toi — rien n’est enregistré');
  }, err => {
    if (target === 'sort'){ $('#fSort').value = 'recent'; renderResults(); updateFilterBtn(); }
    toast(err.code === 1 ? 'Autorisation refusée — la position reste 100 % optionnelle' : 'Position introuvable pour le moment');
  }, { enableHighAccuracy: false, timeout: 8000 });
}

/* ---------- 8. thème & routage ---------- */
function applyTheme(t){
  theme = t;
  document.documentElement.dataset.theme = t;
  const mt = $('#metaTheme');
  if (mt) mt.content = (t === 'dark') ? '#1E232B' : '#F7F6F1';   /* barre du navigateur assortie */
  kvSet(THEME_KEY, t);
  setTiles();
}
function toggleTheme(){ applyTheme(theme === 'dark' ? 'light' : 'dark'); }
const ROUTES = ['pistes','suivi','echanger','docs','prompts','guide','apropos'];
const MORE_ROUTES = ['docs','prompts','guide','apropos'];
function applyRoute(){
  let r = (location.hash || '').replace(/^#\/?/, '') || 'pistes';
  if (r === 'carte') r = 'pistes';
  if (!ROUTES.includes(r)) r = 'pistes';
  route = r;
  if (selecting && r !== 'pistes') endSelect(false);
  ROUTES.forEach(x => { const el = $('#view-' + x); if (el) el.hidden = (x !== r); });
  document.querySelectorAll('[data-r]').forEach(a => {
    const on = a.dataset.r === r;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  /* les pages du menu « Plus » allument l'entrée ⋯ / Plus ▾ : on sait toujours où on est */
  const inMore = MORE_ROUTES.includes(r);
  $('#btnMore').classList.toggle('on', inMore);
  $('#btnMoreTop').classList.toggle('on', inMore);
  toggleMore(false);
  if (r === 'pistes' && map && viewMode === 'map') setTimeout(() => map.invalidateSize(), 60);
  if (r === 'suivi') renderTrack();
  if (r === 'echanger'){ setIOMode(ioMode); updateShareCounts(); }
  closeSheet();
}
function toggleMore(open){
  const mm = $('#moreMenu');
  const want = (open === undefined) ? !mm.classList.contains('open') : open;
  if (want && matchMedia('(min-width:901px)').matches){
    /* desktop : le menu s'ancre au bouton « Plus ▾ », pas à un coin d'écran */
    const r = $('#btnMoreTop').getBoundingClientRect();
    mm.style.top = (r.bottom + 6) + 'px';
    mm.style.left = Math.max(8, Math.min(r.left, innerWidth - 235)) + 'px';
    mm.style.right = 'auto'; mm.style.bottom = 'auto';
  } else {
    mm.style.top = mm.style.left = mm.style.right = mm.style.bottom = '';
  }
  mm.classList.toggle('open', want);
  ['#btnMore','#btnMoreTop'].forEach(s => { const b = $(s); if (b) b.setAttribute('aria-expanded', String(want)); });
}

/* ---------- 9. mode de vue / filtres / rendus ---------- */
function setViewMode(vm, opts){
  if (vm === 'map' && !map) vm = 'list';        /* carte indisponible → la Liste prend le relais */
  viewMode = vm;
  if (!opts || opts.persist !== false) kvSet(VIEW_KEY, vm);   /* la préférence n'est mémorisée que sur choix explicite */
  document.querySelectorAll('.vswitch button').forEach(b => {
    const on = b.dataset.vm === vm;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('#modeCarte').hidden = (vm !== 'map');
  $('#modeFlat').hidden = (vm === 'map');
  if (vm === 'map' && map) setTimeout(() => {
    map.invalidateSize();
    if (pendingFit){ map.fitBounds(pendingFit, { maxZoom: 11 }); pendingFit = null; }
  }, 60);
  renderResults();
}
/* l'interface lit ses champs et délègue le tri/filtrage au moteur */
function filtered(){
  return filterCompanies(companies, {
    q: $('#q').value,
    domain: $('#fDomain').value,
    status: $('#fStatus').value,
    sort: $('#fSort').value,
    userPos
  });
}
function renderAll(){
  renderResults(); renderMarkers(); renderLegend();
  if (route === 'suivi') renderTrack();
  updateShareCounts();
  $('#emptyMap').hidden = companies.length > 0;
}
function metaLine(c){
  const bits = [];
  if ($('#fSort').value === 'dist' && userPos && c.lat != null){
    const km = distKm(userPos.lat, userPos.lng, c.lat, c.lng);
    bits.push((km < 10 ? km.toFixed(1).replace('.', ',') : String(Math.round(km))) + ' km');
  }
  if (c.city) bits.push(esc(c.city));
  const n = (c.contacts || []).length;
  if (n) bits.push(n + ' contact' + (n > 1 ? 's' : ''));
  const pos = (c.positions || []).map(p => POSITIONS[p]).join(', ');
  if (pos) bits.push(esc(pos));
  return bits.join(' · ');
}
function addSelCheck(el, c){
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'sel-check';
  cb.checked = selectedIds.has(c.id);
  cb.setAttribute('aria-label', 'Sélectionner ' + c.name);
  cb.addEventListener('click', e => { e.stopPropagation(); toggleSel(c.id, el, cb); });
  el.appendChild(cb);
  if (selectedIds.has(c.id)) el.classList.add('selected');
}
function makeCardEl(c, onOpen){
  const el = document.createElement('div');
  el.className = 'card';
  el.tabIndex = 0;
  el.style.setProperty('--c', colorOf(c));
  if (selecting) addSelCheck(el, c);
  const d = DOMAINS[c.domain] || DOMAINS.autre;
  const s = STATUSES[c.status] || STATUSES.todo;
  const main = document.createElement('div');
  main.className = 'card-main';
  main.innerHTML =
    `<div class="card-top"><h3>${esc(c.name)}</h3>${scoreChipHTML(c)}</div>` +
    (metaLine(c) ? `<div class="meta">${metaLine(c)}</div>` : '') +
    `<div class="chips">` +
      (c.demo ? `<span class="chip" style="--cc:var(--amber)">Exemple</span>` : '') +
      `<span class="chip" style="--cc:${d.color}">${esc(d.label)}</span>` +
      (c.status !== 'todo' ? `<span class="chip" style="--cc:${s.color}">${esc(s.label)}</span>` : '') +
    `</div>`;
  el.appendChild(main);
  const act = () => { if (selecting) toggleSel(c.id, el, el.querySelector('.sel-check')); else onOpen(); };
  el.addEventListener('click', e => { if (e.target.closest('.score') || e.target.closest('.sel-check')) return; act(); });
  el.addEventListener('keydown', ev => { if (ev.key === 'Enter') act(); });
  return el;
}
function makeRowEl(c){
  const el = document.createElement('div');
  el.className = 'row-item';
  el.tabIndex = 0;
  if (selecting) addSelCheck(el, c);
  const d = DOMAINS[c.domain] || DOMAINS.autre;
  const main = document.createElement('div');
  main.className = 'ri-main';
  main.innerHTML =
    `<h3>${esc(c.name)}${c.demo ? ' <span class="chip" style="--cc:var(--amber)">Exemple</span>' : ''}</h3>` +
    `<div class="ri-sub">${esc(d.label)}${metaLine(c) ? ' · ' + metaLine(c) : ''}</div>`;
  const dot = document.createElement('span');
  dot.className = 'dotc';
  dot.style.background = colorOf(c);
  const side = document.createElement('div');
  side.className = 'ri-side';
  side.innerHTML = scoreChipHTML(c);
  el.append(dot, main, side);
  const act = () => { if (selecting) toggleSel(c.id, el, el.querySelector('.sel-check')); else openCard(c); };
  el.addEventListener('click', e => { if (e.target.closest('.score') || e.target.closest('.sel-check')) return; act(); });
  el.addEventListener('keydown', ev => { if (ev.key === 'Enter') act(); });
  return el;
}
/* rendu par tranches : même avec des centaines de pistes, la liste reste fluide
   sur un téléphone modeste — la suite se charge en approchant du bas */
const RENDER_CHUNK = 80;
let renderLimit = RENDER_CHUNK;
let renderSig = '';
function moreBtnEl(rest){
  const b = document.createElement('button');
  b.className = 'btn';
  b.style.width = '100%';
  b.style.marginTop = '6px';
  b.textContent = `Afficher plus (${rest} restante${rest > 1 ? 's' : ''})`;
  b.addEventListener('click', () => { renderLimit += RENDER_CHUNK * 4; renderResults(); });
  if ('IntersectionObserver' in window){
    const io = new IntersectionObserver(es => {
      if (es.some(x => x.isIntersecting)){ io.disconnect(); b.click(); }
    }, { rootMargin: '600px' });
    io.observe(b);
  }
  return b;
}
/* compteur + entrée « Sélectionner » : la sélection multiple se lance là où sont les pistes */
function listToolsEl(n){
  const d = document.createElement('div');
  d.className = 'list-tools';
  d.innerHTML = `<span>${n} piste${n > 1 ? 's' : ''}${n !== companies.length ? ' / ' + companies.length : ''}</span><span class="grow"></span>`;
  const b = document.createElement('button');
  b.className = 'btn btn-sm';
  b.innerHTML = icHTML('checkbox', ' ic-14') + ' Sélectionner';
  b.setAttribute('aria-label', 'Sélectionner plusieurs pistes pour une action groupée');
  b.addEventListener('click', () => startSelect('multi'));
  d.appendChild(b);
  return d;
}
function renderResults(){
  const items = filtered();
  /* un changement de recherche / filtre / tri / vue repart sur la première tranche */
  const sig = [viewMode, $('#q').value, $('#fDomain').value, $('#fStatus').value, $('#fSort').value].join('¦');
  if (sig !== renderSig){ renderSig = sig; renderLimit = RENDER_CHUNK; }
  const shown = items.slice(0, renderLimit);
  const rest = items.length - shown.length;
  $('#countLine').textContent = items.length + ' piste' + (items.length > 1 ? 's' : '') +
    (items.length !== companies.length ? ` / ${companies.length}` : '');
  const emptyMsg = companies.length
    ? '<div class="empty-list">Aucune piste ne correspond à cette recherche.</div>'
    : '';
  if (viewMode === 'map'){
    const list = $('#list');
    list.innerHTML = '';
    if (!items.length){ list.innerHTML = emptyMsg; return; }
    if (!selecting) list.appendChild(listToolsEl(items.length));
    for (const c of shown) list.appendChild(makeCardEl(c, () => focusCompany(c.id)));
    if (rest > 0) list.appendChild(moreBtnEl(rest));
  } else {
    const inner = $('#flatInner');
    inner.innerHTML = '';
    if (!items.length){ inner.innerHTML = emptyMsg; return; }
    if (!selecting) inner.appendChild(listToolsEl(items.length));
    const wrap = document.createElement('div');
    wrap.className = viewMode === 'list' ? 'rows' : 'gcards';
    for (const c of shown) wrap.appendChild(viewMode === 'list' ? makeRowEl(c) : makeCardEl(c, () => openCard(c)));
    inner.appendChild(wrap);
    if (rest > 0) inner.appendChild(moreBtnEl(rest));
  }
}
function renderMarkers(){
  if (!markersLayer) return;
  markersLayer.clearLayers();
  for (const k in markerById) delete markerById[k];
  for (const c of filtered()){
    if (c.lat == null || c.lng == null) continue;
    const m = L.marker([c.lat, c.lng], { icon: makeIcon(colorOf(c), false), title: c.name });
    m.bindPopup(() => buildCardBody(c, true), { maxWidth: 300, minWidth: 245 });
    m.addTo(markersLayer);
    markerById[c.id] = m;
  }
}
function renderLegend(){
  const src = colorMode === 'domain' ? DOMAINS : STATUSES;
  $('#lgItems').innerHTML = Object.values(src).map(v =>
    `<div class="it"><span class="dot" style="background:${v.color}"></span>${esc(v.label)}</div>`
  ).join('') +
  `<div class="it" style="margin-top:3px"><span class="score score--ok">80</span>complétude /100 — touche le chiffre d'une fiche</div>`;
  document.querySelectorAll('#lgToggle button').forEach(b => {
    const on = b.dataset.mode === colorMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}


/* ---------- 10. fiche détaillée (popup carte + modale) ----------
   Gestion générique des modales : pile (B6, Échap ferme la plus haute),
   piège du focus (A2) et restitution du focus au déclencheur. */
const modalStack = [];
const modalOpener = {};
function openOverlay(id, focusSel){
  const ov = $('#' + id);
  if (!ov.classList.contains('open')){
    modalOpener[id] = document.activeElement;
    ov.classList.add('open');
    modalStack.push(id);
  }
  if (focusSel !== null){
    setTimeout(() => {
      const t = (focusSel && ov.querySelector(focusSel)) || firstFocusable(ov);
      if (t) try { t.focus(); } catch (e) {}
    }, 70);
  }
}
function closeOverlay(id, restoreFocus){
  const ov = $('#' + id);
  ov.classList.remove('open');
  const i = modalStack.indexOf(id);
  if (i > -1) modalStack.splice(i, 1);
  const op = modalOpener[id];
  delete modalOpener[id];
  if (restoreFocus !== false && !placing && !modalStack.length && op && document.contains(op)){
    try { op.focus(); } catch (e) {}
  }
}
function focusables(root){
  return Array.from(root.querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
}
function firstFocusable(ov){ return focusables(ov)[0] || null; }
function trapTab(e){
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  const box = $('#' + top);
  const f = focusables(box);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!box.contains(document.activeElement)){ first.focus(); e.preventDefault(); }
  else if (e.shiftKey && document.activeElement === first){ last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last){ first.focus(); e.preventDefault(); }
}

function contactBlock(ct){
  const wrap = document.createElement('div');
  wrap.className = 'ct';
  const conf = ct.conf === 'ok' ? '<span class="conf-ok">✓ vérifié</span>'
             : ct.conf === 'doubt' ? '<span class="conf-doubt">? à confirmer</span>' : '';
  const links = [];
  if (ct.email) links.push(`<a href="mailto:${esc(ct.email)}">${icHTML('mail', ' ic-14')} ${esc(ct.email)}</a>`);
  if (ct.phone) links.push(`<a href="tel:${esc(ct.phone.replace(/\s/g,''))}">${icHTML('phone', ' ic-14')} ${esc(ct.phone)}</a>`);
  if (ct.link){
    const url = /^https?:\/\//.test(ct.link) ? ct.link : 'https://' + ct.link;
    links.push(`<a href="${esc(url)}" target="_blank" rel="noopener">${icHTML('link', ' ic-14')} lien</a>`);
  }
  wrap.innerHTML =
    `<div class="ct-h"><b>${esc(ct.name || 'Contact')}</b>` +
    (ct.role ? `<span class="ct-role">— ${esc(ct.role)}</span>` : '') + conf + `</div>` +
    (links.length ? `<div class="ct-links">${links.join('')}</div>` : '') +
    (ct.note ? `<div class="ct-note">${esc(ct.note)}</div>` : '');
  return wrap;
}
function buildCardBody(c, inPopup){
  const d = DOMAINS[c.domain] || DOMAINS.autre;
  const box = document.createElement('div');
  box.className = 'pp';
  const pos = (c.positions || []).map(p =>
    `<span class="chip" style="--cc:var(--primary)">${esc(POSITIONS[p])}</span>`).join('');
  /* U4/lot 2 : le lieu (adresse complète, sinon ville) s'affiche en tête de fiche,
     avec l'itinéraire en un tap — l'app de navigation du téléphone prend le relais */
  const place = c.address || c.city || (c.lat != null ? 'Position sur la carte' : '');
  const dirUrl = directionsUrl(c);
  const locLine = place
    ? `<div class="pp-loc"><b>${esc(place)}</b>` +
      (dirUrl ? ` <a class="linklike" href="${esc(dirUrl)}" target="_blank" rel="noopener">${icHTML('directions', ' ic-14')} Itinéraire</a>` : '') +
      ((!inPopup && c.lat != null) ? ` <button type="button" class="linklike" data-seemap>Voir sur la carte</button>` : '') +
      `</div>`
    : '';
  let rows = '';
  if (c.address && c.city && !normName(c.address).includes(normName(c.city)))
    rows += `<div class="row"><span class="k">Ville</span><b>${esc(c.city)}</b></div>`;
  if (c.website){
    const url = /^https?:\/\//.test(c.website) ? c.website : 'https://' + c.website;
    rows += `<div class="row"><span class="k">Web</span><b><a href="${esc(url)}" target="_blank" rel="noopener">${esc(c.website)}</a></b></div>`;
  }
  if (c.techs) rows += `<div class="row"><span class="k">Technos</span><b>${esc(c.techs)}</b></div>`;
  /* en modale, le nom et le score vivent dans l'en-tête (pas de titre en double) ;
     en popup de carte, il n'y a pas d'en-tête : le titre reste dans le corps */
  const demoChip = c.demo ? ' <span class="chip" style="--cc:var(--amber)">Exemple</span>' : '';
  box.innerHTML =
    (inPopup ? `<h3>${esc(c.name)} ${scoreChipHTML(c)}${demoChip}</h3>` : '') +
    (c.desc ? `<div class="desc">${esc(c.desc)}</div>` : '') +
    locLine +
    `<div class="chips">${inPopup ? '' : demoChip}<span class="chip" style="--cc:${d.color}">${esc(d.label)}</span>${pos}</div>` +
    rows;
  if ((c.contacts || []).length){
    const cl = document.createElement('div');
    cl.className = 'ct-list';
    c.contacts.forEach(ct => cl.appendChild(contactBlock(ct)));
    box.appendChild(cl);
  }
  const extra = document.createElement('div');
  extra.innerHTML =
    (c.process ? `<details><summary>Process de recrutement</summary><div class="notes">${esc(c.process)}</div></details>` : '') +
    (c.tips ? `<details><summary>Conseils de la communauté</summary><div class="notes">${esc(c.tips)}</div></details>` : '');
  box.appendChild(extra);
  if (!inPopup){
    /* la vérification concerne les infos partagées : elle vit près d'elles,
       les actions principales, elles, sont dans le pied fixe de la modale */
    const vw = document.createElement('div');
    vw.className = 'pp-actions';
    vw.appendChild(mkBtn('J’ai vérifié ces infos', 'Confirmer que la fiche est exacte et à jour', () => confirmInfo(c), 'check'));
    box.appendChild(vw);
  }

  /* — suivi privé — */
  const priv = document.createElement('div');
  priv.innerHTML = `<div class="priv-sep">${icHTML('lock', ' ic-14')} mon suivi</div>`;
  let prows = '';
  if (c.appliedAt) prows += `<div class="row"><span class="k">Envoyée</span><b>${esc(fmtDate(c.appliedAt))}</b></div>`;
  if (c.nextAction) prows += `<div class="row"><span class="k">Action</span><b style="${isLate(c.nextAction) ? 'color:var(--amber)' : ''}">${esc(fmtDate(c.nextAction))}${isLate(c.nextAction) ? ' — en retard' : ''}</b></div>`;
  const histHtml = (c.history && c.history.length)
    ? `<details><summary>Historique (${c.history.length})</summary><ul class="timeline">` +
      c.history.slice().reverse().slice(0,10)
        .map(h => `<li><span class="d">${esc(fmtDate(h.d))}</span><span>${esc(h.t)}</span></li>`).join('') +
      `</ul></details>`
    : '';
  priv.innerHTML += prows + (c.notes ? `<div class="notes">${esc(c.notes)}</div>` : '') + histHtml;
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Mon statut');
  for (const k in STATUSES){
    const o = document.createElement('option');
    o.value = k; o.textContent = STATUSES[k].label;
    if (k === c.status) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    setStatus(c, sel.value);
    refreshCompany(c);                       /* B1 : mise à jour ciblée, la popup reste ouverte */
    toast('Statut : ' + STATUSES[c.status].label);
  });
  const selWrap = document.createElement('div');
  selWrap.style.marginTop = '6px';
  selWrap.appendChild(sel);
  priv.appendChild(selWrap);
  box.appendChild(priv);

  /* — actions inline : uniquement en popup de carte (la modale a son pied fixe) — */
  if (inPopup){
    const actions = document.createElement('div');
    actions.className = 'pp-actions';
    const closeCtx = () => { if (map) map.closePopup(); };
    actions.append(
      mkBtn('Écrire', 'Générer un email', () => { closeCtx(); openMail(c); }, 'mail'),
      mkBtn('J’ai vérifié ces infos', 'Confirmer que la fiche est exacte et à jour', () => confirmInfo(c), 'check'),
      mkBtn('Modifier', 'Modifier la piste', () => { closeCtx(); openForm(c.id); }, 'pencil')
    );
    const bDel = document.createElement('button');
    bDel.className = 'btn btn-sm btn-danger';
    bDel.innerHTML = c.demo ? 'Supprimer l’exemple' : icHTML('trash', ' ic-14');
    bDel.title = 'Supprimer la piste';
    bDel.setAttribute('aria-label', 'Supprimer la piste');
    bDel.addEventListener('click', () => {
      if (c.demo){ removeCompany(c.id); closeCtx(); return; }
      armButton(bDel, 'Sûr ?', () => { removeCompany(c.id); closeCtx(); });
    });
    actions.appendChild(bDel);
    box.appendChild(actions);
  }
  const seeBtn = box.querySelector('[data-seemap]');
  if (seeBtn) seeBtn.addEventListener('click', () => {
    closeCard();
    if (viewMode !== 'map') setViewMode('map');
    setTimeout(() => focusCompany(c.id), 90);
  });
  return box;
}
function mkBtn(txt, title, fn, icon){
  const b = document.createElement('button');
  b.className = 'btn btn-sm';
  b.innerHTML = (icon ? icHTML(icon, ' ic-14') + (txt ? ' ' : '') : '') + esc(txt);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', fn);
  return b;
}
/* modale fiche : titre + score dans l'en-tête, corps scrollable, actions dans
   un pied fixe (une seule action primaire : Écrire) — atteignables au pouce
   sans faire défiler toute la fiche */
function renderCardModal(c){
  $('#cardTitle').innerHTML = `${esc(c.name)} ${scoreChipHTML(c)}`;
  const body = $('#cardBody');
  body.innerHTML = '';
  body.appendChild(buildCardBody(c, false));
  const f = $('#cardFoot');
  f.innerHTML = '';
  const bDel = document.createElement('button');
  bDel.className = 'btn btn-sm btn-danger';
  bDel.innerHTML = c.demo ? 'Supprimer l’exemple' : icHTML('trash', ' ic-14') + ' Supprimer';
  bDel.setAttribute('aria-label', 'Supprimer la piste');
  bDel.addEventListener('click', () => {
    if (c.demo){ removeCompany(c.id); closeCard(); return; }
    armButton(bDel, 'Sûr ?', () => { removeCompany(c.id); closeCard(); });
  });
  const bEdit = mkBtn('Modifier', 'Modifier la piste', () => { closeCard(); openForm(c.id); }, 'pencil');
  const bMail = mkBtn('Écrire', 'Générer un email', () => { closeCard(); openMail(c); }, 'mail');
  bMail.classList.add('btn-primary');
  f.append(bDel, bEdit, bMail);
}
function openCard(c){
  cardShownId = c.id;
  renderCardModal(c);
  openOverlay('ovCard');
}
function closeCard(){ cardShownId = null; closeOverlay('ovCard'); }
function explainScore(n){
  toast(`Complétude ${n}/100 : la fiche est-elle complète, récente et confirmée (✓) ? ` +
        `C'est un indicateur d'entretien — pas une garantie d'exactitude.`);
}

/* ---------- 11. actions sur une piste + mise à jour ciblée (B1 / Pf1) ---------- */
function refreshCompany(c){
  hideUndo();                              /* toute modification invalide le filet « annuler la fusion » */
  saveData();
  const m = markerById[c.id];
  if (m){
    const fs = $('#fStatus').value;
    if (fs && c.status !== fs){
      /* la piste sort du filtre actif : son point disparaît proprement */
      markersLayer.removeLayer(m);
      delete markerById[c.id];
    } else {
      /* pas de clearLayers() : le marqueur et sa popup survivent */
      m.setIcon(makeIcon(colorOf(c), false));
      if (m.isPopupOpen()) m.setPopupContent(buildCardBody(c, true));
    }
  }
  if (cardShownId === c.id && $('#ovCard').classList.contains('open')) renderCardModal(c);
  renderResults();
  if (route === 'suivi') renderTrack();
}
function setStatus(c, st){
  if (c.status === st) return;
  c.status = st; c.updatedAt = Date.now();
  pushHist(c, 'Statut → ' + STATUSES[st].label);
  logJ('Statut : ' + c.name + ' → ' + STATUSES[st].label, c.id);
}
function confirmInfo(c){
  c.verifiedAt = todayISO();
  if (!profile.confirmedIds.includes(c.id)){
    c.confirmations = (c.confirmations || 0) + 1;
    profile.confirmedIds.push(c.id);
    saveProfile();
  }
  c.updatedAt = Date.now();
  pushHist(c, 'Fiche vérifiée ✓');
  logJ('Fiche vérifiée : ' + c.name, c.id);
  refreshCompany(c);
  if (!profile.flags.confirmTaught){                       /* U5 : pédagogie la 1re fois */
    profile.flags.confirmTaught = 1;
    saveProfile();
    toast('Merci. Ta confirmation date la fiche et augmente son indice de complétude — pour tout le monde.');
  } else {
    toast('Fiche marquée vérifiée.');
  }
}
function focusCompany(id){
  const c = companies.find(x => x.id === id);
  if (!c) return;
  if (viewMode !== 'map' || c.lat == null){ openCard(c); return; }
  const delay = route !== 'pistes' ? 130 : 0;
  if (route !== 'pistes') location.hash = '#/pistes';
  closeSheet();
  setTimeout(() => {
    map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 12), { duration: .65 });
    map.once('moveend', () => {
      const m = markerById[id];
      if (m){ m.setIcon(makeIcon(colorOf(c), true)); m.openPopup(); }
      else openCard(c);
    });
  }, delay);
}
function removeCompany(id){
  hideUndo();
  const gone = companies.find(x => x.id === id);
  companies = companies.filter(x => x.id !== id);
  profile.confirmedIds = profile.confirmedIds.filter(x => x !== id);
  shareSelIds.delete(id);
  selectedIds.delete(id);
  if (gone && !gone.demo) logJ('Piste supprimée : ' + gone.name);
  saveData(); saveProfile(); renderAll();
  if (cardShownId === id) closeCard();
  toast('Piste supprimée.');
}
function deleteMany(ids){
  hideUndo();
  const set = ids instanceof Set ? ids : new Set(ids);
  const n = companies.filter(c => set.has(c.id)).length;
  companies = companies.filter(c => !set.has(c.id));
  profile.confirmedIds = profile.confirmedIds.filter(id => !set.has(id));
  for (const id of set) shareSelIds.delete(id);
  if (cardShownId && set.has(cardShownId)) closeCard();
  if (n) logJ(n + ' piste' + (n > 1 ? 's' : '') + ' supprimée' + (n > 1 ? 's' : ''));
  saveData(); saveProfile(); renderAll();
}
function plus7(c){
  const d = new Date(); d.setDate(d.getDate() + 7);
  c.nextAction = d.toISOString().slice(0,10);
  c.updatedAt = Date.now();
  pushHist(c, 'Relance planifiée le ' + fmtDate(c.nextAction));
  logJ('Relance planifiée : ' + c.name, c.id);
  refreshCompany(c);
  toast('Relance planifiée le ' + fmtDate(c.nextAction));
}

/* ---------- 12. vue Suivi ---------- */
function renderTrack(){
  const n = companies.length;
  const sent = companies.filter(c => c.status !== 'todo').length;
  const itv = companies.filter(c => c.status === 'interview').length;
  const won = companies.filter(c => c.status === 'won').length;
  $('#stats').innerHTML =
    `<span class="stat">PISTES <b>${n}</b></span>` +
    `<span class="stat">ENGAGÉES <b>${sent}</b></span>` +
    `<span class="stat">ENTRETIENS <b>${itv}</b></span>` +
    `<span class="stat ok">DÉCROCHÉ <b>${won}</b></span>`;
  const late = companies.filter(c => isLate(c.nextAction) && !['rejected','won'].includes(c.status));
  const db = $('#dueBanner');
  if (late.length){
    db.hidden = false;
    db.textContent = late.length + ' relance(s) en retard : ' +
      late.map(c => c.name).slice(0,4).join(', ') + (late.length > 4 ? '…' : '');
  } else { db.hidden = true; }
  renderJournal();
  const body = $('#trackBody');
  body.innerHTML = '';
  if (!n){
    body.innerHTML = '<div class="empty-list">Rien à suivre pour l’instant.<br>Quand tu candidates, change le statut d’une piste : elle apparaîtra ici.</div>';
    return;
  }
  for (const st of ['todo','sent','followup','interview','rejected','won']){
    const items = companies.filter(c => c.status === st)
      .sort((a,b) => (a.nextAction || '9999').localeCompare(b.nextAction || '9999'));
    if (!items.length) continue;
    const sec = document.createElement('div'); sec.className = 'tk-sec';
    const head = document.createElement('div'); head.className = 'tk-h';
    head.innerHTML = `<span class="dot" style="background:${STATUSES[st].color}"></span>${esc(STATUSES[st].label)} · ${items.length}`;
    const grid = document.createElement('div'); grid.className = 'tk-cards';
    for (const c of items) grid.appendChild(trackCard(c));
    sec.append(head, grid);
    body.appendChild(sec);
  }
}
function trackCard(c){
  const el = document.createElement('div');
  el.className = 'tk-card';
  el.style.setProperty('--c', STATUSES[c.status]?.color || '#8A99A6');
  let dates = '';
  if (c.appliedAt) dates += `<span>envoyée le ${esc(fmtDate(c.appliedAt))}</span>`;
  if (c.nextAction){
    const late = isLate(c.nextAction) && !['rejected','won'].includes(c.status);
    dates += `<span class="${late ? 'late' : ''}">action le ${esc(fmtDate(c.nextAction))}${late ? ' — en retard' : ''}</span>`;
  }
  if (!dates) dates = '<span>— pas de dates (« Modifier » pour en ajouter)</span>';
  el.innerHTML = `<h4>${esc(c.name)}</h4><div class="tk-dates">${dates}</div>`;
  const act = document.createElement('div'); act.className = 'tk-actions';
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Changer le statut de ' + c.name);
  for (const k in STATUSES){
    const o = document.createElement('option');
    o.value = k; o.textContent = STATUSES[k].label;
    if (k === c.status) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { setStatus(c, sel.value); refreshCompany(c); });
  act.append(sel,
    mkBtn('+7 j', 'Planifier une relance dans 7 jours', () => plus7(c)),
    mkBtn('', 'Écrire un email', () => openMail(c), 'mail'),
    mkBtn('', 'Modifier la piste', () => openForm(c.id), 'pencil'),
    mkBtn('', 'Voir la piste', () => focusCompany(c.id), 'eye'));
  el.appendChild(act);
  return el;
}
/* journal global : les 40 dernières actions, toutes pistes confondues */
function renderJournal(){
  const wrap = $('#jrWrap'), list = $('#jrList');
  const items = journal.slice(-40).reverse();
  wrap.hidden = !items.length;
  if (!items.length) return;
  list.innerHTML = '';
  for (const e of items){
    const li = document.createElement('li');
    li.innerHTML = `<span class="d">${esc(fmtDT(e.t))}</span><span>${esc(e.txt)}</span>`;
    if (e.cid && companies.some(c => c.id === e.cid)){
      li.style.cursor = 'pointer';
      li.title = 'Voir la piste';
      li.addEventListener('click', () => focusCompany(e.cid));
    }
    list.appendChild(li);
  }
}

/* ---------- 13. formulaire piste ---------- */
function fillSelect(sel, src){
  sel.innerHTML = '';
  for (const k in src){
    const o = document.createElement('option');
    o.value = k; o.textContent = src[k].label;
    sel.appendChild(o);
  }
}
function buildPositionChecks(){
  const box = $('#fPositions');
  box.innerHTML = '';
  for (const k in POSITIONS){
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" value="${k}"> ${POSITIONS[k]}`;
    box.appendChild(l);
  }
}
function renderContactEditors(){
  const box = $('#contactsBox');
  box.innerHTML = '';
  formContacts.forEach((ct, i) => {
    const p = 'ct-' + ct.id;                        /* A4 : labels reliés par for/id */
    const el = document.createElement('div');
    el.className = 'ct-edit';
    el.innerHTML =
      `<button class="btn btn-sm btn-ghost ct-del" title="Retirer ce contact" aria-label="Retirer ce contact">✕</button>` +
      `<div class="grid2">` +
      `<div class="field"><label for="${p}-name">Nom</label><input id="${p}-name" data-cf="name" value="${esc(ct.name)}" placeholder="Prénom Nom"></div>` +
      `<div class="field"><label for="${p}-role">Rôle</label><input id="${p}-role" data-cf="role" value="${esc(ct.role)}" placeholder="RH, manager, alumni…"></div>` +
      `<div class="field"><label for="${p}-email">Email</label><input id="${p}-email" data-cf="email" type="email" value="${esc(ct.email)}"></div>` +
      `<div class="field"><label for="${p}-phone">Téléphone</label><input id="${p}-phone" data-cf="phone" type="tel" value="${esc(ct.phone)}"></div>` +
      `<div class="field"><label for="${p}-link">Lien (LinkedIn…)</label><input id="${p}-link" data-cf="link" type="url" value="${esc(ct.link)}"></div>` +
      `<div class="field"><label for="${p}-conf">Confiance</label><select id="${p}-conf" data-cf="conf">` +
        `<option value="">Non précisé</option>` +
        `<option value="ok"${ct.conf === 'ok' ? ' selected' : ''}>Vérifié ✓</option>` +
        `<option value="doubt"${ct.conf === 'doubt' ? ' selected' : ''}>À confirmer ?</option>` +
      `</select></div>` +
      `</div>` +
      `<div class="field"><label for="${p}-note">Note utile</label><input id="${p}-note" data-cf="note" value="${esc(ct.note)}" placeholder="Ex : répond vite par mail"></div>`;
    el.querySelectorAll('[data-cf]').forEach(inp => {
      inp.addEventListener('input', () => { ct[inp.dataset.cf] = inp.value; updateCtCount(); });
      inp.addEventListener('change', () => { ct[inp.dataset.cf] = inp.value; updateCtCount(); });
    });
    el.querySelector('.ct-del').addEventListener('click', () => {
      formContacts.splice(i, 1);
      if (!formContacts.length) formContacts.push(normalizeContact({}));
      renderContactEditors();
    });
    box.appendChild(el);
  });
  updateCtCount();
}
/* badge sur le pli « Contacts » : on voit d'un coup d'œil ce que contient la section fermée */
function updateCtCount(){
  const n = formContacts.filter(contactHasData).length;
  const b = $('#fsCtN');
  b.textContent = n || '';
  b.hidden = !n;
}
function setFormPos(lat, lng){
  formPos = (lat == null) ? null : { lat: +lat.toFixed(5), lng: +lng.toFixed(5) };
  $('#posVal').innerHTML = formPos
    ? `Position : <b>${formPos.lat}, ${formPos.lng}</b> ✓`
    : `Pas de position — la piste restera visible en Liste et Grille.`;
  if (!map) return;
  if (tempMarker){ map.removeLayer(tempMarker); tempMarker = null; }
  if (formPos) tempMarker = L.marker([formPos.lat, formPos.lng], { icon: makeIcon('var(--amber)', true) }).addTo(map);
}
function openForm(id){
  editingId = id || null;
  const c = id ? companies.find(x => x.id === id) : null;
  $('#formTitle').textContent = c ? 'Modifier la piste' : 'Ajouter une piste';
  $('#fName').value = c?.name || '';
  $('#fCity').value = c?.city || '';
  $('#fDom').value = c?.domain || 'esn';
  $('#fDesc').value = c?.desc || '';
  $('#fTechs').value = c?.techs || '';
  $('#fWeb').value = c?.website || '';
  $('#fAddr').value = c?.address || '';
  $('#fProcess').value = c?.process || '';
  $('#fTips').value = c?.tips || '';
  $('#fSta').value = c?.status || 'todo';
  $('#fAppl').value = c?.appliedAt || '';
  $('#fNext').value = c?.nextAction || '';
  $('#fNotes').value = c?.notes || '';
  document.querySelectorAll('#fPositions input').forEach(i => { i.checked = !!(c && c.positions.includes(i.value)); });
  formContacts = c ? c.contacts.map(ct => Object.assign({}, ct)) : [];
  if (!formContacts.length) formContacts = [normalizeContact({})];
  renderContactEditors();
  /* progressivité : seul l'essentiel est déplié — les sections remplies s'ouvrent d'elles-mêmes */
  $('#fsContacts').open = !!(c && c.contacts.length);
  $('#fsPlace').open = !!(c && (c.address || c.lat != null));
  $('#fsDetails').open = false;
  $('#fsSuivi').open = !!(c && (c.status !== 'todo' || c.notes || c.appliedAt || c.nextAction));
  const hw = $('#histWrap'), hl = $('#histList');
  if (c && c.history && c.history.length){
    hw.hidden = false;
    hl.innerHTML = c.history.slice().reverse().slice(0,10)
      .map(h => `<li><span class="d">${esc(fmtDate(h.d))}</span><span>${esc(h.t)}</span></li>`).join('');
  } else { hw.hidden = true; hl.innerHTML = ''; }
  const bd = $('#btnDelete');
  bd.hidden = !c;
  bd.textContent = 'Supprimer';
  delete bd.dataset.arm; delete bd.dataset.orig;
  $('#posHint').className = 'hint';
  $('#posHint').textContent = 'Optionnelle — elle rend la piste visible sur la Carte. « Placer sur la carte » ferme cette fenêtre le temps d’un tap ; « Ma position » n’est jamais enregistrée ailleurs que sur cette piste.';
  setFormPos(c?.lat ?? null, c?.lng);
  closeSheet();
  openOverlay('ovForm', '#fName');
}
function closeForm(){
  closeOverlay('ovForm');
  if (tempMarker){ map.removeLayer(tempMarker); tempMarker = null; }
  editingId = null; formPos = null;
  if (placing) endPlacing(false);
}
function saveForm(){
  const name = $('#fName').value.trim();
  if (!name){ toast('Le nom de la structure est obligatoire'); $('#fName').focus(); return; }
  const positions = Array.from(document.querySelectorAll('#fPositions input:checked')).map(i => i.value);
  const contacts = formContacts.map(normalizeContact).filter(contactHasData);
  const data = {
    name,
    city: $('#fCity').value.trim(),
    domain: $('#fDom').value,
    desc: $('#fDesc').value.trim(),
    techs: $('#fTechs').value.trim(),
    website: $('#fWeb').value.trim(),
    address: $('#fAddr').value.trim(),
    process: $('#fProcess').value.trim(),
    tips: $('#fTips').value.trim(),
    positions, contacts,
    appliedAt: $('#fAppl').value,
    nextAction: $('#fNext').value,
    notes: $('#fNotes').value.trim(),
    lat: formPos ? formPos.lat : null,
    lng: formPos ? formPos.lng : null,
    updatedAt: Date.now()
  };
  if (!data.city && data.address) data.city = extractCity(data.address);
  const newStatus = $('#fSta').value;
  let saved;
  if (editingId){
    const c = companies.find(x => x.id === editingId);
    /* historique enrichi : on note CE qui a changé, pas seulement le statut */
    const before = {
      notes: c.notes,
      nCt: (c.contacts || []).length,
      shared: JSON.stringify([c.desc, c.address, c.city, c.website, c.techs, c.process, c.tips, c.positions])
    };
    Object.assign(c, data);
    if (data.notes !== before.notes) pushHist(c, 'Notes mises à jour');
    if (contacts.length > before.nCt) pushHist(c, 'Contact ajouté (' + (contacts.length - before.nCt) + ')');
    else if (contacts.length < before.nCt) pushHist(c, 'Contact retiré');
    if (JSON.stringify([data.desc, data.address, data.city, data.website, data.techs, data.process, data.tips, data.positions]) !== before.shared)
      pushHist(c, 'Fiche complétée');
    setStatus(c, newStatus);
    logJ('Piste modifiée : ' + c.name, c.id);
    saved = c;
  } else {
    saved = normalizeCompany(Object.assign({ id: uid(), createdAt: Date.now(), status: 'todo' }, data));
    saved.history = [{ d: todayISO(), t: 'Piste créée' }];
    setStatus(saved, newStatus);
    companies.push(saved);
    logJ('Piste créée : ' + saved.name, saved.id);
  }
  hideUndo();
  saveData();
  const pos = formPos;
  closeForm();
  renderAll();
  toast('Piste enregistrée.');
  if (pos) focusCompany(saved.id);
}
async function geocode(){
  const addr = $('#fAddr').value.trim();
  const city = $('#fCity').value.trim();
  const name = $('#fName').value.trim();
  const q = addr || (city ? (name ? name + ', ' + city : city) : '');
  const hint = $('#posHint');
  if (!q){ hint.className = 'hint warn'; hint.textContent = 'Renseigne la ville ou l’adresse d’abord.'; return; }
  const b = $('#btnGeo');
  const bOrig = b.innerHTML;
  b.disabled = true; b.textContent = 'Recherche…';
  try {
    const pos = await geocodeAddress(q);
    setFormPos(pos.lat, pos.lng);
    if (map) map.setView([pos.lat, pos.lng], 13);
    hint.className = 'hint';
    hint.textContent = 'Position trouvée — ajuste avec « Placer sur la carte » si besoin.';
  } catch (e) {
    hint.className = 'hint warn';
    hint.textContent = (e.message === 'empty')
      ? 'Introuvable — utilise « Placer sur la carte » (un tap suffit).'
      : 'Géocodage indisponible pour le moment — « Placer sur la carte » fonctionne toujours.';
  }
  b.disabled = false; b.innerHTML = bOrig;
}
function startPlacing(){
  if (!map){ toast('Carte indisponible pour le moment — utilise « Depuis l’adresse ».'); return; }
  if (route !== 'pistes') location.hash = '#/pistes';
  if (viewMode !== 'map') setViewMode('map', { persist: false });
  placing = true;
  closeOverlay('ovForm', false);
  $('#placeBanner').classList.add('on');
  closeSheet();
}
function endPlacing(reopen){
  placing = false;
  $('#placeBanner').classList.remove('on');
  if (reopen !== false){
    $('#fsPlace').open = true;              /* le pli qui contient « Placer » doit être visible au retour */
    openOverlay('ovForm', '#btnPlace');
  }
}

/* ---------- 14. emails en un clic (remplissage des gabarits : engine/model.js) ---------- */
function openMail(c){
  mailCompany = c;
  mailLogged = false;
  mailRecipients = (c.contacts || []).filter(t => t.email);
  /* en file de prospection : progression visible, boutons d'enchaînement — chaque message reste individuel */
  $('#mailTitle').textContent = (pq ? `${pq.i + 1}/${pq.ids.length} — ` : 'Écrire à ') + c.name;
  $('#btnMailSkip').hidden = !pq;
  $('#btnMailSent').textContent = pq ? 'Envoyée · suivante' : 'Envoyée';
  /* une seule action primaire : en file, c'est l'enchaînement ; sinon, l'envoi */
  $('#btnMailSent').classList.toggle('btn-primary', !!pq);
  $('#btnMailto').classList.toggle('btn-primary', !pq);
  renderMailDocs();
  const to = $('#mailTo');
  to.innerHTML = '';
  if (mailRecipients.length){
    mailRecipients.forEach((t, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = (t.name || t.email) + (t.role ? ' — ' + t.role : '');
      to.appendChild(o);
    });
  } else {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'Aucun email sur cette piste';
    to.appendChild(o);
  }
  const tpl = $('#mailTpl');
  tpl.innerHTML = '';
  profile.templates.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = t.name;
    tpl.appendChild(o);
  });
  fillMail();
  openOverlay('ovMail', '#mailTo');
}
function currentCt(){
  return mailRecipients[+$('#mailTo').value] || (mailCompany && (mailCompany.contacts || [])[0]) || null;
}
function fillMail(){
  if (!mailCompany) return;
  const t = profile.templates[+$('#mailTpl').value || 0];
  if (!t) return;
  const ct = currentCt();
  $('#mailSubj').value = fillTpl(t.subject, mailCompany, ct, profile);
  $('#mailBody').value = fillTpl(t.body, mailCompany, ct, profile);
  updateMailto();
}
function updateMailto(){
  const a = $('#btnMailto');
  const ct = currentCt();
  const email = ct && ct.email;
  if (email){
    a.href = 'mailto:' + encodeURIComponent(email) +
      '?subject=' + encodeURIComponent($('#mailSubj').value) +
      '&body=' + encodeURIComponent($('#mailBody').value);
    a.style.opacity = '1'; a.style.pointerEvents = 'auto';
    $('#mailHint').textContent = 'Destinataire : ' + email;
  } else {
    a.removeAttribute('href');
    a.style.opacity = '.45'; a.style.pointerEvents = 'none';
    $('#mailHint').textContent = 'Pas d’email — copie le message et envoie-le via LinkedIn ou le formulaire du site.';
  }
}
function closeMail(){
  closeOverlay('ovMail');
  mailCompany = null;
  if (pq){
    const done = pq.i;
    pq = null;
    toast(`File interrompue (${done} piste${done > 1 ? 's' : ''} traitée${done > 1 ? 's' : ''}) — relance-la via « Sélectionner ».`);
  }
}
/* « email préparé » : trace dans l'historique de la piste + le journal, une fois par ouverture */
function logMailPrep(){
  if (!mailCompany || mailLogged) return;
  mailLogged = true;
  const ct = currentCt();
  const who = ct ? (ct.name || ct.email) : '';
  pushHist(mailCompany, 'Email préparé' + (who ? ' — ' + who : ''));
  logJ('Email préparé : ' + mailCompany.name + (who ? ' (' + who + ')' : ''), mailCompany.id);
  saveData();
}
/* ---------- 14bis. file de prospection : une piste après l'autre, jamais d'envoi groupé ---------- */
function startQueue(ids){
  const valid = ids.filter(id => companies.some(c => c.id === id));
  if (!valid.length){ toast('Sélectionne au moins une piste'); return; }
  pq = { ids: valid, i: 0 };
  logJ('File de prospection démarrée (' + valid.length + ' piste' + (valid.length > 1 ? 's' : '') + ')');
  toast('File de prospection : un email personnalisé par piste, à ton rythme');
  openQueueStep();
}
function openQueueStep(){
  const c = companies.find(x => x.id === pq.ids[pq.i]);
  if (!c){ advanceQueue(); return; }
  openMail(c);
}
function advanceQueue(){
  if (!pq) return;
  pq.i++;
  if (pq.i >= pq.ids.length){
    const n = pq.ids.length;
    pq = null;                                   /* avant closeMail : pas de toast « interrompue » */
    closeMail();
    logJ('File de prospection terminée (' + n + ' piste' + (n > 1 ? 's' : '') + ')');
    toast('File terminée : ' + n + ' piste' + (n > 1 ? 's' : '') + ' passée' + (n > 1 ? 's' : '') + ' en revue.');
  } else openQueueStep();
}

/* ---------- 15. page Mes docs (B4 : flush du profil avant fermeture) ---------- */
const flagSaved = () => {
  const f = $('#docsSaved');
  f.textContent = '· enregistré ✓';
  clearTimeout(f._h);
  f._h = setTimeout(() => f.textContent = '', 1600);
};
let profilePending = false;
const saveProfileD = debounce(() => { profilePending = false; saveProfile(); flagSaved(); }, 500);
function queueProfileSave(){ profilePending = true; saveProfileD(); }
function flushProfile(){ if (profilePending){ profilePending = false; saveProfile(); } }
function bindDocs(){
  document.querySelectorAll('[data-p]').forEach(inp => {
    inp.value = profile[inp.dataset.p] || '';
    inp.addEventListener('input', () => { profile[inp.dataset.p] = inp.value; queueProfileSave(); });
  });
  renderTpls();
  $('#btnAddTpl').addEventListener('click', () => {
    profile.templates.push({ id: uid(), name: 'Nouveau modèle', subject: '', body: '' });
    saveProfile(); renderTpls();
  });
}
function renderTpls(){
  const box = $('#tplList');
  box.innerHTML = '';
  profile.templates.forEach((t, i) => {
    const p = 'tpl-' + t.id;                        /* A4 : labels reliés */
    const el = document.createElement('div');
    el.className = 'pcard';
    el.style.background = 'var(--panel-2)';
    el.innerHTML =
      `<div class="grid2">` +
      `<div class="field"><label for="${p}-n">Nom du modèle</label><input id="${p}-n" data-tf="name" value="${esc(t.name)}"></div>` +
      `<div class="field"><label for="${p}-s">Objet</label><input id="${p}-s" data-tf="subject" value="${esc(t.subject)}"></div>` +
      `</div>` +
      `<div class="field"><label for="${p}-b">Message</label><textarea id="${p}-b" data-tf="body" style="min-height:130px">${esc(t.body)}</textarea></div>`;
    const del = document.createElement('button');
    del.className = 'btn btn-sm btn-danger';
    del.textContent = 'Supprimer ce modèle';
    del.addEventListener('click', () => armButton(del, 'Sûr ? Confirmer', () => {
      profile.templates.splice(i, 1); saveProfile(); renderTpls();
    }));
    el.appendChild(del);
    el.querySelectorAll('[data-tf]').forEach(inp => {
      inp.addEventListener('input', () => { t[inp.dataset.tf] = inp.value; queueProfileSave(); });
    });
    box.appendChild(el);
  });
}

/* ---------- 15bis. mes documents (CV / lettre en PDF — IndexedDB : engine/storage.js) ----------
   Stockés dans IndexedDB, une base SÉPARÉE des pistes (localStorage) :
   un PDF lourd ne peut donc jamais bloquer ni faire perdre les pistes.
   Jamais inclus dans un export ou un partage (construits sur companies/profile). */
const DOC_DEFS = [
  { k: 'cv',     label: 'Mon CV',                    short: 'CV' },
  { k: 'lettre', label: 'Ma lettre de motivation',   short: 'Lettre' }
];
async function loadDocsMeta(){
  docsMeta = {};
  for (const d of DOC_DEFS){
    try {
      const r = await docGet(d.k);
      if (r) docsMeta[d.k] = { name: r.name, size: r.size };
    } catch (e) { break; }
  }
}
function renderDocSlots(){
  const box = $('#docSlots');
  if (!box) return;
  box.innerHTML = '';
  for (const d of DOC_DEFS){
    const meta = docsMeta[d.k];
    const el = document.createElement('div');
    el.className = 'doc-slot';
    const main = document.createElement('div');
    main.className = 'ds-main';
    main.innerHTML = meta
      ? `<div class="ds-name">${esc(d.label)}</div><div class="ds-sub">${esc(meta.name)} · ${fmtSize(meta.size)} — prêt à joindre depuis « Écrire »</div>`
      : `<div class="ds-name">${esc(d.label)}</div><div class="ds-sub">Aucun PDF pour l'instant</div>`;
    el.appendChild(main);
    if (meta){
      el.appendChild(mkBtn('Ouvrir', 'Ouvrir ' + d.label, () => openDoc(d.k, 'open'), 'eye'));
      const del = document.createElement('button');
      del.className = 'btn btn-sm btn-ghost';
      del.textContent = '✕';
      del.title = 'Retirer ' + d.label;
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => armButton(del, 'Sûr ?', async () => {
        try { await docDel(d.k); } catch (e) {}
        delete docsMeta[d.k];
        renderDocSlots();
        toast(d.label + ' retiré — tes pistes ne sont pas concernées');
      }));
      el.appendChild(del);
    }
    const pick = document.createElement('button');
    pick.className = 'btn btn-sm';
    pick.innerHTML = meta ? icHTML('reload', ' ic-14') + ' Remplacer' : icHTML('folder', ' ic-14') + ' Choisir un PDF';
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/pdf,.pdf';
    inp.hidden = true;
    pick.addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      inp.value = '';
      if (!f) return;
      if (!(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))){ toast('Choisis un PDF'); return; }
      if (f.size > 15 * 1024 * 1024){ toast('PDF trop lourd (max 15 Mo) — allège-le d’abord'); return; }
      try {
        await docPut(d.k, { name: f.name, size: f.size, added: Date.now(), blob: f });
        docsMeta[d.k] = { name: f.name, size: f.size };
        renderDocSlots();
        toast(d.label + ' enregistré — stocké à part de tes pistes, jamais partagé.');
      } catch (e) {
        toast('Impossible d’enregistrer ce document ici — tes pistes ne sont pas affectées');
      }
    });
    el.append(pick, inp);
    box.appendChild(el);
  }
}
/* ouvrir / transmettre un document : partage natif si possible (idéal pour joindre
   à un mail sur téléphone), sinon ouverture, sinon téléchargement */
async function openDoc(k, how){
  let rec;
  try { rec = await docGet(k); } catch (e) { rec = null; }
  if (!rec){
    toast('Document introuvable — ajoute-le dans « Mon profil ».');
    delete docsMeta[k];
    renderDocSlots();
    return;
  }
  const file = new File([rec.blob], rec.name || 'document.pdf', { type: 'application/pdf' });
  if (how === 'share' && navigator.canShare && navigator.canShare({ files: [file] })){
    try { await navigator.share({ files: [file], title: rec.name }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const w = (how === 'open') ? window.open(url, '_blank') : null;
  if (!w){
    const a = document.createElement('a');
    a.href = url; a.download = rec.name || 'document.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Téléchargé — joins-le depuis ton appli mail');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
/* dans la modale email : CV et lettre à portée de main */
function renderMailDocs(){
  const row = $('#mailDocs');
  row.innerHTML = '';
  const have = DOC_DEFS.filter(d => docsMeta[d.k]);
  row.hidden = !have.length;
  if (!have.length) return;
  const lbl = document.createElement('span');
  lbl.className = 'hint';
  lbl.style.alignSelf = 'center';
  lbl.style.margin = '0';
  lbl.textContent = 'À joindre depuis ton appli mail :';
  row.appendChild(lbl);
  for (const d of have)
    row.appendChild(mkBtn(d.short, 'Joindre ou ouvrir ' + d.label, () => openDoc(d.k, 'share'), 'attachment'));
}

/* ---------- 16. prompts IA (modèle multi-contacts) ---------- */
const OC_SCHEMA = `[
  {
    "name": "Nom de la structure (obligatoire)",
    "city": "ville principale, sinon \\"\\"",
    "domain": "esn | cyber | cloud | dsi | public | startup | industrie | commerce | sante | autre",
    "desc": "activité en une phrase, sinon \\"\\"",
    "address": "adresse complète, sinon \\"\\"",
    "website": "site officiel, sinon \\"\\"",
    "techs": "technologies ou savoir-faire, séparés par des virgules, sinon \\"\\"",
    "positions": ["stage", "alternance", "cdi", "cdd", "freelance"],
    "process": "déroulé du recrutement si connu, sinon \\"\\"",
    "tips": "conseils utiles pour candidater, sinon \\"\\"",
    "contacts": [
      {
        "name": "nom du contact, sinon \\"\\"",
        "role": "poste (RH, manager…), sinon \\"\\"",
        "email": "email, sinon \\"\\"",
        "phone": "téléphone, sinon \\"\\"",
        "link": "LinkedIn ou page, sinon \\"\\"",
        "note": "info utile, sinon \\"\\"",
        "conf": "\\"ok\\" si vérifié, \\"doubt\\" si incertain, sinon \\"\\""
      }
    ],
    "lat": 50.12345,
    "lng": 3.12345
  }
]`;
const OC_RULES = `Règles impératives :
1. N'invente JAMAIS de nom, d'email ou de téléphone de contact. Information absente → "" ; information trouvée mais non confirmée → renseigne-la avec "conf": "doubt".
2. "contacts" peut contenir plusieurs personnes ou moyens de contact (RH, recruteur, email générique, standard…). [] si aucun.
3. "lat"/"lng" : coordonnées décimales approximatives de la ville si connues, sinon null.
4. "domain" : esn = services IT · cyber = cybersécurité · cloud = hébergeur · dsi = DSI de grande entreprise · public = secteur public · startup = startup/PME tech · industrie = industrie/BTP · commerce = commerce/services · sante = santé/social · autre.
5. "positions" : uniquement des codes parmi stage, alternance, cdi, cdd, freelance ([] si inconnu).
6. Une entrée par site géographique (« Capgemini Lille » et « Capgemini Paris » = deux entrées, avec leur "city").
7. Réponds UNIQUEMENT avec le tableau JSON : aucun texte autour, pas de balises Markdown.`;
const PROMPTS = [
  {
    title: 'Formater mes notes en pistes OpenContact',
    desc: 'Une liste d’entreprises en vrac (notes, annonces, tableur…) ? L’IA la transforme en fichier prêt à fusionner.',
    body: `Tu prépares des données pour OpenContact, un outil communautaire de partage de pistes et de contacts pour la recherche de stage/alternance/emploi.

À partir des informations fournies plus bas, génère un tableau JSON où chaque structure suit exactement ce format :

${OC_SCHEMA}

${OC_RULES}

Mon domaine / métier recherché : [TON DOMAINE, ex : administration systèmes & cybersécurité]
Ma zone : [TA VILLE / RÉGION]

Informations à formater :
[COLLE ICI TES NOTES OU TA LISTE]`
  },
  {
    title: 'Trouver des pistes dans ma zone',
    desc: 'Pour les IA avec navigation web : de nouvelles cibles vérifiées, déjà au bon format.',
    body: `Active ta navigation web si disponible.

Trouve [NOMBRE, ex : 10] structures susceptibles de recruter en [MÉTIER / DOMAINE] autour de [VILLE / RÉGION].
Pour chacune : vérifie le site officiel, la ville et l'activité réelle avant de l'inclure. Cherche aussi les moyens de contact publics (email recrutement, page carrières, standard) — sans jamais en inventer.

Restitue le résultat sous forme d'un tableau JSON au format exact :

${OC_SCHEMA}

${OC_RULES}`
  },
  {
    title: 'Personnaliser ma candidature pour une piste',
    desc: 'Colle une piste + ton profil : l’IA rédige un email court, précis et crédible.',
    body: `Tu es un conseiller en insertion professionnelle exigeant.

À partir de la piste et de mon profil ci-dessous, rédige un email de candidature spontanée :
- 120 à 160 mots maximum, ton professionnel et direct ;
- 1 phrase précise montrant que je connais l'entreprise (activité, technologies) ;
- 1 phrase reliant mes compétences à leurs besoins ;
- pas de flatterie creuse ; termine par une proposition d'échange concrète.

PISTE (entreprise, activité, technos, contact visé) :
[COLLE ICI]

MON PROFIL / MA LETTRE TYPE :
[COLLE ICI]`
  },
  {
    title: 'Préparer un entretien',
    desc: 'Questions probables, points à réviser, questions à poser — puis simulation.',
    body: `Je passe un entretien pour [POSTE] chez [ENTREPRISE] ([ACTIVITÉ / TECHNOLOGIES si connues]).

Prépare-moi en 4 parties :
1. Les 8 questions les plus probables (RH + techniques), avec l'intention cachée de chacune.
2. Les 5 notions techniques à réviser en priorité pour ce contexte.
3. 4 bonnes questions à poser en fin d'entretien.
4. Un jeu de rôle : pose-moi les questions une par une et critique honnêtement mes réponses.`
  },
  {
    title: 'Compléter une piste existante',
    desc: 'Pour les IA avec navigation web : remplit uniquement les champs vides, sans rien inventer.',
    body: `Active ta navigation web si disponible.

Voici une piste OpenContact incomplète. À partir du site officiel de l'entreprise et de sources fiables, complète UNIQUEMENT les champs vides ("" / [] / null). Ne modifie jamais un champ déjà rempli. Tu peux ajouter des contacts publics trouvés (page carrières, email recrutement) avec "conf": "doubt" s'ils ne sont pas confirmés.

${OC_RULES}

Restitue la piste complétée sous forme d'un tableau JSON contenant ce seul objet, au même format.

PISTE À COMPLÉTER :
[COLLE ICI]`
  }
];
function renderPrompts(){
  const box = $('#promptList');
  box.innerHTML = '';
  PROMPTS.forEach(p => {
    const el = document.createElement('div');
    el.className = 'pcard';
    el.innerHTML =
      `<h3>${esc(p.title)}</h3><div class="pd">${esc(p.desc)}</div>` +
      `<details><summary>Voir le prompt</summary><div class="pre">${esc(p.body)}</div></details>`;
    const b = document.createElement('button');
    b.className = 'btn btn-sm';
    b.innerHTML = icHTML('copy', ' ic-14') + ' Copier le prompt';
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(p.body); toast('Prompt copié — colle-le dans ton IA.'); }
      catch (e) { toast('Copie impossible ici — ouvre le prompt et sélectionne-le'); }
    });
    el.appendChild(b);
    box.appendChild(el);
  });
}

/* ---------- 17. sélection multiple (partage ciblé & suppression groupée) ---------- */
let shareSelIds = new Set();
function toggleSel(id, el, cb){
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  const on = selectedIds.has(id);
  if (el) el.classList.toggle('selected', on);
  if (cb) cb.checked = on;
  updateSelBar();
}
function updateSelBar(){
  const n = selectedIds.size;
  $('#selCount').textContent = n + ' sélectionnée' + (n > 1 ? 's' : '');
  /* norme : pas d'action groupée cliquable tant que rien n'est sélectionné */
  ['#selOk','#selQueue','#selShare','#selDel'].forEach(s => { $(s).disabled = !n; });
}
function startSelect(mode, preset){
  selecting = mode;                                  /* 'share' | 'delete' | 'multi' */
  selFrom = mode === 'multi' ? 'home' : 'io';
  selectedIds = new Set(preset || []);
  document.body.classList.add('selecting');
  if (route !== 'pistes') location.hash = '#/pistes';
  prevViewMode = viewMode;
  if (viewMode === 'map') setViewMode('list', { persist: false }); else renderResults();
  $('#selDel').hidden = !(mode === 'delete' || mode === 'multi');
  $('#selOk').hidden = mode !== 'share';
  $('#selQueue').hidden = mode !== 'multi';
  $('#selShare').hidden = mode !== 'multi';
  updateSelBar();
  $('#selBar').classList.add('on');
  closeSheet();
  toast(mode === 'share' ? 'Touche les pistes à inclure dans le partage, puis « Valider ».'
      : mode === 'delete' ? 'Touche les pistes à supprimer, puis « Supprimer ».'
      : 'Touche des pistes, puis choisis une action : Prospecter, Partager ou Supprimer.');
}
function endSelect(backToIO){
  if (!selecting) return;
  const from = selFrom;
  selecting = null; selFrom = null;
  document.body.classList.remove('selecting');
  $('#selBar').classList.remove('on');
  const back = prevViewMode;
  prevViewMode = null;
  if (back && back !== viewMode) setViewMode(back, { persist: false }); else renderResults();
  if (backToIO && from === 'io') openIO({});         /* on revient d'où on venait */
}
function updateShareCounts(){
  const pool = companies.filter(c => !c.demo);
  $('#shareAllCount').textContent = pool.length;
  shareSelIds = new Set([...shareSelIds].filter(id => pool.some(c => c.id === id)));
  $('#shareSelCount').textContent = shareSelIds.size;
  if (!shareSelIds.size && $('#scopeSel').checked) $('#scopeAll').checked = true;
  updateStorLine();
}
function updateStorLine(){                            /* D5 : jauge de stockage */
  if (route !== 'echanger') return;
  const bytes = (JSON.stringify(companies).length + JSON.stringify(profile).length) * 2;
  const ko = Math.max(1, Math.round(bytes / 1024));
  const n = companies.length;
  $('#storLine').textContent = n
    ? `Sur cet appareil : ${n} piste${n > 1 ? 's' : ''} · ≈ ${ko} Ko (plafond navigateur ~5 Mo).`
    : 'Aucune piste stockée pour l’instant.';
}

/* ---------- 18. échange — volet interface (moteur : engine/exchange.js · engine/merge.js) ---------- */
/* — 18a-bis. filet de sécurité : instantané avant fusion/remplacement + « ↩ Annuler » (30 s) —
   Version volontairement simple : on restaure l'état complet d'avant l'opération.
   Toute autre modification de données (ajout, statut, suppression…) invalide le filet. */
function takeSnapshot(){
  undoSnap = { c: JSON.stringify(companies), p: JSON.stringify(profile) };
}
function showUndo(msg, btnLabel){
  $('#undoMsg').textContent = msg;
  $('#btnUndo').textContent = btnLabel || 'Annuler';
  $('#undoBar').hidden = false;
  $('#toast').classList.add('up');                 /* un toast déjà affiché ne doit pas recouvrir la barre */
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 30000);
}
function hideUndo(){
  clearTimeout(undoTimer);
  if (!$('#undoBar').hidden) $('#undoBar').hidden = true;
  undoSnap = null;
  $('#toast').classList.remove('up');
}
function undoRestore(){
  if (!undoSnap) return;
  let cs, ps;
  try { cs = JSON.parse(undoSnap.c); ps = JSON.parse(undoSnap.p); }
  catch (e) { hideUndo(); return; }
  hideUndo();
  companies = (cs || []).map(normalizeCompany);
  profile = normalizeProfile(ps);
  saveData(); saveProfile();
  document.querySelectorAll('[data-p]').forEach(inp => { inp.value = profile[inp.dataset.p] || ''; });
  renderTpls();
  if (cardShownId && !companies.some(c => c.id === cardShownId)) closeCard();
  updateShareCounts();
  renderAll();
  toast('Annulé — tes données d’avant ont été restaurées telles quelles.');
}

/* — 18b. échange : interface — */
function ioFail(e){
  const m = e && e.message;
  if (m === 'vide') toast('Colle d’abord un fichier ou du JSON dans la zone « Recevoir »');
  else if (m === 'besoinpass'){ toast('Fichier protégé — entre le mot de passe de groupe.'); $('#ioPassWrap').hidden = false; $('#ioPass').focus(); }
  else if (m === 'motdepasse'){ toast('Mot de passe incorrect pour ce fichier'); $('#ioPass').focus(); $('#ioPass').select(); }
  else if (m === 'altéré') toast('Fichier incomplet ou modifié — redemande l’original');
  else if (m === 'nocrypto') toast('Chiffrement indisponible ici (page non sécurisée)');
  else if (m === 'troplourd') toast('Fichier trop volumineux (limite : ~4 Mo)');            /* D4 */
  else if (m === 'tropdepistes') toast('Trop de pistes dans ce fichier (limite : 2 000)');  /* D4 */
  else toast('Texte non reconnu : ni fichier OpenContact, ni JSON valide');
}
/* Pf2 : état visuel pendant la dérivation PBKDF2 (600 000 itérations) */
async function busy(btn, label, fn){
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}
function syncPassUI(){
  const visible = $('#sharePass').type === 'text';
  $('#pass2Row').hidden = visible || !$('#sharePass').value;      /* S1 : confirmation si masqué */
}
function toggleEye(){
  const show = $('#sharePass').type === 'password';
  ['#sharePass', '#sharePass2'].forEach(s => { $(s).type = show ? 'text' : 'password'; });
  const b = $('#btnEye');
  b.setAttribute('aria-pressed', String(show));
  b.innerHTML = icHTML(show ? 'eye-off' : 'eye');
  syncPassUI();
}
function getSharePass(forBackup){
  const p1 = $('#sharePass').value;
  if (forBackup && !$('#backupEnc').checked) return { pass: '' };  /* S4 : chiffrer la sauvegarde = choix explicite */
  if (!p1) return { pass: '' };
  if ($('#sharePass').type === 'password'){                        /* S1 : double saisie si le champ est masqué */
    const p2 = $('#sharePass2').value;
    if (p2 !== p1){
      $('#fsPass').open = true;
      $('#pass2Row').hidden = false;
      $('#sharePass2').focus();
      toast(p2 ? 'Les deux saisies ne correspondent pas — recommence'
               : 'Confirme le mot de passe (2ᵉ saisie) : une faute de frappe rendrait le fichier définitivement illisible');
      return null;
    }
  }
  return { pass: p1 };
}
function currentScopeList(){
  let list = companies.filter(c => !c.demo);
  if ($('#scopeSel').checked) list = list.filter(c => shareSelIds.has(c.id));
  return list;
}
async function makeExport(kind){
  const g = getSharePass(kind === 'full');
  if (!g) return null;
  const list = kind === 'share' ? currentScopeList() : companies.filter(c => !c.demo);
  if (kind === 'share' && !list.length){
    toast($('#scopeSel').checked
      ? 'Ta sélection est vide — « Choisir les pistes… » d’abord'
      : 'Aucune piste à partager pour l’instant');
    return null;
  }
  const payload = kind === 'share' ? sharePayload(list) : fullPayload(list, profile);
  let text;
  if (g.pass){
    try { text = await encryptOC2(payload, g.pass); }
    catch (e) { toast('Chiffrement indisponible ici (page non sécurisée)'); return null; }
  } else {
    text = JSON.stringify(payload);
  }
  return { text, n: list.length, enc: !!g.pass, kind };
}
function downloadText(exp){                                        /* D1 : fichier .oc téléchargeable */
  const name = (exp.kind === 'share' ? 'opencontact-partage-' : 'opencontact-sauvegarde-') + todayISO() + '.oc';
  const blob = new Blob([exp.text], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Téléchargé : ' + name + (exp.enc ? ' (chiffré)' : '') + '.');
}
/* la page Échanger montre un volet à la fois : Recevoir ou Donner */
function setIOMode(m){
  ioMode = m;
  $('#segRecv').classList.toggle('on', m === 'recv');
  $('#segGive').classList.toggle('on', m === 'give');
  $('#segRecv').setAttribute('aria-selected', String(m === 'recv'));
  $('#segGive').setAttribute('aria-selected', String(m === 'give'));
  $('#ioRecv').hidden = m !== 'recv';
  $('#ioGive').hidden = m !== 'give';
  if (m === 'give') updateShareCounts();
}
function openIO(opts){
  opts = opts || {};
  if (opts.receive) ioMode = 'recv';
  else if (opts.give) ioMode = 'give';
  if (route !== 'echanger') location.hash = '#/echanger';
  setIOMode(ioMode);
  syncPassUI();
  if (opts.receive) setTimeout(() => { try { $('#ioTA').focus(); } catch (e) {} }, 90);
}
/* le champ « mot de passe du fichier » n'apparaît que si le contenu collé est chiffré */
function syncIOPass(){
  const enc = $('#ioTA').value.trim().startsWith('OC2.');
  if (enc) $('#ioPassWrap').hidden = false;
  else if (!$('#ioPass').value) $('#ioPassWrap').hidden = true;
}

/* ---------- bienvenue : trois écrans au tout premier lancement ----------
   Jamais montré à qui possède déjà des pistes (mise à jour transparente) ;
   le drapeau vit dans profile.flags, comme confirmTaught. */
let obStep = 0;
const OB_STEPS = 3;
function renderWelcome(){
  document.querySelectorAll('.ob-step').forEach(el => { el.hidden = (+el.dataset.ob !== obStep); });
  $('#obDots').innerHTML = Array.from({ length: OB_STEPS },
    (_, i) => `<i class="${i === obStep ? 'on' : ''}"></i>`).join('');
  $('#obCount').textContent = (obStep + 1) + '/' + OB_STEPS;
  $('#obNext').textContent = obStep === OB_STEPS - 1 ? 'Commencer' : 'Suivant';
}
function openWelcome(){
  obStep = 0;
  renderWelcome();
  openOverlay('ovWelcome', '#obNext');
}
function closeWelcome(){
  closeOverlay('ovWelcome');
  if (!profile.flags.onboarded){
    profile.flags.onboarded = 1;
    saveProfile();
  }
}

/* confirmation modale pour les actions destructives */
let confirmResolve = null;
function askConfirm(o){
  return new Promise(res => {
    confirmResolve = res;
    $('#cfTitle').textContent = o.title;
    $('#cfMsg').innerHTML = o.msg;
    $('#cfOk').textContent = o.okLabel || 'Confirmer';
    const vw = $('#cfVerifyWrap');
    vw.hidden = !o.verify;
    vw.dataset.word = o.verify || '';
    $('#cfVerify').value = '';
    $('#cfOk').disabled = !!o.verify;
    openOverlay('ovConfirm', o.verify ? '#cfVerify' : '#cfCancel');
  });
}
function settleConfirm(ok){
  if (!$('#ovConfirm').classList.contains('open')) return;
  closeOverlay('ovConfirm');
  const r = confirmResolve;
  confirmResolve = null;
  if (r) r(!!ok);
}

/* ---------- piste d'exemple ---------- */
function addDemo(){
  if (companies.some(c => c.demo)){ toast('L’exemple est déjà dans tes pistes.'); renderAll(); return; }
  const d = normalizeCompany({
    name: 'Atelier Numérik (exemple)', demo: true, city: 'Lille', domain: 'esn',
    desc: 'Piste fictive pour montrer le format — supprime-la quand tu veux',
    techs: 'Windows Server, réseau, support N2', positions: ['stage','alternance'],
    tips: 'Exemple de conseil partagé : la candidature spontanée passe mieux le matin.',
    contacts: [{ name: 'Alex Martin', role: 'RH (fictif)', email: 'recrutement@exemple.invalid', conf: 'doubt', note: 'Contact d’illustration — non réel' }],
    lat: 50.6329, lng: 3.0573
  });
  d.demo = true;
  companies.push(d);
  saveData(); renderAll();
  toast('Exemple ajouté — ouvre-le, puis supprime-le quand tu veux.');
}

/* ---------- 19. écouteurs ---------- */
function closeSheet(){ const s = $('#results'); if (s) s.classList.remove('open'); }
function setLegendFold(folded){
  $('#legend').classList.toggle('folded', folded);
  $('#lgHead').setAttribute('aria-expanded', String(!folded));
}
function updateFilterBtn(){
  const n = ($('#fDomain').value ? 1 : 0) + ($('#fStatus').value ? 1 : 0) + ($('#fSort').value !== 'recent' ? 1 : 0);
  const badge = $('#bfN');
  badge.textContent = n || '';
  badge.hidden = !n;
  $('#btnFilters').setAttribute('aria-label', n ? `Filtres — ${n} actif${n > 1 ? 's' : ''}` : 'Filtres');
}
const OV_CLOSERS = {
  ovForm: () => closeForm(),
  ovWelcome: () => closeWelcome(),
  ovMail: () => closeMail(),
  ovCard: () => closeCard(),
  ovConfirm: () => settleConfirm(false)
};
function bindEvents(){
  fillSelect($('#fDom'), DOMAINS);
  fillSelect($('#fSta'), STATUSES);
  buildPositionChecks();
  for (const k in DOMAINS){
    const o = document.createElement('option'); o.value = k; o.textContent = DOMAINS[k].label;
    $('#fDomain').appendChild(o);
  }
  for (const k in STATUSES){
    const o = document.createElement('option'); o.value = k; o.textContent = STATUSES[k].label;
    $('#fStatus').appendChild(o);
  }

  /* contribution */
  $('#btnCTA').addEventListener('click', () => openForm(null));
  $('#fabAdd').addEventListener('click', () => openForm(null));
  $('#bnAdd').addEventListener('click', () => openForm(null));
  $('#btnAddEmpty').addEventListener('click', () => openForm(null));
  $('#btnImportEmpty').addEventListener('click', () => openIO({ receive: true }));   /* U6 */
  $('#btnDemoEmpty').addEventListener('click', addDemo);
  $('#btnLocEmpty').addEventListener('click', () => locateMe('map'));
  $('#locBtn').addEventListener('click', () => locateMe('map'));
  $('#btnAddContact').addEventListener('click', () => { formContacts.push(normalizeContact({})); renderContactEditors(); });

  /* liste latérale mobile */
  $('#fabList').addEventListener('click', () => $('#results').classList.toggle('open'));
  $('#dragZone').addEventListener('click', closeSheet);
  $('#dragZone').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); closeSheet(); } });
  /* la poignée se laisse aussi glisser vers le bas — le geste attendu d'un panneau */
  (() => {
    const sheet = $('#results'), dz = $('#dragZone');
    let sy = 0, dy = 0, on = false;
    dz.addEventListener('touchstart', e => {
      sy = e.touches[0].clientY; dy = 0; on = true;
      sheet.style.transition = 'none';
    }, { passive: true });
    dz.addEventListener('touchmove', e => {
      if (!on) return;
      dy = Math.max(0, e.touches[0].clientY - sy);
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    const end = () => {
      if (!on) return;
      on = false;
      sheet.style.transition = '';
      if (dy > 70) closeSheet();
      requestAnimationFrame(() => { sheet.style.transform = ''; });
    };
    dz.addEventListener('touchend', end);
    dz.addEventListener('touchcancel', end);
  })();

  /* alerte de sauvegarde (B2) : export de secours en un clic */
  $('#swExport').addEventListener('click', () => {
    const payload = fullPayload(companies.filter(c => !c.demo), profile);
    downloadText({ text: JSON.stringify(payload), kind: 'full', enc: false });
  });

  /* formulaire */
  $('#xForm').addEventListener('click', closeForm);
  $('#btnCancel').addEventListener('click', closeForm);
  $('#btnSave').addEventListener('click', saveForm);
  $('#btnGeo').addEventListener('click', geocode);
  $('#btnPlace').addEventListener('click', startPlacing);
  $('#btnMyPos').addEventListener('click', () => locateMe('form'));
  $('#btnClearPos').addEventListener('click', () => setFormPos(null));
  $('#btnCancelPlace').addEventListener('click', () => endPlacing(true));
  $('#btnDelete').addEventListener('click', () => armButton($('#btnDelete'), 'Sûr ? Confirmer', () => {
    const id = editingId;
    closeForm();
    removeCompany(id);
  }));

  /* recherche / filtres / vues */
  const syncQClear = () => { $('#qClear').hidden = !$('#q').value; };
  $('#q').addEventListener('input', debounce(() => { renderResults(); renderMarkers(); }, 140));
  $('#q').addEventListener('input', syncQClear);
  $('#q').addEventListener('search', () => { syncQClear(); renderResults(); renderMarkers(); });
  $('#qClear').addEventListener('click', () => {
    $('#q').value = '';
    syncQClear();
    renderResults(); renderMarkers();
    $('#q').focus();
  });
  $('#fDomain').addEventListener('change', () => { renderResults(); renderMarkers(); updateFilterBtn(); });
  $('#fStatus').addEventListener('change', () => { renderResults(); renderMarkers(); updateFilterBtn(); });
  $('#fSort').addEventListener('change', () => {
    if ($('#fSort').value === 'dist' && !userPos) locateMe('sort');   /* position demandée seulement à ce moment-là */
    renderResults(); updateFilterBtn();
  });
  document.querySelectorAll('.vswitch button').forEach(b =>
    b.addEventListener('click', () => setViewMode(b.dataset.vm)));
  $('#fabMap').addEventListener('click', () => setViewMode('map'));
  $('#btnFilters').addEventListener('click', () => {
    const open = $('#fDrawer').classList.toggle('open');
    $('#btnFilters').setAttribute('aria-expanded', String(open));
  });

  /* explication du score au tap (U1) */
  document.addEventListener('click', e => {
    const s = e.target.closest('button.score');
    if (s) explainScore(s.dataset.sinfo);
  });

  /* légende */
  $('#lgHead').addEventListener('click', e => {
    if (e.target.closest('#lgToggle')) return;
    setLegendFold(!$('#legend').classList.contains('folded'));
  });
  $('#lgHead').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('#lgToggle')){
      e.preventDefault();
      setLegendFold(!$('#legend').classList.contains('folded'));
    }
  });
  $('#lgToggle').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    colorMode = b.dataset.mode;
    renderLegend(); renderMarkers(); renderResults();
    setLegendFold(false);
  });

  /* thème, menus, navigation */
  $('#btnTheme').addEventListener('click', toggleTheme);
  $('#btnMoreTop').addEventListener('click', () => toggleMore());
  $('#btnMore').addEventListener('click', e => { e.preventDefault(); toggleMore(); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#moreMenu') && !e.target.closest('#btnMore') && !e.target.closest('#btnMoreTop'))
      toggleMore(false);
  });
  window.addEventListener('hashchange', applyRoute);

  /* échange : volets Recevoir / Donner */
  $('#segRecv').addEventListener('click', () => setIOMode('recv'));
  $('#segGive').addEventListener('click', () => setIOMode('give'));

  /* échange : recevoir */
  $('#ioTA').addEventListener('input', syncIOPass);
  $('#btnOpenFile').addEventListener('click', () => $('#ioFile').click());
  $('#ioFile').addEventListener('change', () => {
    const f = $('#ioFile').files[0];
    $('#ioFile').value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024){ toast('Fichier trop volumineux (max 5 Mo)'); return; }
    const r = new FileReader();
    r.onload = () => {
      $('#ioTA').value = String(r.result || '');
      syncIOPass();
      const enc = $('#ioTA').value.trim().startsWith('OC2.');
      toast(enc ? 'Fichier chargé — entre le mot de passe puis « Fusionner ».'
                : 'Fichier chargé — clique « Fusionner dans mes pistes ».');
      (enc ? $('#ioPass') : $('#btnMerge')).focus();
    };
    r.onerror = () => toast('Lecture du fichier impossible');
    r.readAsText(f);
  });
  $('#btnMerge').addEventListener('click', () => busy($('#btnMerge'), 'Lecture…', async () => {
    let obj;
    try { obj = await parseInput($('#ioTA').value, $('#ioPass').value); }
    catch (e) { ioFail(e); return; }
    takeSnapshot();                                                /* filet de sécurité */
    const st = mergeIncoming(obj.companies, companies);
    logJ(`Fusion reçue : ${st.addedC} ajout(s), ${st.enriched} complétée(s), ${st.addedCt} contact(s)`);
    saveData(); renderAll();
    $('#ioTA').value = ''; $('#ioPass').value = '';
    syncIOPass();
    location.hash = '#/pistes';                                    /* on voit le résultat (et le bouton Annuler) */
    const parts = [`${st.addedC} nouvelle(s) piste(s)`, `${st.enriched} complétée(s)`, `${st.addedCt} contact(s) ajoutés`];
    if (st.conflicts) parts.push(`${st.conflicts} info(s) divergente(s) non importée(s)`);   /* D2 */
    if (obj.v && obj.v > 4) parts.push(`fichier v${obj.v} : champs inconnus conservés`);     /* D3 */
    showUndo('Fusion terminée : ' + parts.join(' · '), 'Annuler la fusion');
  }));

  /* échange : donner */
  $('#sharePass').addEventListener('input', syncPassUI);
  $('#btnEye').addEventListener('click', toggleEye);
  $('#btnPick').addEventListener('click', () => {
    if (!companies.filter(c => !c.demo).length){ toast('Aucune piste à sélectionner pour l’instant'); return; }
    startSelect('share', shareSelIds);
  });
  $('#btnDownload').addEventListener('click', () => busy($('#btnDownload'), 'Préparation…', async () => {
    const ex = await makeExport('share');
    if (!ex) return;
    downloadText(ex);
    logJ(`Partage téléchargé (${ex.n} piste${ex.n > 1 ? 's' : ''}${ex.enc ? ', chiffré' : ''})`);
  }));
  $('#btnCopy').addEventListener('click', () => busy($('#btnCopy'), 'Préparation…', async () => {
    const ex = await makeExport('share');
    if (!ex) return;
    try {
      await navigator.clipboard.writeText(ex.text);
      toast(`Copié — ${ex.n} piste(s)` + (ex.enc ? ' · chiffré' : ' · lisible (mot de passe = chiffré)') + '.');
      logJ(`Partage copié (${ex.n} piste${ex.n > 1 ? 's' : ''})`);
    } catch (e) {
      downloadText(ex);
      toast('Copie impossible ici — fichier téléchargé à la place.');
    }
  }));
  $('#btnExport').addEventListener('click', () => busy($('#btnExport'), 'Préparation…', async () => {
    if ($('#backupEnc').checked && !$('#sharePass').value){
      toast('Saisis d’abord un mot de passe de groupe (pli « Mot de passe » de « Donner »), ou décoche le chiffrement.');
      $('#fsPass').open = true;
      $('#sharePass').focus();
      return;
    }
    const ex = await makeExport('full');
    if (!ex) return;
    downloadText(ex);
    logJ('Sauvegarde complète téléchargée');
  }));
  $('#backupEnc').addEventListener('change', () => {
    if ($('#backupEnc').checked && !$('#sharePass').value){
      toast('Saisis un mot de passe de groupe dans le pli « Mot de passe » de « Donner ».');
      $('#fsPass').open = true;
      $('#sharePass').focus();
    }
  });

  /* échange : zone avancée */
  $('#btnBackupNow').addEventListener('click', () => busy($('#btnBackupNow'), 'Préparation…', async () => {
    const ex = await makeExport('full');
    if (!ex) return;
    downloadText(ex);
    logJ('Sauvegarde complète téléchargée');
  }));
  $('#btnSelDelete').addEventListener('click', () => {
    if (!companies.length){ toast('Rien à supprimer'); return; }
    startSelect('delete');
  });
  $('#btnDeleteAll').addEventListener('click', async () => {
    const n = companies.length;
    if (!n){ toast('Rien à supprimer'); return; }
    const ok = await askConfirm({
      title: 'Tout supprimer ?',
      msg: `Les <b>${n}</b> piste${n > 1 ? 's' : ''} et tout ton suivi privé seront <b>définitivement effacés</b> de cet appareil.<br>` +
           `Ton profil et tes modèles d'emails sont conservés.<br><br>` +
           `« Sauvegarder d'abord » te donne une copie de secours.`,
      okLabel: 'Tout supprimer',
      verify: 'SUPPRIMER'
    });
    if (!ok) return;
    deleteMany(companies.map(c => c.id));
    updateShareCounts();
    toast(n + ' piste(s) supprimée(s) — la carte est vide.');
  });
  $('#btnImport').addEventListener('click', () => busy($('#btnImport'), 'Lecture…', async () => {
    let obj;
    try { obj = await parseInput($('#ioTA').value, $('#ioPass').value); }
    catch (e) { ioFail(e); return; }
    if (obj.kind === 'share'){                                     /* B3 : garde-fou */
      toast('Ce fichier est un « partage » : il ne contient aucun suivi privé. Le remplacement effacerait le tien pour rien — utilise « Fusionner dans mes pistes » juste au-dessus.');
      $('#btnMerge').focus();
      return;
    }
    const ok = await askConfirm({
      title: 'Remplacer toutes mes données ?',
      msg: `Tes <b>${companies.length}</b> piste${companies.length > 1 ? 's' : ''} actuelle${companies.length > 1 ? 's' : ''} (suivi compris) seront remplacées par les <b>${obj.companies.length}</b> du fichier` +
           (obj.profile ? ', <b>profil et modèles compris</b>.' : '.') +
           `<br><br>Réservé à la restauration d'une sauvegarde — « Sauvegarder d'abord » en cas de doute.`,
      okLabel: 'Remplacer tout'
    });
    if (!ok) return;
    takeSnapshot();                                                /* filet de sécurité */
    companies = obj.companies.map(normalizeCompany);
    if (obj.profile && typeof obj.profile === 'object'){
      profile = normalizeProfile(obj.profile);
      saveProfile();
      document.querySelectorAll('[data-p]').forEach(inp => { inp.value = profile[inp.dataset.p] || ''; });
      renderTpls();
    }
    shareSelIds = new Set();
    $('#ioTA').value = ''; $('#ioPass').value = '';                /* B5 */
    syncIOPass();
    logJ('Sauvegarde restaurée (' + companies.length + ' piste(s))');
    saveData(); renderAll();
    location.hash = '#/pistes';
    showUndo('Restauration terminée : ' + companies.length + ' piste(s)', 'Annuler le remplacement');
  }));

  /* barre de sélection */
  $('#selAll').addEventListener('click', () => {
    for (const c of filtered()) selectedIds.add(c.id);
    renderResults(); updateSelBar();
  });
  $('#selNone').addEventListener('click', () => {
    selectedIds.clear();
    renderResults(); updateSelBar();
  });
  $('#selCancel').addEventListener('click', () => endSelect(true));
  const shareSelection = () => {
    const ids = [...selectedIds].filter(id => { const c = companies.find(x => x.id === id); return c && !c.demo; });
    if (!ids.length){ toast('Sélectionne au moins une piste (les exemples ne se partagent pas)'); return; }
    shareSelIds = new Set(ids);
    endSelect(false);
    $('#scopeSel').checked = true;
    updateShareCounts();
    openIO({ give: true });
    toast(ids.length + ' piste(s) dans « Ma sélection » — prêtes à partager.');
  };
  $('#selOk').addEventListener('click', shareSelection);
  $('#selShare').addEventListener('click', shareSelection);
  $('#selQueue').addEventListener('click', () => {
    const ids = [...selectedIds];
    if (!ids.length){ toast('Sélectionne au moins une piste (ou ✕ Annuler)'); return; }
    endSelect(false);
    startQueue(ids);
  });
  $('#selDel').addEventListener('click', async () => {
    const n = selectedIds.size;
    if (!n){ toast('Sélectionne au moins une piste (ou ✕ Annuler)'); return; }
    const ok = await askConfirm({
      title: `Supprimer ${n} piste${n > 1 ? 's' : ''} ?`,
      msg: `Suppression définitive, <b>suivi privé compris</b>.<br>En cas de doute : Annuler, puis « Sauvegarder d'abord » dans la page « Échanger ».`,
      okLabel: 'Supprimer définitivement'
    });
    if (!ok) return;
    deleteMany(selectedIds);
    endSelect(false);
    toast(n + ' piste(s) supprimée(s).');
  });

  /* filet de sécurité fusion/restauration */
  $('#btnUndo').addEventListener('click', undoRestore);
  $('#undoX').addEventListener('click', hideUndo);

  /* bienvenue */
  $('#obX').addEventListener('click', closeWelcome);
  $('#obSkip').addEventListener('click', closeWelcome);
  $('#obNext').addEventListener('click', () => {
    if (obStep >= OB_STEPS - 1){ closeWelcome(); return; }
    obStep++;
    renderWelcome();
  });

  /* modale de confirmation */
  $('#cfOk').addEventListener('click', () => settleConfirm(true));
  $('#cfCancel').addEventListener('click', () => settleConfirm(false));
  $('#cfX').addEventListener('click', () => settleConfirm(false));
  $('#cfVerify').addEventListener('input', () => {
    $('#cfOk').disabled = $('#cfVerify').value.trim().toUpperCase() !== $('#cfVerifyWrap').dataset.word;
  });
  $('#cfVerify').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !$('#cfOk').disabled) settleConfirm(true);
  });

  /* email */
  $('#xMail').addEventListener('click', closeMail);
  $('#mailTo').addEventListener('change', fillMail);
  $('#mailTpl').addEventListener('change', fillMail);
  $('#mailSubj').addEventListener('input', updateMailto);
  $('#mailBody').addEventListener('input', updateMailto);
  $('#btnMailCopy').addEventListener('click', async () => {
    logMailPrep();
    try { await navigator.clipboard.writeText($('#mailBody').value); toast('Message copié.'); }
    catch (e) { $('#mailBody').focus(); $('#mailBody').select(); toast('Sélectionné — fais « Copier »'); }
  });
  $('#btnMailto').addEventListener('click', logMailPrep);
  $('#btnMailSkip').addEventListener('click', advanceQueue);
  $('#btnMailSent').addEventListener('click', () => {
    const c = mailCompany;
    if (!c) return;
    const ct = currentCt();
    const who = ct ? (ct.name || ct.email) : '';
    pushHist(c, 'Email envoyé' + (who ? ' — ' + who : ''));
    logJ('Email envoyé : ' + c.name + (who ? ' (' + who + ')' : ''), c.id);
    if (c.status === 'todo') setStatus(c, 'sent');       /* on ne rétrograde jamais un statut plus avancé */
    if (!c.appliedAt) c.appliedAt = todayISO();
    c.updatedAt = Date.now();
    mailLogged = true;
    refreshCompany(c);
    if (pq) advanceQueue();
    else toast('Noté — suivi mis à jour.');
  });

  /* fiche détaillée */
  $('#xCard').addEventListener('click', closeCard);

  /* fermetures génériques : clic sur le fond */
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target !== ov) return;
      (OV_CLOSERS[ov.id] || (() => closeOverlay(ov.id)))();
    });
  });

  /* clavier : Échap ferme la modale la plus haute (B6), Tab reste piégé (A2),
     « / » saute à la recherche (hors champ de saisie) */
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab' && modalStack.length){ trapTab(e); return; }
    if (e.key === '/' && !modalStack.length && !e.ctrlKey && !e.metaKey && !e.altKey){
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      if (route !== 'pistes') location.hash = '#/pistes';
      setTimeout(() => { try { $('#q').focus(); } catch (x) {} }, 40);
      return;
    }
    if (e.key !== 'Escape') return;
    if (placing){ endPlacing(true); return; }
    if ($('#moreMenu').classList.contains('open')){ toggleMore(false); return; }
    const top = modalStack[modalStack.length - 1];
    if (top){ (OV_CLOSERS[top] || (() => closeOverlay(top)))(); return; }
    if (selecting){ endSelect(true); return; }
  });

  /* PWA : proposer l'installation quand le navigateur le permet (Android/desktop) */
  let installEv = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEv = e;
    $('#miInstall').hidden = false;
  });
  $('#miInstall').addEventListener('click', () => {
    toggleMore(false);
    if (!installEv) return;
    installEv.prompt();
    installEv = null;
    $('#miInstall').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#miInstall').hidden = true; toast('OpenContact est installé sur ton appareil.'); });

  /* B4 : la dernière frappe du profil n'est jamais perdue */
  window.addEventListener('beforeunload', flushProfile);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProfile();
  });
}

/* ---------- 20. auto-tests : tests.js (chargé à la demande via ?test) ---------- */

/* ---------- 21. démarrage ---------- */
(async function init(){
  applyRoute();                                   /* B7 : la bonne vue immédiatement, avant les données */
  $('#appVer').textContent = APP_VERSION;
  $('#sbVer').textContent = APP_VERSION;
  console.info('OpenContact', APP_VERSION);
  await kvInit();

  const t = await kvGet(THEME_KEY);
  theme = (t === 'light' || t === 'dark') ? t
    : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  $('#metaTheme').content = (theme === 'dark') ? '#1E232B' : '#F7F6F1';

  const rawP = await kvGet(PROFILE_KEY);
  let parsedP = null;
  if (rawP){ try { parsedP = JSON.parse(rawP); } catch (e) {} }
  profile = normalizeProfile(parsedP);

  try { journal = JSON.parse(await kvGet(JOURNAL_KEY)) || []; } catch (e) { journal = []; }
  if (!Array.isArray(journal)) journal = [];

  const raw = await kvGet(DATA_KEY);
  if (raw){
    try { companies = (JSON.parse(raw) || []).map(normalizeCompany); } catch (e) { companies = []; }
  }
  if (!companies.length){
    for (const k of [OLD_V2, OLD_V1]){
      const old = await kvGet(k);
      if (old){
        try {
          const arr = JSON.parse(old) || [];
          if (arr.length){
            companies = arr.map(normalizeCompany);
            saveData();
            setTimeout(() => toast('Tes anciennes données ont été migrées vers la nouvelle version.'), 800);
            break;
          }
        } catch (e) {}
      }
    }
  }

  initMap();
  bindEvents();
  bindDocs();
  renderDocSlots();
  loadDocsMeta().then(renderDocSlots);   /* les PDF (IndexedDB) arrivent sans bloquer le démarrage */
  renderPrompts();
  updateFilterBtn();

  /* premier lancement sur petit écran : la Liste accueille mieux qu'une carte vide.
     La préférence n'est mémorisée qu'à partir d'un choix explicite de l'utilisateur. */
  const vm = await kvGet(VIEW_KEY);
  const smallScreen = matchMedia('(max-width:900px)').matches;
  setViewMode((vm === 'map' || vm === 'list' || vm === 'grid') ? vm : (smallScreen ? 'list' : 'map'), { persist: false });
  if (matchMedia('(max-width:480px)').matches) $('#q').placeholder = 'Chercher…';
  renderAll();
  setLegendFold(companies.length >= 10);          /* U7 : légende dépliée tant que la base est petite */

  const placed = companies.filter(c => c.lat != null);
  if (placed.length && map){
    const b = L.latLngBounds(placed.map(c => [c.lat, c.lng])).pad(0.25);
    if (viewMode === 'map') map.fitBounds(b, { maxZoom: 11 });
    else pendingFit = b;                          /* la carte est masquée : cadrage appliqué à sa 1re ouverture */
  }
  applyRoute();

  if (getBackend() === 'memory') setSaveWarn(true);    /* B2 : alerte persistante, pas un toast fugace */

  /* PWA : après la première visite, l'app fonctionne hors-ligne et peut
     s'installer sur l'écran d'accueil. Enregistré en dernier : zéro impact
     sur le démarrage. En cas d'échec (vieux navigateur, file://), rien ne change. */
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller)
            toast('Nouvelle version prête — elle s’appliquera à la prochaine ouverture.');
        });
      });
    }).catch(() => {});
  }

  /* premier lancement : la promesse du produit en trois écrans */
  if (!companies.length && !profile.flags.onboarded &&
      !new URLSearchParams(location.search).has('test')){
    openWelcome();
  }

  if (new URLSearchParams(location.search).has('test')){
    import('./tests.js').then(m => m.runSelfTests()).then(R => {
      const ko = R.filter(r => r.résultat !== '✓').length;
      toast(ko ? `Auto-tests : ${ko} échec(s) sur ${R.length} — détails en console`
               : `Auto-tests : ${R.length}/${R.length} OK ✓`);
    });
  }
})();
