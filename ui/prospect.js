/* ============================================================
   OpenContact — interface · mode Prospecter (#17)
   Des candidatures en série : je coche mes pistes, et chaque
   envoi part vers UNE personne visible et choisie — jamais un
   « premier email » deviné. Une boîte sans contact joignable
   propose « ＋ ajoute quelqu'un » au lieu d'être écartée (N6).
   Puis « Une par une » ou « En campagne ».
   ============================================================ */
import { esc } from '../engine/utils.js';
import { STATUSES, nextActionContact } from '../engine/model.js';
import { filterCompanies } from '../engine/filter.js';
import { S, bus, isClosed } from './state.js';
import { openSheet, toast, btn, ic, softReorder } from './dom.js';
import { sortState, sortArgs, sortBarHTML, bindSortBar } from './sort.js';
import { openMail } from './mail.js';
import { openContactEditor } from './contact.js';
import { openCampaignWizard } from './campagnes.js';

/* la personne proposée d'office : celle de la prochaine action, sinon
   la première activée avec email, sinon la première joignable (#14) */
function defaultCt(c){
  const na = nextActionContact(c);
  if (na && na.email) return na;
  const withMail = (c.contacts || []).filter(t => t.email);
  return withMail.find(t => t.activatedAt) || withMail[0] || null;
}

export function openProspect(){
  const alive = () => S.companies.filter(c => !isClosed(c));
  if (!alive().length) return;
  const sel = new Set();
  const who = new Map();                     /* pisteId → id du contact choisi */
  const st = sortState('status');            /* « À contacter » en tête par défaut */
  const sh = openSheet({ title: 'Prospecter — qui ?', icon: 'mail' });
  const nTodo = alive().filter(c => c.status === 'todo').length;

  const chosenCt = c => (c.contacts || []).find(t => t.id === who.get(c.id)) || defaultCt(c);
  const bGo = btn('Continuer', 'btn-primary', () => {
    const list = alive().filter(c => sel.has(c.id));
    if (!list.length){ toast('Coche au moins une piste.'); return; }
    sh.close();
    chooseMode(list.map(c => ({ c, ct: chosenCt(c) })));
  });
  const sync = () => {
    bGo.textContent = sel.size ? `Continuer (${sel.size})` : 'Continuer';
    bGo.classList.toggle('btn-off', !sel.size);
  };

  /* choisir la personne d'une piste — même grammaire qu'ailleurs */
  const pickWho = c => {
    const cts = (c.contacts || []).filter(t => t.email);
    const s2 = openSheet({ title: 'Qui, chez ' + c.name + ' ?', icon: 'contact' });
    s2.body.innerHTML =
      `<div class="pick-list">
         ${cts.map(t =>
           `<button class="pick${chosenCt(c) === t ? ' on' : ''}" data-ct="${t.id}">
              <b>${esc(t.name || t.email)}</b>
              <span>${esc([t.role, t.email].filter(Boolean).join(' · '))}</span>
            </button>`).join('')}
         <button class="pick" data-addct><b>${ic('plus', 'ic-14')} Ajouter quelqu’un</b></button>
       </div>`;
    s2.body.querySelectorAll('[data-ct]').forEach(b =>
      b.addEventListener('click', () => { who.set(c.id, b.dataset.ct); s2.close(); render(); }));
    s2.body.querySelector('[data-addct]').addEventListener('click', () => {
      s2.close();
      openContactEditor({ company: c, onDone: () => { sel.add(c.id); render(); } });
    });
  };

  const render = () => {
    const list = filterCompanies(alive(), sortArgs(st));
    sh.body.innerHTML =
      `<div class="listbar">
         ${nTodo ? `<button class="linklike" id="pkAllTodo">Cocher les ${nTodo} « À contacter »</button>` : '<span></span>'}
         ${sortBarHTML(st)}
       </div>
       <div class="pick-list">
         ${list.map(c => {
           const ct = chosenCt(c);
           const nMail = (c.contacts || []).filter(t => t.email).length;
           return `<div class="pk-duo">
                     <button class="pick pk${sel.has(c.id) ? ' on' : ''}" data-id="${c.id}" aria-pressed="${sel.has(c.id)}">
                       ${ic('checkbox', 'ic-20 ic-off')}${ic('checkbox-on', 'ic-20 ic-on')}
                       <div class="pk-m"><b>${esc(c.name)}</b>
                         <span>${STATUSES[c.status].label}</span></div>
                     </button>
                     ${ct
                       ? `<button class="pk-who" data-who="${c.id}" ${nMail > 1 ? '' : 'disabled'}
                                  aria-label="Destinataire chez ${esc(c.name)}">
                            → ${esc(ct.name || ct.email)}${nMail > 1 ? ' ▾' : ''}
                          </button>`
                       : `<button class="pk-who pk-add" data-addct="${c.id}">${ic('plus', 'ic-14')} ajoute quelqu’un</button>`}
                   </div>`;
         }).join('')}
       </div>`;
    sh.body.querySelectorAll('.pk').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        sel.has(id) ? sel.delete(id) : sel.add(id);
        b.classList.toggle('on', sel.has(id));
        b.setAttribute('aria-pressed', sel.has(id));
        sync();
      }));
    sh.body.querySelectorAll('[data-who]').forEach(b =>
      b.addEventListener('click', () => {
        const c = alive().find(x => x.id === b.dataset.who);
        if (c) pickWho(c);
      }));
    sh.body.querySelectorAll('[data-addct]').forEach(b =>
      b.addEventListener('click', () => {
        const c = alive().find(x => x.id === b.dataset.addct);
        if (c) openContactEditor({ company: c, onDone: () => { sel.add(c.id); render(); } });
      }));
    sh.body.querySelector('#pkAllTodo')?.addEventListener('click', () => {
      alive().filter(c => c.status === 'todo').forEach(c => sel.add(c.id));
      sh.body.querySelectorAll('.pk').forEach(b => {
        b.classList.toggle('on', sel.has(b.dataset.id));
        b.setAttribute('aria-pressed', sel.has(b.dataset.id));
      });
      sync();
    });
    bindSortBar(sh.body, st, () => { const play = softReorder('.modal-b .pk'); render(); play(); });
    sync();
  };
  sh.setFoot([bGo]);
  render();
}

/* la bifurcation : une décision, deux chemins */
function chooseMode(pairs){
  const n = pairs.length;
  const sh = openSheet({ title: n + ' piste' + (n > 1 ? 's' : '') + ' choisie' + (n > 1 ? 's' : ''), icon: 'mail' });
  sh.body.innerHTML =
    `<div class="pick-list">
       <button class="pick" id="pmOne"><b>${ic('mail', 'ic-14')} Une par une</b>
         <span>tu écris et envoies chaque email maintenant</span></button>
       <button class="pick" id="pmCamp"><b>${ic('flag', 'ic-14')} En campagne</b>
         <span>un message + 2 relances, préparés pour les jours qui viennent — tu gardes la main</span></button>
     </div>`;
  sh.body.querySelector('#pmOne').addEventListener('click', () => { sh.close(); run(pairs); });
  sh.body.querySelector('#pmCamp').addEventListener('click', () => { sh.close(); openCampaignWizard(pairs); });
}

/* la série : un composeur après l'autre, vers la personne choisie.
   « Passer » avance, la croix arrête tout — tout de suite. */
function run(pairs){
  let i = 0;
  const next = () => {
    if (i >= pairs.length){
      toast('Série terminée — ' + pairs.length + ' piste' + (pairs.length > 1 ? 's' : '') + ' traitée' + (pairs.length > 1 ? 's' : '') + ' ✓');
      bus.refresh();
      return;
    }
    const { c, ct } = pairs[i++];
    openMail(c, {
      ctId: ct && ct.id,
      progress: i + '/' + pairs.length,
      onDone: next,
      onQuit: () => { toast('Prospection arrêtée.'); bus.refresh(); }
    });
  };
  next();
}
