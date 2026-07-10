/* ============================================================
   OpenContact — auto-tests du moteur (?test dans l'URL)
   Le gardien de l'extraction : si tout est vert, le moteur rend
   exactement ce qu'il rendait avant le découpage en modules.
   Chargé à la demande par app.js — résultats en console et dans
   window.__ocTests ; le toast est affiché par l'interface.
   ============================================================ */
import { esc, normName, extractCity, distKm, todayISO, localISO } from './engine/utils.js';
import { KDF_ITER, encryptOC2, decryptOC2, deriveKey, bytesToB64,
         fnv, ocKeystream, unsealOC1 } from './engine/crypto.js';
import { APP_VERSION, normalizeCompany, normalizeContact, normalizeProfile,
         pushHist, fillTpl, safeUrl } from './engine/model.js';
import { communityView, parseInput, sharePayload, fullPayload,
         encodeOCQ, splitOCQ, makeOCQJoiner, OCQP_CHUNK } from './engine/exchange.js';
import { findMatch, mergeIncoming, contactKey } from './engine/merge.js';
import { syncMerge, mergeTombs, TOMBS_MAX } from './engine/sync.js';
import { filterCompanies } from './engine/filter.js';
import { scoreOf } from './engine/score.js';
import { DATA_KEY, PROFILE_KEY, JOURNAL_KEY, ORPHANS_KEY, TOMBS_KEY, SYNC_KEY,
         RELAYS_KEY, DEVICE_KEY, DEVICES_KEY, PROMO_KEY,
         THEME_KEY, VIEW_KEY, OLD_V2, OLD_V1 } from './engine/storage.js';

export async function runSelfTests(){
  const R = [];
  const eq = (a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(`attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
  };
  const ok = v => { if (!v) throw new Error('condition fausse'); };
  const tests = {
    'esc neutralise le HTML': () =>
      eq(esc('<b a="1">&\''), '&lt;b a=&quot;1&quot;&gt;&amp;&#39;'),
    'normName : accents & ponctuation': () =>
      eq(normName('Éco-Truc & Cie'), 'ecotruccie'),
    'extractCity retire le code postal': () =>
      eq(extractCity('12 rue X, 59000 Lille'), 'Lille'),
    'distKm Paris–Lille ≈ 204': () =>
      ok(Math.abs(distKm(48.8566, 2.3522, 50.6329, 3.0573) - 204) < 8),
    'OC2 : aller-retour (format versionné)': async () => {
      const src = { a: 1, t: 'héllo' };
      const enc = await encryptOC2(src, 'mdp');
      ok(enc.startsWith('OC2.1.' + KDF_ITER + '.'));
      eq(await decryptOC2(enc, 'mdp'), src);
    },
    'OC2 : rejette un mauvais mot de passe': async () => {
      const enc = await encryptOC2({ a: 1 }, 'bon');
      try { await decryptOC2(enc, 'mauvais'); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'motdepasse'); }
    },
    'OC2 : lit l’ancien format v3 (150 000 it.)': async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey('x', salt, 150000);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('{"k":9}')));
      const legacy = 'OC2.' + bytesToB64(salt) + '.' + bytesToB64(iv) + '.' + bytesToB64(ct);
      eq(await decryptOC2(legacy, 'x'), { k: 9 });
    },
    'OC1 : lecture compatible': () => {
      const data = new TextEncoder().encode('{"companies":[]}');
      const ks = ocKeystream(fnv('OpenContact·communauté·v1'), data.length);
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) out[i] = data[i] ^ ks[i];
      const body = bytesToB64(out);
      eq(unsealOC1('OC1.' + fnv(body).toString(16) + '.' + body), { companies: [] });
    },
    'normalizeCompany : héritage v1, domaine inconnu, extra (D3)': () => {
      const c = normalizeCompany({ name: 'X', contact: 'Ana', email: 'a@b.fr', domain: 'zzz', champFutur: 42 });
      eq(c.domain, 'autre');
      eq(c.contacts.length, 1);
      eq(c.contacts[0].email, 'a@b.fr');
      eq(c.extra, { champFutur: 42 });
    },
    'communityView : aucune fuite privée': () => {
      const v = communityView(normalizeCompany({
        name: 'X', status: 'active', notes: 'secret',
        appliedAt: '2026-01-01', nextAction: '2026-02-01', nextActionText: 'Relancer',
        closedAt: '2026-03-01', closedReason: 'dropped',
        history: [{ d: '2026-01-01', t: 'x' }]
      }));
      for (const k of ['status', 'notes', 'appliedAt', 'nextAction', 'nextActionText',
                       'closedAt', 'closedReason', 'history', 'id', 'demo']) ok(!(k in v));
    },
    'statuts : migration v5 → 3 crans + clôture': () => {
      eq(normalizeCompany({ name: 'X', status: 'sent' }).status, 'active');
      eq(normalizeCompany({ name: 'X', status: 'followup' }).status, 'active');
      eq(normalizeCompany({ name: 'X', status: 'interview' }).status, 'reply');
      eq(normalizeCompany({ name: 'X', status: 'inconnu' }).status, 'todo');
      const won = normalizeCompany({ name: 'X', status: 'won', updatedAt: Date.UTC(2026, 0, 15) });
      eq(won.closedReason, 'won'); eq(won.closedAt, '2026-01-15'); eq(won.status, 'reply');
      const rej = normalizeCompany({ name: 'X', status: 'rejected' });
      eq(rej.closedReason, 'rejected'); ok(!!rej.closedAt);
      /* les nouvelles valeurs passent inchangées */
      const c = normalizeCompany({ name: 'X', status: 'active', closedReason: 'dropped', closedAt: '2026-02-02' });
      eq(c.status, 'active'); eq(c.closedReason, 'dropped'); eq(c.closedAt, '2026-02-02');
      eq(normalizeCompany({ name: 'X', closedReason: 'zzz' }).closedReason, '');
    },
    'findMatch : même ville = fusion, ville ≠ = nouvelle': () => {
      const comps = [normalizeCompany({ name: 'Capgemini', city: 'Lille' })];
      ok(findMatch({ name: 'capgemini', city: 'LILLE' }, comps) === comps[0]);
      ok(findMatch({ name: 'Capgemini', city: 'Paris' }, comps) === null);
    },
    'findMatch : homonymes ambigus → nouvelle piste (B8)': () => {
      const two = [
        normalizeCompany({ name: 'Capgemini', city: 'Lille' }),
        normalizeCompany({ name: 'Capgemini', city: 'Paris' })
      ];
      ok(findMatch({ name: 'Capgemini' }, two) === null);
      const one = [normalizeCompany({ name: 'Capgemini', city: 'Lille' })];
      ok(findMatch({ name: 'Capgemini' }, one) === one[0]);
    },
    'fusion : complète sans écraser · conflits (D2) · ✓→? (S5) · privé exclu': () => {
      const comps = [normalizeCompany({
        name: 'Alpha', city: 'Lille', desc: 'garde-moi',
        contacts: [{ name: 'Ana', email: 'ana@x.fr' }]
      })];
      const st = mergeIncoming([
        { name: 'Alpha', city: 'Lille', desc: 'autre desc', techs: 'Azure',
          contacts: [
            { name: 'Ana Dupont', email: 'ana@x.fr', phone: '0601', conf: 'ok' },
            { name: 'Rémi', email: 'remi@x.fr', conf: 'ok' }
          ] },
        { name: 'Beta', status: 'won', notes: 'privé du voisin',
          nextActionText: 'Relancer', nextAction: '2026-01-01', closedReason: 'dropped' }
      ], comps);
      const a = comps[0], b = comps[1];
      eq(st.addedC, 1); eq(st.enriched, 1); eq(st.addedCt, 1); eq(st.conflicts, 2);
      eq(a.desc, 'garde-moi'); eq(a.techs, 'Azure');
      eq(a.contacts[0].name, 'Ana'); eq(a.contacts[0].phone, '0601');
      eq(a.contacts[0].conf, 'doubt'); eq(a.contacts[1].conf, 'doubt');
      eq(b.status, 'todo'); eq(b.notes, '');
      eq(b.nextAction, ''); eq(b.nextActionText, '');
      eq(b.closedAt, ''); eq(b.closedReason, '');
    },
    'parseInput : garde-fous de taille (D4)': async () => {
      try { await parseInput('x'.repeat(4000001)); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'troplourd'); }
      const many = JSON.stringify({ companies: Array.from({ length: 2001 }, (_, i) => ({ name: 'c' + i })) });
      try { await parseInput(many); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'tropdepistes'); }
    },

    /* — tests de contrat (CONTRAT.md) : ce qui ne doit JAMAIS casser — */
    'contrat : clés de stockage inchangées': () => {
      eq(DATA_KEY, 'oc_data_v3');
      eq(PROFILE_KEY, 'oc_profile_v1');
      eq(JOURNAL_KEY, 'oc_journal_v1');
      eq(ORPHANS_KEY, 'oc_orphans_v1');
      eq(TOMBS_KEY, 'oc_tombs_v1');
      eq(SYNC_KEY, 'oc_sync_v1');
      eq(RELAYS_KEY, 'oc_relays_v1');
      eq(DEVICE_KEY, 'oc_device_v1');
      eq(DEVICES_KEY, 'oc_devices_v1');
      eq(PROMO_KEY, 'oc_promo_v1');
      eq(THEME_KEY, 'oc_theme');
      eq(VIEW_KEY, 'oc_view');
      eq(OLD_V2, 'oc_data_v2');
      eq(OLD_V1, 'ais_stage_targets_v1');
    },
    'dates : todayISO est en heure locale, jamais UTC': () => {
      const d = new Date();
      const manuel = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                     '-' + String(d.getDate()).padStart(2, '0');
      eq(todayISO(), manuel);
      eq(localISO(new Date(2026, 0, 5)), '2026-01-05');
    },
    'liens : safeUrl neutralise les schémas dangereux (S1)': () => {
      eq(safeUrl('javascript:alert(1)'), '');
      eq(safeUrl('data:text/html,x'), '');
      eq(safeUrl('vbscript:x'), '');
      eq(safeUrl('https://linkedin.com/in/ana'), 'https://linkedin.com/in/ana');
      eq(safeUrl('HTTP://x.fr/y'), 'HTTP://x.fr/y');
      eq(safeUrl('linkedin.com/in/ana'), 'https://linkedin.com/in/ana');
      eq(safeUrl(''), '');
      eq(normalizeContact({ name: 'A', link: 'javascript:alert(1)' }).link, '');
      eq(normalizeContact({ name: 'A', link: 'linkedin.com/in/a' }).link, 'https://linkedin.com/in/a');
    },
    'sync appareils : LWW par updatedAt, ajouts, tombstones': () => {
      const A = {
        companies: [
          normalizeCompany({ id: 'c1', name: 'Alpha', notes: 'version A', updatedAt: 100 }),
          normalizeCompany({ id: 'c2', name: 'Beta', updatedAt: 100 })
        ],
        orphans: [], profile: normalizeProfile({ name: 'Moi A', updatedAt: 50 }), tombs: []
      };
      const B = {
        companies: [
          normalizeCompany({ id: 'c1', name: 'Alpha', notes: 'version B plus récente', status: 'active', updatedAt: 200 }),
          normalizeCompany({ id: 'c3', name: 'Gamma', updatedAt: 100 })
        ],
        orphans: [normalizeContact({ id: 'o1', name: 'Léo' })],
        profile: normalizeProfile({ name: 'Moi B', updatedAt: 80 }),
        tombs: [{ id: 'c2', t: 300 }]
      };
      const r = syncMerge(B, A);
      eq(r.stats.addedC, 1);                       /* Gamma */
      eq(r.stats.updatedC, 1);                     /* Alpha version B */
      eq(r.stats.removedC, 1);                     /* Beta tuée par la tombstone */
      eq(r.stats.addedO, 1);
      eq(r.stats.profile, 'remote');
      const names = r.companies.map(c => c.name).sort();
      eq(names, ['Alpha', 'Gamma']);
      const alpha = r.companies.find(c => c.id === 'c1');
      eq(alpha.notes, 'version B plus récente');   /* le privé circule entre MES appareils */
      eq(alpha.status, 'active');
      eq(r.profile.name, 'Moi B');
      eq(r.tombs, [{ id: 'c2', t: 300 }]);
    },
    'sync appareils : une fiche modifiée APRÈS suppression ressuscite': () => {
      const local = { companies: [normalizeCompany({ id: 'c1', name: 'X', updatedAt: 500 })], tombs: [] };
      const remote = { companies: [], tombs: [{ id: 'c1', t: 400 }] };
      const r = syncMerge(remote, local);
      eq(r.companies.length, 1);
      eq(r.stats.removedC, 0);
    },
    'sync appareils : idempotente et symétrique (convergence)': () => {
      const A = { companies: [normalizeCompany({ id: 'c1', name: 'X', updatedAt: 100 })], tombs: [{ id: 'z', t: 10 }] };
      const B = { companies: [normalizeCompany({ id: 'c1', name: 'X ancien', updatedAt: 50 }),
                              normalizeCompany({ id: 'c2', name: 'Y', updatedAt: 60 })], tombs: [] };
      const ab = syncMerge(B, A);
      const ab2 = syncMerge(B, { companies: ab.companies, tombs: ab.tombs });
      eq(ab2.stats.addedC + ab2.stats.updatedC + ab2.stats.removedC, 0);   /* rejouer = rien */
      const ba = syncMerge(A, B);
      eq(ab.companies.map(c => c.id).sort(), ba.companies.map(c => c.id).sort());
      eq(ab.companies.find(c => c.id === 'c1').name, ba.companies.find(c => c.id === 'c1').name);
    },
    'sync appareils : mergeTombs plafonne et garde les plus récentes': () => {
      const many = Array.from({ length: TOMBS_MAX + 50 }, (_, i) => ({ id: 'k' + i, t: i }));
      const m = mergeTombs(many, [{ id: 'k0', t: 9999 }]);
      eq(m.length, TOMBS_MAX);
      eq(m[0], { id: 'k0', t: 9999 });
    },
    'contrat : OCQP — découpe du QR animé et réassemblage dans le désordre': () => {
      const court = 'OCQ1.petit';
      eq(splitOCQ(court), [court]);                       /* court = un seul QR, format inchangé */
      const long = 'OCQ1.' + 'x'.repeat(OCQP_CHUNK * 2 + 100);
      const parts = splitOCQ(long);
      eq(parts.length, 3);
      ok(parts.every((p, i) => p.startsWith('OCQP.' + (i + 1) + '.3.')));
      const j = makeOCQJoiner();
      let r = null;
      for (const p of [parts[2], parts[0], parts[1]]) r = j(p);   /* n'importe quel ordre */
      eq(r.done, true);
      eq(r.text, long);
      eq(j('OCQ1.abc'), null);                            /* pas une tranche : au lecteur normal */
      /* les doublons ne comptent qu'une fois */
      const j2 = makeOCQJoiner();
      j2(parts[0]); j2(parts[0]);
      eq(j2(parts[0]).got, 1);
    },
    'contrat : enveloppe « full » — champ tombs optionnel': () => {
      const prof = normalizeProfile({ name: 'Moi' });
      ok(!('tombs' in fullPayload([], prof)));
      eq(fullPayload([], prof, null, [{ id: 'a', t: 1 }]).tombs, [{ id: 'a', t: 1 }]);
    },
    'contrat : schéma d’une piste normalisée (27 champs exacts)': () => {
      eq(Object.keys(normalizeCompany({ name: 'X' })).sort(),
         ['address','appliedAt','city','closedAt','closedReason','confirmations','contacts',
          'createdAt','demo','desc','domain','history','id','lat','lng','name','nextAction',
          'nextActionText','notes','positions','process','status','techs','tips',
          'updatedAt','verifiedAt','website'].sort());
    },
    'contrat : schéma d’un contact normalisé (8 champs exacts)': () => {
      eq(Object.keys(normalizeContact({ name: 'A' })).sort(),
         ['conf','email','id','link','name','note','phone','role'].sort());
    },
    'contrat : enveloppe « share » — v4, sans profil ni champ privé': () => {
      const p = sharePayload([normalizeCompany({ name: 'X', status: 'active', notes: 'privé',
        appliedAt: '2026-01-01', nextActionText: 'Relancer', closedReason: 'dropped' })]);
      eq(p.v, 4); eq(p.kind, 'share'); eq(p.app, APP_VERSION);
      ok(!('profile' in p));
      for (const k of ['status','notes','appliedAt','nextAction','nextActionText',
                       'closedAt','closedReason','history','id','demo']) ok(!(k in p.companies[0]));
    },
    'contrat : enveloppe « full » — v4, avec profil (sauvegarde complète)': () => {
      const prof = normalizeProfile({ name: 'Moi' });
      const p = fullPayload([normalizeCompany({ name: 'X', notes: 'privé' })], prof);
      eq(p.v, 4); eq(p.kind, 'full'); eq(p.app, APP_VERSION);
      ok(p.profile === prof);
      eq(p.companies[0].notes, 'privé');   /* la sauvegarde, elle, garde le privé */
      ok(!('orphans' in p));               /* champ optionnel : absent si vide */
      const o = [normalizeContact({ name: 'Léo', email: 'leo@x.fr' })];
      eq(fullPayload([], prof, o).orphans, o);
    },
    'contrat : OCQ1 — aller-retour compact (QR), sans privé': async () => {
      if (typeof CompressionStream === 'undefined') return;   /* API absente : repli fichier assuré par l’UI */
      const src = normalizeCompany({ name: 'Oméga', city: 'Arras', techs: 'PfSense',
        status: 'active', notes: 'privé', contacts: [{ name: 'Zoé', email: 'z@x.fr' }] });
      const txt = await encodeOCQ([src]);
      ok(txt.startsWith('OCQ1.'));
      ok(!txt.includes('+') && !txt.includes('/') && !txt.includes('='));   /* base64url pur */
      const obj = await parseInput(txt);
      eq(obj.kind, 'share');
      eq(obj.companies[0].name, 'Oméga'); eq(obj.companies[0].techs, 'PfSense');
      ok(!('notes' in obj.companies[0]) && !('status' in obj.companies[0]));
      const dest = [];
      mergeIncoming(obj.companies, dest);
      eq(dest[0].contacts[0].email, 'z@x.fr');
    },
    'contrat : partage → réception, aller-retour sans perte (clair)': async () => {
      const src = normalizeCompany({ name: 'Gamma', city: 'Lyon', domain: 'cloud',
        techs: 'K8s', contacts: [{ name: 'Léa', email: 'lea@x.fr' }] });
      const obj = await parseInput(JSON.stringify(sharePayload([src])));
      eq(obj.kind, 'share');
      const dest = [];
      const st = mergeIncoming(obj.companies, dest);
      eq(st.addedC, 1);
      eq(dest[0].name, 'Gamma'); eq(dest[0].city, 'Lyon'); eq(dest[0].techs, 'K8s');
      eq(dest[0].contacts[0].email, 'lea@x.fr');
      eq(dest[0].status, 'todo'); eq(dest[0].notes, '');
    },
    'contrat : partage chiffré — mot de passe exigé puis accepté': async () => {
      const txt = await encryptOC2(sharePayload([normalizeCompany({ name: 'Delta' })]), 'promo2026');
      try { await parseInput(txt); throw new Error('accepté sans mot de passe !'); }
      catch (e) { eq(e.message, 'besoinpass'); }
      const obj = await parseInput(txt, 'promo2026');
      eq(obj.companies[0].name, 'Delta');
    },
    'OC1 : contenu altéré → refusé': () => {
      try { unsealOC1('OC1.abcd.QUJDRA=='); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'altéré'); }
    },
    'fusion : idempotente (re-fusionner le même fichier n’ajoute rien)': () => {
      const incoming = [{ name: 'Epsilon', city: 'Nice', contacts: [{ name: 'Sam', email: 's@x.fr' }] }];
      const dest = [];
      mergeIncoming(incoming, dest);
      const st2 = mergeIncoming(incoming, dest);
      eq(dest.length, 1);
      eq(st2.addedC, 0); eq(st2.addedCt, 0); eq(st2.conflicts, 0);
    },
    'profil : normalizeProfile répare les invariants': () => {
      const p = normalizeProfile(null);
      ok(Array.isArray(p.templates) && p.templates.length >= 1);
      ok(Array.isArray(p.confirmedIds));
      ok(p.flags && typeof p.flags === 'object');
      const q = normalizeProfile({ name: 'Moi', templates: 'cassé', confirmedIds: null, flags: 3 });
      eq(q.name, 'Moi');
      ok(Array.isArray(q.templates) && q.templates.length >= 1);
      ok(Array.isArray(q.confirmedIds));
      ok(q.flags && typeof q.flags === 'object');
    },
    'gabarits : fillTpl remplit piste, contact et profil': () => {
      const c = normalizeCompany({ name: 'Zeta', city: 'Lille' });
      const prof = normalizeProfile({ name: 'Ana B', formation: 'AIS' });
      eq(fillTpl('{{contact}} / {{entreprise}} ({{ville}}) — {{moi}}, {{formation}}', c, null, prof),
         'Madame, Monsieur / Zeta (Lille) — Ana B, AIS');
      eq(fillTpl('{{contact}}', c, { name: 'Léo' }, prof), 'Léo');
    },
    'score : borné 0–100, croissant avec la complétude': () => {
      const vide = scoreOf(normalizeCompany({ name: 'X' }));
      const pleine = scoreOf(normalizeCompany({
        name: 'X', city: 'Lille', desc: 'd', website: 'w', techs: 't', process: 'p', tips: 'c',
        positions: ['stage'], contacts: [{ name: 'A', email: 'a@b.fr' }],
        lat: 50, lng: 3, verifiedAt: new Date().toISOString().slice(0,10), confirmations: 3
      }));
      ok(vide >= 0 && vide <= 100 && pleine >= 0 && pleine <= 100);
      ok(pleine > vide);
    },
    'filtres : q / domaine / statut + tri A→Z (sans lire l’écran)': () => {
      const list = [
        normalizeCompany({ name: 'Bravo', city: 'Paris', domain: 'cyber', status: 'active', techs: 'Azure' }),
        normalizeCompany({ name: 'Alpha', city: 'Lille', domain: 'esn' })
      ];
      eq(filterCompanies(list, { q: 'azure' }).map(c => c.name), ['Bravo']);
      eq(filterCompanies(list, { domain: 'esn' }).map(c => c.name), ['Alpha']);
      eq(filterCompanies(list, { status: 'active' }).map(c => c.name), ['Bravo']);
      eq(filterCompanies(list, { sort: 'az' }).map(c => c.name), ['Alpha', 'Bravo']);
    },
    'tri « À faire » : la prochaine action la plus proche d’abord, sans rien de prévu à la fin': () => {
      const list = [
        normalizeCompany({ name: 'SansRien', updatedAt: 900 }),
        normalizeCompany({ name: 'Loin', nextAction: '2030-06-01', updatedAt: 1 }),
        normalizeCompany({ name: 'Retard', nextAction: '2020-01-01', updatedAt: 1 })
      ];
      eq(filterCompanies(list, { sort: 'action' }).map(c => c.name), ['Retard', 'Loin', 'SansRien']);
    },
    'tri « Près de moi » : distance croissante, sans coordonnées à la fin': () => {
      const list = [
        normalizeCompany({ name: 'SansCoord' }),
        normalizeCompany({ name: 'Paris', lat: 48.85, lng: 2.35 }),
        normalizeCompany({ name: 'Lille', lat: 50.63, lng: 3.06 })
      ];
      eq(filterCompanies(list, { sort: 'dist', userPos: { lat: 50.69, lng: 3.17 } }).map(c => c.name),
         ['Lille', 'Paris', 'SansCoord']);
    },
    'historique : pushHist plafonne à 40 entrées': () => {
      const c = normalizeCompany({ name: 'X' });
      for (let i = 0; i < 50; i++) pushHist(c, 't' + i);
      eq(c.history.length, 40);
      eq(c.history[39].t, 't49');
    },
    'doublons : contactKey — email > téléphone > nom+rôle': () => {
      eq(contactKey({ email: ' Ana@X.fr ' }), 'e:ana@x.fr');
      eq(contactKey({ phone: '06 01 02 03 04' }), 'p:0601020304');
      eq(contactKey({ name: 'Ana', role: 'RH' }), 'n:anarh');
      eq(contactKey({}), '');
    }
  };
  for (const name of Object.keys(tests)){
    try { await tests[name](); R.push({ test: name, résultat: '✓' }); }
    catch (e) { R.push({ test: name, résultat: '✗ ' + (e && e.message) }); }
  }
  const ko = R.filter(r => r.résultat !== '✓').length;
  console.table(R);
  if (ko) console.warn('Auto-tests :', ko, 'échec(s) sur', R.length);
  window.__ocTests = R;
  return R;
}
