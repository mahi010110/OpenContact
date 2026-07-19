/* ============================================================
   OpenContact — moteur · résumé pour l'assistant IA (P8-2)
   Le Compagnon peut exposer un serveur local à un assistant IA
   compatible. Ce module construit le SEUL contenu qu'il a le
   droit de lire : un résumé de pistes en liste blanche stricte —
   nom, ville, domaine, postes, dernière activité — plus le suivi
   privé sous forme AGRÉGÉE (trois compteurs), jamais une note,
   un contact, un statut par piste ni un historique. Le cœur Rust
   re-filtre ce résumé à la lecture (coeur/src/mcp.rs) : les deux
   listes blanches doivent rester alignées. Fonctions pures.
   ============================================================ */

export const MCP_RESUME_MAX = 200;   /* pistes gardées dans le résumé */

export function buildMcpResume(companies){
  const open = (companies || []).filter(c =>
    c && typeof c === 'object' && c.name && !c.demo && !c.closedReason);
  const suivi = { a_contacter: 0, en_cours: 0, reponse: 0 };
  for (const c of open){
    if (c.status === 'active') suivi.en_cours++;
    else if (c.status === 'reply') suivi.reponse++;
    else suivi.a_contacter++;
  }
  const maj = t => { try { return new Date(t).toISOString().slice(0, 10); } catch (e) { return ''; } };
  const pistes = open.slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) ||
      String(a.name).localeCompare(String(b.name)))
    .slice(0, MCP_RESUME_MAX)
    .map(c => {
      const out = { nom: String(c.name).slice(0, 120) };
      if (c.city) out.ville = String(c.city).slice(0, 80);
      if (c.domain) out.domaine = String(c.domain).slice(0, 24);
      if (Array.isArray(c.positions) && c.positions.length)
        out.postes = c.positions.slice(0, 5).map(p => String(p).slice(0, 24));
      if (c.updatedAt && maj(c.updatedAt)) out.maj = maj(c.updatedAt);
      return out;
    });
  return { v: 1, pistes, total: open.length, suivi };
}
