//! La garde : anti-double-envoi, plafond global, fenêtre d'envoi.
//! Miroir strict des invariants d'`engine/campaign.js` — la PWA et le
//! Compagnon partagent le même journal (les identifiants d'envoi
//! stables `id.cible.étape`), la garde le fait respecter côté natif.

use std::collections::{HashMap, HashSet};

/// GLOBAL — toutes campagnes confondues (CONTRAT §1, `oc_campaigns_v1`).
pub const PLAFOND_JOUR: u32 = 15;
/// Fenêtre d'envoi : jours ouvrés, 8 h → 18 h 59, heure LOCALE.
pub const FENETRE: (u8, u8) = (8, 19);

/// `jour_semaine` : 1 = lundi … 7 = dimanche (ISO 8601).
pub fn dans_fenetre(jour_semaine: u8, heure: u8) -> bool {
    (1..=5).contains(&jour_semaine) && (FENETRE.0..FENETRE.1).contains(&heure)
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refus {
    DoubleEnvoi,
    PlafondJour,
    HorsFenetre,
    HorsMission,
}

/// Le journal des envois FAITS — la même vérité que le journal de
/// campagne : un identifiant déjà consigné ne repart jamais, quel que
/// soit le canal, le redémarrage ou le rejeu.
#[derive(Default)]
pub struct Garde {
    faits: HashSet<String>,
    par_jour: HashMap<String, u32>,
}

impl Garde {
    /// Reconstruit la garde depuis un journal persisté : `(sid, date)`.
    pub fn depuis(entrees: impl IntoIterator<Item = (String, String)>) -> Self {
        let mut g = Garde::default();
        for (sid, date) in entrees {
            g.consigner(&sid, &date);
        }
        g
    }

    pub fn deja_fait(&self, sid: &str) -> bool {
        self.faits.contains(sid)
    }

    pub fn envoyes_le(&self, date: &str) -> u32 {
        *self.par_jour.get(date).unwrap_or(&0)
    }

    /// La décision AVANT chaque envoi. `cp_id` = la campagne couverte
    /// par la mission vérifiée : un identifiant d'une autre campagne
    /// est hors mission, quoi qu'en dise le cerveau.
    pub fn autoriser(
        &self,
        sid: &str,
        cp_id: &str,
        date: &str,
        jour_semaine: u8,
        heure: u8,
    ) -> Result<(), Refus> {
        if cp_id.is_empty() || !sid.starts_with(&format!("{cp_id}.")) {
            return Err(Refus::HorsMission);
        }
        if self.deja_fait(sid) {
            return Err(Refus::DoubleEnvoi);
        }
        if self.envoyes_le(date) >= PLAFOND_JOUR {
            return Err(Refus::PlafondJour);
        }
        if !dans_fenetre(jour_semaine, heure) {
            return Err(Refus::HorsFenetre);
        }
        Ok(())
    }

    /// Bloquer un identifiant SANS le compter dans le plafond du jour
    /// (envoi refusé : rien n'est parti, mais jamais re-tenté en silence).
    pub fn bloquer(&mut self, sid: &str) {
        self.faits.insert(sid.to_string());
    }

    /// À consigner après un envoi CONFIRMÉ par le fournisseur
    /// seulement — jamais sur un résultat incertain. Idempotent.
    pub fn consigner(&mut self, sid: &str, date: &str) {
        if self.faits.insert(sid.to_string()) {
            *self.par_jour.entry(date.to_string()).or_insert(0) += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fenetre_lun_ven_8_19() {
        assert!(dans_fenetre(4, 10)); /* jeudi 10 h */
        assert!(dans_fenetre(1, 8));
        assert!(!dans_fenetre(4, 7));
        assert!(!dans_fenetre(4, 19));
        assert!(!dans_fenetre(6, 10)); /* samedi */
        assert!(!dans_fenetre(7, 10)); /* dimanche */
    }

    #[test]
    fn double_envoi_refuse_meme_apres_rejeu() {
        let mut g = Garde::default();
        assert!(g.autoriser("cp1.t1.0", "cp1", "2026-07-16", 4, 10).is_ok());
        g.consigner("cp1.t1.0", "2026-07-16");
        g.consigner("cp1.t1.0", "2026-07-16"); /* rejeu : rien de plus */
        assert_eq!(
            g.autoriser("cp1.t1.0", "cp1", "2026-07-16", 4, 10),
            Err(Refus::DoubleEnvoi)
        );
        assert_eq!(g.envoyes_le("2026-07-16"), 1);
    }

    #[test]
    fn plafond_global_toutes_campagnes() {
        let mut g = Garde::default();
        for i in 0..10 {
            g.consigner(&format!("cpA.t{i}.0"), "2026-07-16");
        }
        for i in 0..5 {
            g.consigner(&format!("cpB.t{i}.0"), "2026-07-16");
        }
        /* 10 + 5 = 15 : plus rien ne part ce jour, quelle que soit la campagne */
        assert_eq!(
            g.autoriser("cpB.t9.0", "cpB", "2026-07-16", 4, 10),
            Err(Refus::PlafondJour)
        );
        /* le lendemain, le compteur du jour repart */
        assert!(g.autoriser("cpB.t9.0", "cpB", "2026-07-17", 5, 10).is_ok());
    }

    #[test]
    fn hors_mission_refuse() {
        let g = Garde::default();
        assert_eq!(
            g.autoriser("cpX.t1.0", "cp1", "2026-07-16", 4, 10),
            Err(Refus::HorsMission)
        );
        assert_eq!(
            g.autoriser("cp1.t1.0", "", "2026-07-16", 4, 10),
            Err(Refus::HorsMission)
        );
    }

    #[test]
    fn journal_reconstruit_depuis_persistance() {
        let g = Garde::depuis(vec![
            ("cp1.t1.0".into(), "2026-07-16".into()),
            ("cp1.t2.0".into(), "2026-07-16".into()),
        ]);
        assert!(g.deja_fait("cp1.t1.0"));
        assert_eq!(g.envoyes_le("2026-07-16"), 2);
        assert_eq!(
            g.autoriser("cp1.t1.0", "cp1", "2026-07-16", 4, 10),
            Err(Refus::DoubleEnvoi)
        );
    }
}
