/* Tests C8 séparés du corpus historique : ils restent lancés par ?test. */
import { syncPrivateMerge, mergeMissions } from './engine/sync.js';
import { CAMPAIGNS_KEY, MISSIONS_KEY, COMPANION_KEY } from './engine/storage.js';

export async function runC8Tests(){
  const R = [];
  const eq = (a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error(`attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
  };
  const ok = v => { if (!v) throw new Error('condition fausse'); };
  const mission = (state, stops = [], revOk = false) => {
    const m = { v: 1, mid: 'mission-test', kind: 'campaign-run',
      params: { campaign: { id: 'campagne-test', targets: [] } },
      createdAt: 1, expiresAt: 9, revoked: false };
    return { mid: 'mission-test', cpId: 'campagne-test',
      wire: { m: JSON.stringify(m), sig: 'signature-test', dev: 'appareil-test' },
      state, stops, revOk };
  };
  const tests = {
    'sync appareils C8 : campagne et bon signé convergent sans doublon': () => {
      eq(CAMPAIGNS_KEY, 'oc_campaigns_v1');
      eq(MISSIONS_KEY, 'oc_missions_v1');
      eq(COMPANION_KEY, 'oc_companion_v1');
      const wire = mission('a_confier').wire;
      const phone = {
        campaigns: [{ id: 'campagne-test', name: 'Campagne test', auto: true,
          state: 'ready', updatedAt: 100, log: [],
          targets: [{ tid: 'cible-test', state: 'active' }] }],
        missions: [{ mid: 'mission-test', cpId: 'campagne-test', wire,
          state: 'a_confier', stops: [] }]
      };
      const desktop = syncPrivateMerge(phone, { campaigns: [], missions: [] });
      eq(desktop.campaigns.length, 1);
      eq(desktop.missions.length, 1);
      eq(desktop.missions[0].wire, wire);
      const handed = syncPrivateMerge({ campaigns: desktop.campaigns,
        missions: [Object.assign({}, desktop.missions[0], { state: 'confiee' })] }, phone);
      eq(handed.missions.length, 1);
      eq(handed.missions[0].state, 'confiee');
      const replay = syncPrivateMerge(phone, handed);
      eq(replay.missions.length, 1);
      eq(replay.missions[0].state, 'confiee');
      eq(replay.missions[0].wire, wire);
    },
    'sync appareils C8 : journal et révocation sont monotones': () => {
      const local = [{ id: 'campagne-test', updatedAt: 200, state: 'ready', auto: true,
        log: [{ sid: 'envoi-test', tid: 'cible-a', step: 0, at: '2026-07-18' }],
        targets: [{ tid: 'cible-a', state: 'done' }, { tid: 'cible-b', state: 'active' }] }];
      const remote = [{ id: 'campagne-test', updatedAt: 300, state: 'ready', auto: false,
        log: [], targets: [{ tid: 'cible-a', state: 'active' },
          { tid: 'cible-b', state: 'replied' }] }];
      const r = syncPrivateMerge({ campaigns: remote,
        missions: [mission('revoquee', ['cible-b'])] },
      { campaigns: local, missions: [mission('confiee', ['cible-a'], true)] });
      eq(r.campaigns[0].auto, false);
      eq(r.campaigns[0].log.length, 1);
      eq(r.campaigns[0].targets.map(t => t.state), ['done', 'replied']);
      eq(r.missions[0].state, 'revoquee');
      eq(r.missions[0].stops, ['cible-a', 'cible-b']);
      ok(r.missions[0].revOk);
      eq(mergeMissions([{ mid: 'invalide', cpId: 'invalide',
        wire: { m: '{}', sig: 'signature-test', dev: 'appareil-test' },
        state: 'a_confier' }], []).length, 0);
    }
  };
  for (const name of Object.keys(tests)){
    try { await tests[name](); R.push({ test: name, résultat: '✓' }); }
    catch (e) { R.push({ test: name, résultat: '✗ ' + (e && e.message) }); }
  }
  return R;
}
