/* Tests P8-2 (assistant IA / MCP local) — lancés par ?test avec le corpus. */
import { buildMcpResume, MCP_RESUME_MAX } from './engine/mcp.js';
import { normaliseProposals } from './ui/propositions.js';
import { PROPOSALS_KEY, SEALABLE } from './engine/storage.js';

export async function runMcpTests(){
  const R = [];
  const eq = (a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(`attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
  };
  const ok = v => { if (!v) throw new Error('condition fausse'); };
  const tests = {
    'assistant : la clé des propositions est scellée et effaçable': () => {
      eq(PROPOSALS_KEY, 'oc_proposals_v1');
      ok(SEALABLE.has(PROPOSALS_KEY));
    },
    'assistant : le résumé ne porte que la liste blanche, le privé reste agrégé': () => {
      const companies = [
        { name: 'Sopra Steria', city: 'Lille', domain: 'esn', positions: ['stage'],
          status: 'active', notes: 'NOTE PRIVÉE', nextActionText: 'Relancer Iris',
          history: [{ d: '2026-07-01', t: 'Email envoyé à iris@exemple.fr' }],
          contacts: [{ name: 'Iris', email: 'iris@exemple.fr', phone: '0601020304' }],
          updatedAt: Date.UTC(2026, 6, 10) },
        { name: 'Exotec', status: 'todo', updatedAt: Date.UTC(2026, 6, 12) },
        { name: 'Fermée', status: 'reply', closedReason: 'won', updatedAt: 99 },
        { name: 'Démo', demo: true, updatedAt: 98 },
        { name: 'Répond', status: 'reply', updatedAt: Date.UTC(2026, 6, 12) }
      ];
      const r = buildMcpResume(companies);
      eq(r.total, 3);
      eq(r.suivi, { a_contacter: 1, en_cours: 1, reponse: 1 });
      /* tri déterministe : dernière activité d'abord, puis le nom */
      eq(r.pistes.map(p => p.nom), ['Exotec', 'Répond', 'Sopra Steria']);
      eq(r.pistes[2], { nom: 'Sopra Steria', ville: 'Lille', domaine: 'esn',
        postes: ['stage'], maj: '2026-07-10' });
      const plein = JSON.stringify(r);
      for (const interdit of ['NOTE PRIVÉE', 'Relancer', 'iris@exemple.fr',
        '0601020304', 'Iris', 'status', 'history', 'Fermée', 'Démo'])
        ok(!plein.includes(interdit));
    },
    'assistant : le résumé est borné': () => {
      const beaucoup = Array.from({ length: MCP_RESUME_MAX + 50 },
        (_, i) => ({ name: 'P' + i, updatedAt: i }));
      const r = buildMcpResume(beaucoup);
      eq(r.pistes.length, MCP_RESUME_MAX);
      eq(r.total, MCP_RESUME_MAX + 50);
      const long = buildMcpResume([{ name: 'x'.repeat(500), city: 'y'.repeat(500) }]);
      eq(long.pistes[0].nom.length, 120);
      eq(long.pistes[0].ville.length, 80);
    },
    'assistant : les propositions se normalisent — pid réglé jamais rejoué': () => {
      const share = JSON.stringify({ v: 4, kind: 'share', companies: [{ name: 'X' }] });
      const r = normaliseProposals({
        list: [
          { pid: 'abcd1234', at: 2, n: 1, share },
          { pid: 'abcd1234', at: 3, n: 1, share },              /* doublon : ignoré */
          { pid: 'deja4321', at: 1, n: 1, share },              /* déjà réglée : ignorée */
          { pid: '<script>', at: 1, n: 1, share },              /* pid hostile : ignoré */
          { pid: 'sanspart', at: 1, n: 0, share },              /* vide : ignorée */
          { pid: 'illisibl', at: 1, n: 1, share: '' }           /* sans contenu : ignorée */
        ],
        done: [{ pid: 'deja4321', a: 'abandon' }, { pid: 'deja4321' }, 'mal']
      });
      eq(r.list.map(p => p.pid), ['abcd1234']);
      eq(r.done, [{ pid: 'deja4321', a: 'abandon' }]);
      /* l'ordre d'aperçu est stable : la plus ancienne d'abord */
      const deux = normaliseProposals({ list: [
        { pid: 'seconde1', at: 9, n: 1, share },
        { pid: 'premiere', at: 4, n: 1, share }
      ], done: [] });
      eq(deux.list.map(p => p.pid), ['premiere', 'seconde1']);
      eq(normaliseProposals({ list: [], done: [] }), null);
      eq(normaliseProposals('rien'), null);
      /* l'autorisation de l'assistant est un souvenir durable : sans lui,
         aucune sonde — avec lui, la forme survit même vide */
      eq(normaliseProposals({ actif: true, list: [], done: [] }),
        { v: 1, actif: true, list: [], done: [] });
      eq(normaliseProposals({ actif: true, list: [
        { pid: 'abcd1234', at: 1, n: 1, share } ], done: [] }).actif, true);
    }
  };
  for (const name of Object.keys(tests)){
    try { await tests[name](); R.push({ test: name, résultat: '✓' }); }
    catch (e) { R.push({ test: name, résultat: '✗ ' + (e && e.message) }); }
  }
  return R;
}
