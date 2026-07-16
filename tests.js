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
         pushHist, fillTpl, safeUrl, summarizeChanges,
         PROMPTS_MAX, PROMPT_MAX_LEN } from './engine/model.js';
import { communityView, parseInput, sharePayload, fullPayload,
         encodeOCQ, splitOCQ, makeOCQJoiner, OCQP_CHUNK,
         makeRdvCode, rdvNorm, rdvWrap, rdvParse } from './engine/exchange.js';
import { findMatch, mergeIncoming, contactKey } from './engine/merge.js';
import { syncMerge, mergeTombs, TOMBS_MAX } from './engine/sync.js';
import { filterCompanies, NATURAL_DIR } from './engine/filter.js';
import { scoreOf } from './engine/score.js';
import { DATA_KEY, PROFILE_KEY, JOURNAL_KEY, ORPHANS_KEY, TOMBS_KEY, SYNC_KEY,
         RELAYS_KEY, DEVICE_KEY, DEVICES_KEY, PROMO_KEY, VAULT_KEY,
         THEME_KEY, VIEW_KEY, OLD_V2, OLD_V1,
         kvGet, kvSet, kvDel, vaultActive } from './engine/storage.js';
import { VAULT_WORDS, PHRASE_LEN, makeVaultPhrase, normVaultPhrase, phraseUnknownWords,
         createVault, unlockWithPin, unlockWithPhrase, unlockWithPrf,
         setPin, addPrfWrap, rotateVault,
         sealValue, openValue, isSealed } from './engine/vault.js';
import { edAvailable, makeDeviceKeys, recoveryKeys, ringInit, ringAddDevice,
         ringCommand, ringTransfer, ringRecover, mergeRing, actionsFor,
         verifyRing, deviceIn } from './engine/ring.js';
import { DAILY_CAP, buildCampaign, dueSends, markSent, markReplied, markError,
         pauseCampaign, resumeCampaign, stopCampaign, campaignStats,
         addDays as cAddDays } from './engine/campaign.js';
import { buildMime, encodeHeader, toB64Url, authUrl, parseCallback, pkcePair } from './engine/mailer.js';

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
    'OCR1 : code de rendez-vous — généré, encapsulé, relu': () => {
      const code = makeRdvCode();
      ok(/^[a-z2-9]{5}-[a-z2-9]{5}$/.test(code));
      eq(rdvParse(rdvWrap(code)), rdvNorm(code));
      eq(rdvParse('OCR1. K7M3P-9XQ2F '), 'k7m3p9xq2f');   /* tolérant : casse, espaces, tiret */
      eq(rdvParse('OCQ1.abc'), null);                     /* les données ne sont pas un rendez-vous */
      eq(rdvNorm('hello'), '');                           /* trop court une fois normalisé */
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

    /* — tests de sécurité (docs/audit-securite.md) — */
    'OC2 : contenu altéré → refusé (tag GCM)': async () => {
      const enc = await encryptOC2({ a: 1 }, 'mdp');
      const p = enc.split('.');
      const ct = Array.from(atob(p[5]), ch => ch.charCodeAt(0));
      ct[0] ^= 0xFF;                                     /* un octet retourné */
      p[5] = btoa(String.fromCharCode.apply(null, ct));
      try { await decryptOC2(p.join('.'), 'mdp'); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'motdepasse'); }
    },
    'OCQ1 : bombe de décompression → refusée (troplourd)': async () => {
      if (typeof CompressionStream === 'undefined') return;
      /* quelques Ko compressés qui gonflent au-delà de la borne de 4 Mo */
      const raw = new TextEncoder().encode('"' + 'x'.repeat(4200000) + '"');
      const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const u8 = new Uint8Array(await new Response(stream).arrayBuffer());
      ok(u8.length < 100000);                            /* la bombe est bien petite */
      const b64url = bytesToB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { await parseInput('OCQ1.' + b64url); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'troplourd'); }
    },
    'sécurité : un id piégé est régénéré, un id normal est gardé (S2)': () => {
      eq(normalizeCompany({ name: 'X', id: 'c_abc_12345' }).id, 'c_abc_12345');
      const evil = normalizeCompany({ name: 'X', id: '"><img src=x onerror=alert(1)>' });
      ok(/^[A-Za-z0-9._-]{1,64}$/.test(evil.id));
      const ct = normalizeContact({ name: 'A', id: '"><b>' });
      ok(/^[A-Za-z0-9._-]{1,64}$/.test(ct.id));
    },
    'sécurité : une date piégée est vidée, une date ISO passe (S3)': () => {
      const c = normalizeCompany({ name: 'X', nextAction: '<img src=x>', appliedAt: 'zzz',
        closedAt: '2026-01-05T10:00:00Z', closedReason: 'won', verifiedAt: '2026-02-03' });
      eq(c.nextAction, ''); eq(c.appliedAt, '');
      eq(c.closedAt, '2026-01-05');                      /* horodatage → tronqué au jour */
      eq(c.verifiedAt, '2026-02-03');
      eq(normalizeCompany({ name: 'X', nextAction: '2026-03-01' }).nextAction, '2026-03-01');
    },
    'sécurité : « __proto__ » reçu = donnée ignorée, jamais un détournement (S4)': () => {
      const evil = JSON.parse('{"name":"X","futur":1,"__proto__":{"pwned":1},"extra":{"__proto__":{"pwned":2},"garde":3}}');
      const c = normalizeCompany(evil);
      ok(!('pwned' in {}));                              /* Object.prototype intact */
      ok(!('pwned' in c));
      eq(c.extra.futur, 1); eq(c.extra.garde, 3);
      ok(!Object.keys(c.extra).includes('__proto__'));
      const p = normalizeProfile(JSON.parse('{"name":"Moi","__proto__":{"pwned":4}}'));
      ok(!('pwned' in {}));
      eq(p.name, 'Moi');
      /* un id littéralement « __proto__ » reste une simple clé de la sync */
      const r = syncMerge({ companies: [{ id: '__proto__', name: 'Y', updatedAt: 5 }],
                            tombs: [{ id: '__proto__', t: 1 }] },
                          { companies: [], tombs: [] });
      ok(!('pwned' in {}));
      eq(r.companies.length, 1);
      eq(r.companies[0].name, 'Y');
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
      eq(VAULT_KEY, 'oc_vault_v1');
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
    'profil : prompts IA — un seul défaut, bornés (8 × 4 000)': () => {
      const p = normalizeProfile({});
      eq(p.prompts.length, 1);
      eq(p.prompts[0].name, 'Mes emails → pistes');
      ok(p.prompts[0].text.includes('"kind":"share"'));
      const many = normalizeProfile({ prompts: Array.from({ length: 12 }, (_, i) => ({ name: 'P' + i, text: 'x'.repeat(9000) })) });
      eq(many.prompts.length, PROMPTS_MAX);
      eq(many.prompts[0].text.length, PROMPT_MAX_LEN);
      eq(normalizeProfile({ prompts: [{ text: 'y' }] }).prompts[0].name, 'Prompt');
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
      eq(filterCompanies(list, { sort: 'dist', dir: 'desc', userPos: { lat: 50.69, lng: 3.17 } }).map(c => c.name),
         ['Paris', 'Lille', 'SansCoord']);
    },
    'tri : ↑↓ inverse chaque critère, les vides restent en fin': () => {
      const list = [
        normalizeCompany({ name: 'Bravo', updatedAt: 300 }),
        normalizeCompany({ name: 'Alpha', nextAction: '2030-06-01', updatedAt: 100 }),
        normalizeCompany({ name: 'Charlie', nextAction: '2020-01-01', updatedAt: 200 })
      ];
      eq(filterCompanies(list, { sort: 'az', dir: 'desc' }).map(c => c.name), ['Charlie', 'Bravo', 'Alpha']);
      eq(filterCompanies(list, { sort: 'action', dir: 'desc' }).map(c => c.name), ['Alpha', 'Charlie', 'Bravo']);
      eq(filterCompanies(list, { sort: 'recent', dir: 'asc' }).map(c => c.name), ['Alpha', 'Charlie', 'Bravo']);
    },
    'tri multi-niveaux : principal + départages, chacun son sens (3 max)': () => {
      const list = [
        normalizeCompany({ name: 'ActifLoin', status: 'active', nextAction: '2030-01-01', updatedAt: 1 }),
        normalizeCompany({ name: 'ActifTot', status: 'active', nextAction: '2026-01-01', updatedAt: 2 }),
        normalizeCompany({ name: 'Todo', status: 'todo', updatedAt: 3 })
      ];
      eq(filterCompanies(list, { sorts: [{ sort: 'status' }, { sort: 'action' }] }).map(c => c.name),
         ['Todo', 'ActifTot', 'ActifLoin']);
      /* le départage a SON sens, indépendant du principal */
      eq(filterCompanies(list, { sorts: [{ sort: 'status' }, { sort: 'action', dir: 'desc' }] }).map(c => c.name),
         ['Todo', 'ActifLoin', 'ActifTot']);
      /* « dist » sans position et critère inconnu : ignorés sans casse */
      eq(filterCompanies(list, { sorts: [{ sort: 'dist' }, { sort: 'zzz' }, { sort: 'az' }] }).map(c => c.name),
         ['ActifLoin', 'ActifTot', 'Todo']);
      /* au-delà de 3 niveaux : coupé — et rien ne se perd */
      eq(filterCompanies(list, { sorts: [{ sort: 'az' }, { sort: 'recent' }, { sort: 'action' }, { sort: 'score' }] }).length, 3);
    },
    'tri : dir absent = sens naturel du critère': () => {
      eq(NATURAL_DIR.recent, 'desc'); eq(NATURAL_DIR.az, 'asc'); eq(NATURAL_DIR.action, 'asc');
      const list = [normalizeCompany({ name: 'A', updatedAt: 1 }), normalizeCompany({ name: 'B', updatedAt: 2 })];
      eq(filterCompanies(list, { sort: 'recent' }).map(c => c.name),
         filterCompanies(list, { sort: 'recent', dir: 'desc' }).map(c => c.name));
    },
    'fiche : le « Confirmer » résume ce qui a réellement changé': () => {
      const avant = { status: 'todo', notes: '', nextAction: '', nextActionText: '' };
      eq(summarizeChanges(avant, { status: 'active', notes: 'vu au forum', nextAction: '2026-01-05', nextActionText: 'Relancer' }),
         'Statut → En cours · À faire : Relancer — 05/01/2026 · Notes modifiées');
      eq(summarizeChanges(avant, Object.assign({}, avant)), '');   /* rien de changé = rien d'écrit */
      eq(summarizeChanges({ status: 'todo', notes: '', nextAction: '2026-01-05', nextActionText: 'X' },
                          { status: 'todo', notes: '', nextAction: '', nextActionText: '' }),
         'Action retirée');
    },
    'prochaine action : changer le « Quoi ? » seul se valide (non-régression)': async () => {
      const { askNextAction } = await import('./ui/actions.js');
      const c = normalizeCompany({ name: 'TestQuoi', nextAction: '2030-01-02', nextActionText: 'Relancer' });
      let got = null;
      const sh = askNextAction(c, {
        preset: 'Relancer', presetDate: '2030-01-02',
        onPick: (txt, iso) => { got = { txt, iso }; }
      });
      try {
        sh.body.querySelector('#naTxt').value = 'Relancer Mme Z';
        const okBtn = sh.ov.querySelector('.modal-f .btn-primary');
        ok(okBtn);                             /* le bouton de validation existe */
        okBtn.click();
        eq(got, { txt: 'Relancer Mme Z', iso: '2030-01-02' });
        ok(!document.body.contains(sh.ov));    /* la feuille s'est refermée */
      } finally {
        try { sh.close(null, true); } catch (e) {}
      }
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
    },
    /* ---------- le coffre (profil protégé) ---------- */
    'coffre : liste de mots — 256, uniques, phrase normalisée': () => {
      eq(VAULT_WORDS.length, 256);
      eq(new Set(VAULT_WORDS).size, 256);
      ok(VAULT_WORDS.every(w => /^[a-z]{3,9}$/.test(w)));
      eq(normVaultPhrase('  Éclair   FORÊT, chien '), 'eclair foret chien');
      eq(phraseUnknownWords('aigle zzz ancre'), ['zzz']);
      const r = makeVaultPhrase(n => new Uint8Array(n));   /* octets à 0 → 12 × 1er mot */
      eq(r, Array(PHRASE_LEN).fill(VAULT_WORDS[0]).join(' '));
    },
    'coffre : vecteurs stables — méta v1, OCV1, déverrouillage': async () => {
      /* hasard compteur : la méta et l'enveloppe sont figées — si ce
         test casse, le FORMAT a changé et les coffres existants aussi */
      let n = 0;
      const rnd = len => { const u = new Uint8Array(len); for (let i = 0; i < len; i++) u[i] = (n++) & 255; return u; };
      const phrase = makeVaultPhrase(rnd);
      eq(phrase, 'aigle ancre avion balai balle bambou banane barque bassin bateau biche bijou');
      const { meta, key } = await createVault('123456', phrase, { rnd, iter: 15000, at: 1752624000000 });
      eq(JSON.stringify(meta), '{"v":1,"gen":1,"at":1752624000000,"wraps":{"pin":{"it":15000,"s":"LC0uLzAxMjM0NTY3ODk6Ow==","i":"PD0+P0BBQkNERUZH","c":"orzOHlSEfKCq8U0YCZfi+MbyTvblwxdJyoJvZwsGA3F2YcW3woL6OQSh87xmSTcI"},"phrase":{"it":15000,"s":"SElKS0xNTk9QUVJTVFVWVw==","i":"WFlaW1xdXl9gYWJj","c":"MhygJSivFk2uv1yv13efdkeiCjokvjtsppmnWv0GRh9MWqj38reXiHqaDoQV5q7y"}}}');
      const u = await unlockWithPin(meta, '123456');
      const env = await sealValue(u.key, 'oc_test', 'secret-value', rnd);
      eq(env, 'OCV1.ZGVmZ2hpamtsbW5v.CYeg+aWD3YHyn/RP7tmFlR8op+Fo22JbQ24ZGA==');
      ok(isSealed(env));
      eq(await openValue(key, 'oc_test', env), 'secret-value');
    },
    'coffre : mauvais code, phrase tolérante, AAD lié au nom': async () => {
      const rnd = len => crypto.getRandomValues(new Uint8Array(len));
      const phrase = makeVaultPhrase(rnd);
      const { meta, key } = await createVault('123456', phrase, { iter: 15000 });
      try { await unlockWithPin(meta, '000000'); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'code'); }
      try { await unlockWithPhrase(meta, 'aigle aigle aigle'); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'phrase'); }
      const u = await unlockWithPhrase(meta, '  ' + phrase.toUpperCase() + ' ');
      ok(!!u.key);
      const env = await sealValue(key, 'oc_sync_v1', 'ma phrase de liaison');
      try { await openValue(key, 'oc_data_v3', env); throw new Error('ouvert !'); }
      catch (e) { eq(e.message, 'coffre'); }
    },
    'coffre : nouveau code, PRF, rotation (gén. +1, ancien code refusé)': async () => {
      const phrase = makeVaultPhrase();
      const { meta } = await createVault('111111', phrase, { iter: 15000 });
      /* changer le code exige de re-prouver un moyen d'accès */
      const meta2 = await setPin(meta, { pin: '111111' }, '222222', { iter: 15000 });
      ok(!!(await unlockWithPin(meta2, '222222')).key);
      try { await setPin(meta, { pin: '999999' }, '333333', { iter: 15000 }); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'code'); }
      /* PRF : un secret externe enveloppe et déverrouille */
      const secret = new Uint8Array(32).fill(7);
      const meta3 = await addPrfWrap(meta2, { pin: '222222' }, secret, 'cred-1', { iter: 15000 });
      ok(!!(await unlockWithPrf(meta3, secret)).key);
      try { await unlockWithPrf(meta3, new Uint8Array(32).fill(8)); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'secret'); }
      /* rotation : nouvelle clé maîtresse, génération incrémentée */
      const rot = await rotateVault(meta3, '444444', makeVaultPhrase(), { iter: 15000 });
      eq(rot.meta.gen, 2);
      try { await unlockWithPin(rot.meta, '222222'); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'code'); }
      ok(!!(await unlockWithPin(rot.meta, '444444')).key);
    },
    'anneau : signé, vérifié, TOFU, falsification refusée': async () => {
      if (!(await edAvailable())) return;   /* vieux navigateur : dégradé assumé */
      const kA = await makeDeviceKeys(), kB = await makeDeviceKeys();
      const rec = await recoveryKeys('aigle ancre avion', 15000);
      let ring = await ringInit({ id: 'A', name: 'Pixel' }, kA.pub, kA.seed, rec.pub);
      ok(await verifyRing(ring, kA.pub));
      ring = await ringAddDevice(ring, kA.seed, { id: 'B', name: 'MacBook', pub: kB.pub });
      eq(ring.devices.length, 2);
      const mB = await mergeRing(null, ring);         /* B apprend l'anneau (TOFU) */
      ok(mB.changed);
      const forged = await ringCommand(ring, kB.seed, 'wipe', 'A');   /* signé par B */
      ok(!(await mergeRing(mB.ring, forged)).changed);
    },
    'anneau : commandes ciblées, appliquées une seule fois': async () => {
      if (!(await edAvailable())) return;
      const kA = await makeDeviceKeys(), kB = await makeDeviceKeys();
      const rec = await recoveryKeys('x', 15000);
      let ring = await ringInit({ id: 'A', name: 'A' }, kA.pub, kA.seed, rec.pub);
      ring = await ringAddDevice(ring, kA.seed, { id: 'B', name: 'B', pub: kB.pub });
      ring = await ringCommand(ring, kA.seed, 'lock', 'B', 'c1');
      const acts = actionsFor(ring, 'B', []);
      eq(acts, [{ cid: 'c1', cmd: 'lock' }]);
      eq(actionsFor(ring, 'B', ['c1']), []);          /* déjà appliquée */
      eq(actionsFor(ring, 'A', []), []);              /* ne me vise pas */
    },
    'anneau : bannir = génération +1, le retour d’un banni est ignoré': async () => {
      if (!(await edAvailable())) return;
      const kA = await makeDeviceKeys(), kB = await makeDeviceKeys();
      const rec = await recoveryKeys('x', 15000);
      let ring = await ringInit({ id: 'A', name: 'A' }, kA.pub, kA.seed, rec.pub);
      ring = await ringAddDevice(ring, kA.seed, { id: 'B', name: 'B', pub: kB.pub });
      const banned = await ringCommand(ring, kA.seed, 'ban', 'B');
      eq(banned.gen, 2);
      ok(!deviceIn(banned, 'B'));
      ok(!(await mergeRing(banned, ring)).changed);   /* l'ancien anneau ne redescend pas */
    },
    'anneau : transfert du rôle signé par l’ancien principal': async () => {
      if (!(await edAvailable())) return;
      const kA = await makeDeviceKeys(), kB = await makeDeviceKeys();
      const rec = await recoveryKeys('x', 15000);
      let ring = await ringInit({ id: 'A', name: 'A' }, kA.pub, kA.seed, rec.pub);
      ring = await ringAddDevice(ring, kA.seed, { id: 'B', name: 'B', pub: kB.pub });
      const mB = await mergeRing(null, ring);
      const t = await ringTransfer(ring, kA.seed, 'B');
      const mB2 = await mergeRing(mB.ring, t);
      ok(mB2.changed);
      eq(mB2.ring.main, 'B');
      eq(deviceIn(mB2.ring, 'A').role, 'member');
    },
    'anneau : récupération par la phrase — vraie acceptée, fausse refusée': async () => {
      if (!(await edAvailable())) return;
      const kA = await makeDeviceKeys(), kB = await makeDeviceKeys();
      const rec = await recoveryKeys('bonne phrase', 15000);
      let ring = await ringInit({ id: 'A', name: 'A' }, kA.pub, kA.seed, rec.pub);
      ring = await ringAddDevice(ring, kA.seed, { id: 'B', name: 'B', pub: kB.pub });
      const newRec = await recoveryKeys('phrase renouvelee', 15000);
      const good = await ringRecover(ring, rec.seed, { id: 'B', name: 'B' }, kB.pub, newRec.pub);
      const mA = await mergeRing(ring, good);
      ok(mA.changed && mA.recovered);
      eq(mA.ring.main, 'B');
      eq(mA.ring.gen, 2);
      const badRec = await recoveryKeys('mauvaise phrase', 15000);
      const bad = await ringRecover(ring, badRec.seed, { id: 'B', name: 'B' }, kB.pub, newRec.pub);
      ok(!(await mergeRing(ring, bad)).changed);
    },
    'envoi direct : MIME — entêtes UTF-8, corps base64, base64url': () => {
      eq(encodeHeader('Hello'), 'Hello');                       /* ASCII : inchangé */
      eq(encodeHeader('Candidature — été'), '=?UTF-8?B?Q2FuZGlkYXR1cmUg4oCUIMOpdMOp?=');
      const m = buildMime({ from: 'moi@x.fr', to: 'rh@y.fr', subject: 'Stage été', body: 'Bonjour à vous.' });
      ok(m.startsWith('From: moi@x.fr\r\nTo: rh@y.fr\r\nSubject: =?UTF-8?B?'));
      ok(m.includes('Content-Type: text/plain; charset=UTF-8'));
      ok(m.includes('Content-Transfer-Encoding: base64'));
      const body64 = m.split('\r\n\r\n')[1].replace(/\r\n/g, '');
      eq(atob(body64), unescape(encodeURIComponent('Bonjour à vous.')));
      eq(toB64Url('a+b/c'), btoa('a+b/c').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    },
    'envoi direct : URLs OAuth et retour de popup': async () => {
      const g = authUrl('gmail', 'CID', 'https://x/oauth.html', { state: 's1' });
      ok(g.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
      ok(g.includes('response_type=token') && g.includes('state=s1') && g.includes('gmail.send'));
      const o = authUrl('outlook', 'CID', 'https://x/oauth.html', { state: 's2', challenge: 'CH' });
      ok(o.includes('code_challenge=CH') && o.includes('code_challenge_method=S256'));
      eq(parseCallback('https://x/oauth.html#access_token=T&expires_in=3599&state=s1'),
         { access_token: 'T', expires_in: '3599', state: 's1' });
      eq(parseCallback('https://x/oauth.html?code=C&state=s2').code, 'C');
      const pk = await pkcePair();
      ok(pk.verifier.length >= 43 && /^[A-Za-z0-9_-]+$/.test(pk.challenge));
    },
    'campagne : montage — opposition imposée, personnalisation figée': () => {
      const steps = [
        { subject: 'Candidature — {{entreprise}}', body: 'Bonjour {{contact}}.' },
        { subject: 'Re', body: 'Relance 1' },
        { subject: 'Re', body: 'Relance 2' }
      ];
      const c = buildCampaign({ name: 'T', steps, launchAt: '2026-07-16',
        targets: [{ cid: 'c1', name: 'Ana', company: 'Orange', email: 'a@x.fr' }] });
      ok(c.steps.every(s => /je m’arrête là/.test(s.body)));   /* imposée, jamais retirée */
      eq(c.targets[0].msgs[0].subject, 'Candidature — Orange');
      ok(/Bonjour Ana/.test(c.targets[0].msgs[0].body));
      eq(c.state, 'ready');
      /* sans email = pas de cible ; zéro cible = erreur */
      try { buildCampaign({ steps, launchAt: '2026-07-16', targets: [{ cid: 'c2', name: 'X' }] }); throw new Error('accepté !'); }
      catch (e) { eq(e.message, 'cibles'); }
    },
    'campagne : cadence 15/jour, glissement, idempotence (rejeu du journal)': () => {
      const steps = [{ subject: 's', body: 'b' }, { subject: 's', body: 'b' }, { subject: 's', body: 'b' }];
      const targets = Array.from({ length: 20 }, (_, i) => ({ cid: 'c' + i, email: 'p' + i + '@x.fr' }));
      let c = buildCampaign({ steps, targets, launchAt: '2026-07-16' });
      const due = dueSends(c, '2026-07-16');
      eq(due.length, DAILY_CAP);
      for (const d of due) c = markSent(c, d.sid, '2026-07-16');
      eq(dueSends(c, '2026-07-16').length, 0);          /* la cadence du jour est prise */
      const n = c.log.length;
      c = markSent(c, due[0].sid, '2026-07-16');        /* rejouer le même envoi */
      eq(c.log.length, n);
      eq(dueSends(c, '2026-07-17').length, 5);          /* le reste a glissé */
    },
    'campagne : relances J+7 sur la date d’envoi RÉELLE ; réponse = stop': () => {
      const steps = [{ subject: 's', body: 'b' }, { subject: 's', body: 'b' }, { subject: 's', body: 'b' }];
      let c = buildCampaign({ steps, launchAt: '2026-07-16',
        targets: [{ cid: 'c1', email: 'a@x.fr' }, { cid: 'c2', email: 'b@x.fr' }] });
      /* c1 part le 16, c2 seulement le 18 (l'utilisateur n'a pas appuyé) */
      c = markSent(c, dueSends(c, '2026-07-16')[0].sid, '2026-07-16');
      c = markSent(c, dueSends(c, '2026-07-18').find(d => d.cid === 'c2').sid, '2026-07-18');
      eq(dueSends(c, '2026-07-22').length, 0);          /* rien avant J+7 */
      const d23 = dueSends(c, '2026-07-23');
      eq(d23.length, 1);                                 /* c1 seulement (16+7) */
      eq(d23[0].cid, 'c1'); eq(d23[0].step, 1);
      ok(dueSends(c, '2026-07-25').some(d => d.cid === 'c2' && d.step === 1));
      /* réponse : plus jamais rien pour cette piste — non débrayable */
      c = markReplied(c, 'c1');
      ok(!dueSends(c, '2026-07-30').some(d => d.cid === 'c1'));
      /* erreur d'envoi : marquée, jamais re-tentée en silence */
      c = markError(c, 't2');
      eq(dueSends(c, '2026-08-30').length, 0);
      eq(c.state, 'done');                               /* plus aucune cible active */
    },
    'campagne : pause / reprise / arrêt ; bords de date': () => {
      const steps = [{ subject: 's', body: 'b' }, { subject: 's', body: 'b' }, { subject: 's', body: 'b' }];
      let c = buildCampaign({ steps, launchAt: '2026-07-16', targets: [{ cid: 'c1', email: 'a@x.fr' }] });
      c = pauseCampaign(c);
      eq(dueSends(c, '2026-07-16').length, 0);
      c = resumeCampaign(c);
      eq(dueSends(c, '2026-07-16').length, 1);
      c = stopCampaign(c);
      eq(c.state, 'stopped');
      eq(dueSends(c, '2026-07-16').length, 0);
      eq(cAddDays('2026-01-31', 7), '2026-02-07');
      eq(cAddDays('2026-12-28', 7), '2027-01-04');
      eq(cAddDays('2028-02-28', 7), '2028-03-06');       /* bissextile */
      /* stats */
      let cc = buildCampaign({ steps, launchAt: '2026-07-16', targets: [{ cid: 'c1', email: 'a@x.fr' }] });
      let day = '2026-07-16';
      for (let i = 0; i < 40 && cc.state === 'ready'; i++){
        for (const d of dueSends(cc, day)) cc = markSent(cc, d.sid, day);
        day = cAddDays(day, 1);
      }
      eq(cc.state, 'done');
      eq(campaignStats(cc).sent, 3);
    },
    'verrou : codes triviaux refusés (suites, répétitions)': async () => {
      const { isWeakPin } = await import('./ui/verrou.js');
      ok(isWeakPin('000000'));
      ok(isWeakPin('123456'));
      ok(isWeakPin('654321'));
      ok(isWeakPin('901234'));
      ok(!isWeakPin('280941'));
    },
    'stockage : valeur scellée sans clé = `verrou`, jamais un null': async () => {
      if (vaultActive()) return;   /* un vrai coffre est ouvert : ne pas interférer */
      const probe = 'oc_probe_vault';
      const { key } = await createVault('123456', makeVaultPhrase(), { iter: 15000 });
      const env = await sealValue(key, probe, '{"x":1}');
      await kvSet(probe, env);     /* déjà scellée : écrite telle quelle */
      try { await kvGet(probe); throw new Error('lisible !'); }
      catch (e) { eq(e.message, 'verrou'); }
      eq(await openValue(key, probe, env), '{"x":1}');
      await kvDel(probe);
      eq(await kvGet(probe), null);
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
