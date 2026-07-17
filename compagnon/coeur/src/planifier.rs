//! Le planificateur : QUELS envois sont dus aujourd'hui, pour des
//! campagnes FIGÉES confiées par mission. Miroir strict de
//! `engine/campaign.js` (dueSends/dueSendsAll) — les scénarios de
//! tests reprennent les mêmes chiffres que `tests.js` : si l'un des
//! deux bouge, la fixture casse. Le Compagnon planifie ici (la
//! webview peut être morte, les envois partent quand même) ; la
//! garde (`garde.rs`) re-vérifie chaque envoi individuellement.
//!
//! Journal : `fait` (confirmé fournisseur), `incertain` (parti ?
//! crash entre l'envoi et la confirmation — jamais re-tenté, à
//! vérifier), `erreur` (refusé — jamais re-tenté). Tous bloquent le
//! re-envoi du même identifiant ; seuls les `fait` datent la chaîne
//! J+7 ; `fait` ET `incertain` comptent dans le plafond du jour.

use crate::garde::PLAFOND_JOUR;
use serde::{Deserialize, Serialize};

pub const PAS_JOURS: i64 = 7; /* J+7 puis J+14 (7 après la relance 1) */

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Message {
    pub subject: String,
    pub body: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Cible {
    pub tid: String,
    pub cid: String,
    pub email: String,
    #[serde(default)]
    pub who: String,
    #[serde(rename = "startAt")]
    pub start_at: String,
    #[serde(default = "actif")]
    pub state: String,
    pub msgs: Vec<Message>,
}
fn actif() -> String {
    "active".into()
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Campagne {
    pub id: String,
    #[serde(default = "pret")]
    pub state: String,
    pub targets: Vec<Cible>,
}
fn pret() -> String {
    "ready".into()
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
pub enum Etat {
    #[serde(rename = "fait")]
    Fait,
    #[serde(rename = "incertain")]
    Incertain,
    #[serde(rename = "erreur")]
    Erreur,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Entree {
    pub sid: String,
    pub date: String,
    pub etat: Etat,
}

#[derive(Debug, PartialEq)]
pub struct Du {
    pub cp_id: String,
    pub sid: String,
    pub tid: String,
    pub step: usize,
    pub email: String,
    pub subject: String,
    pub body: String,
}

/* ---------- dates AAAA-MM-JJ, arithmétique UTC (miroir addDays) ---------- */
fn jours_depuis_civil(y: i64, m: i64, d: i64) -> i64 {
    /* algorithme civil classique — exact, bissextiles comprises */
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}
fn civil_depuis_jours(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}
pub fn ajouter_jours(iso: &str, n: i64) -> String {
    let p: Vec<i64> = iso.split('-').filter_map(|s| s.parse().ok()).collect();
    if p.len() != 3 {
        return iso.into();
    }
    let (y, m, d) = civil_depuis_jours(jours_depuis_civil(p[0], p[1], p[2]) + n);
    format!("{y:04}-{m:02}-{d:02}")
}

/* ---------- lecture du journal ---------- */
pub fn sid(cp: &str, tid: &str, step: usize) -> String {
    format!("{cp}.{tid}.{step}")
}
fn entree<'a>(journal: &'a [Entree], sid: &str) -> Option<&'a Entree> {
    journal.iter().find(|e| e.sid == sid)
}
fn fait_le<'a>(journal: &'a [Entree], sid: &str) -> Option<&'a str> {
    journal
        .iter()
        .find(|e| e.sid == sid && e.etat == Etat::Fait)
        .map(|e| e.date.as_str())
}
pub fn envoyes_le(journal: &[Entree], date: &str) -> u32 {
    /* fait + incertain : un « incertain » est peut-être parti — il
       compte dans le plafond (prudence), jamais un « erreur » */
    journal
        .iter()
        .filter(|e| e.date == date && e.etat != Etat::Erreur)
        .count() as u32
}

/* ---------- ce qui est dû aujourd'hui — plafond GLOBAL ---------- */
pub fn envois_dus(
    campagnes: &[Campagne],
    journal: &[Entree],
    arrets: &[String], /* cids arrêtés (réponse reçue, non débrayable) */
    aujourdhui: &str,
) -> Vec<Du> {
    let mut dus: Vec<Du> = Vec::new();
    for c in campagnes {
        if c.state != "ready" {
            continue;
        }
        for t in &c.targets {
            if t.state != "active" || arrets.contains(&t.cid) {
                continue;
            }
            for step in 0..t.msgs.len() {
                let s = sid(&c.id, &t.tid, step);
                match entree(journal, &s) {
                    Some(e) if e.etat == Etat::Fait => continue, /* étape suivante */
                    Some(_) => break, /* incertain / erreur : chaîne stoppée */
                    None => {}
                }
                let du = if step == 0 {
                    t.start_at.as_str() <= aujourdhui
                } else {
                    match fait_le(journal, &sid(&c.id, &t.tid, step - 1)) {
                        Some(prev) => ajouter_jours(prev, PAS_JOURS).as_str() <= aujourdhui,
                        None => false,
                    }
                };
                if du {
                    dus.push(Du {
                        cp_id: c.id.clone(),
                        sid: s,
                        tid: t.tid.clone(),
                        step,
                        email: t.email.clone(),
                        subject: t.msgs[step].subject.clone(),
                        body: t.msgs[step].body.clone(),
                    });
                }
                break; /* une seule étape due à la fois par cible */
            }
        }
    }
    dus.sort_by(|a, b| b.step.cmp(&a.step)); /* relances d'abord */
    let place = PLAFOND_JOUR.saturating_sub(envoyes_le(journal, aujourdhui)) as usize;
    dus.truncate(place);
    dus
}

#[cfg(test)]
mod tests {
    use super::*;

    fn camp(id: &str, n: usize, start: &str) -> Campagne {
        Campagne {
            id: id.into(),
            state: "ready".into(),
            targets: (0..n)
                .map(|i| Cible {
                    tid: format!("t{}", i + 1),
                    cid: format!("c{i}"),
                    email: format!("p{i}@x.fr"),
                    who: String::new(),
                    start_at: start.into(),
                    state: "active".into(),
                    msgs: (0..3)
                        .map(|_| Message { subject: "s".into(), body: "b".into() })
                        .collect(),
                })
                .collect(),
        }
    }
    fn fait(j: &mut Vec<Entree>, sid: &str, date: &str) {
        j.push(Entree { sid: sid.into(), date: date.into(), etat: Etat::Fait });
    }

    /* FIXTURE CROISÉE — les mêmes chiffres que tests.js
       « campagne : cadence 15/jour, glissement » */
    #[test]
    fn cadence_15_par_jour_et_glissement() {
        let cs = [camp("cp", 20, "2026-07-16")];
        let mut j = Vec::new();
        let dus = envois_dus(&cs, &j, &[], "2026-07-16");
        assert_eq!(dus.len(), 15);
        for d in &dus {
            fait(&mut j, &d.sid, "2026-07-16");
        }
        assert_eq!(envois_dus(&cs, &j, &[], "2026-07-16").len(), 0);
        assert_eq!(envois_dus(&cs, &j, &[], "2026-07-17").len(), 5); /* le reste a glissé */
    }

    /* FIXTURE CROISÉE — « relances J+7 sur la date d'envoi RÉELLE » */
    #[test]
    fn relances_j7_sur_envoi_reel() {
        let cs = [camp("cp", 2, "2026-07-16")];
        let mut j = Vec::new();
        fait(&mut j, "cp.t1.0", "2026-07-16");
        fait(&mut j, "cp.t2.0", "2026-07-18");
        assert_eq!(envois_dus(&cs, &j, &[], "2026-07-22").len(), 0);
        let d23 = envois_dus(&cs, &j, &[], "2026-07-23");
        assert_eq!(d23.len(), 1);
        assert_eq!(d23[0].sid, "cp.t1.1");
        assert!(envois_dus(&cs, &j, &[], "2026-07-25")
            .iter()
            .any(|d| d.sid == "cp.t2.1"));
    }

    /* FIXTURE CROISÉE — « plafond GLOBAL 15/j toutes campagnes » */
    #[test]
    fn plafond_global_deux_campagnes() {
        let cs = [camp("ca", 10, "2026-07-16"), camp("cb", 10, "2026-07-16")];
        let mut j = Vec::new();
        for i in 1..=10 {
            fait(&mut j, &format!("ca.t{i}.0"), "2026-07-16");
        }
        let dus = envois_dus(&cs, &j, &[], "2026-07-16");
        assert_eq!(dus.len(), 5);
        assert!(dus.iter().all(|d| d.cp_id == "cb"));
        assert_eq!(envois_dus(&cs, &j, &[], "2026-07-17").len(), 10);
    }

    #[test]
    fn incertain_bloque_et_compte_erreur_bloque_sans_compter() {
        let cs = [camp("cp", 3, "2026-07-16")];
        let j = vec![
            Entree { sid: "cp.t1.0".into(), date: "2026-07-16".into(), etat: Etat::Incertain },
            Entree { sid: "cp.t2.0".into(), date: "2026-07-16".into(), etat: Etat::Erreur },
        ];
        let dus = envois_dus(&cs, &j, &[], "2026-07-16");
        /* t1 incertain : chaîne stoppée ; t2 erreur : stoppée ; t3 part */
        assert_eq!(dus.len(), 1);
        assert_eq!(dus[0].sid, "cp.t3.0");
        /* plafond : l'incertain compte, l'erreur non */
        assert_eq!(envoyes_le(&j, "2026-07-16"), 1);
        /* et J+30 : rien ne repart jamais pour t1/t2 */
        assert!(!envois_dus(&cs, &j, &[], "2026-08-16")
            .iter()
            .any(|d| d.tid == "t1" || d.tid == "t2"));
    }

    #[test]
    fn reponse_arrete_la_cible() {
        let cs = [camp("cp", 2, "2026-07-16")];
        let dus = envois_dus(&cs, &[], &["c0".into()], "2026-07-16");
        assert_eq!(dus.len(), 1);
        assert_eq!(dus[0].tid, "t2");
    }

    #[test]
    fn bords_de_date() {
        assert_eq!(ajouter_jours("2026-01-31", 7), "2026-02-07");
        assert_eq!(ajouter_jours("2026-12-28", 7), "2027-01-04");
        assert_eq!(ajouter_jours("2028-02-28", 7), "2028-03-06"); /* bissextile */
    }
}
