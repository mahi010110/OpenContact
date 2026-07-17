//! La boucle d'exécution app fermée. Toutes les 60 s (OC_TICK_MS en
//! développement) : fenêtre d'envoi → planificateur (oc-coeur, miroir
//! du moteur JS) → et CHAQUE envoi repasse par la garde avant de
//! partir (D17). Le journal s'écrit AVANT l'envoi (« incertain »)
//! puis se confirme (« fait ») : un arrêt brutal entre les deux ne
//! re-tente JAMAIS — résultat incertain, montré comme tel. Un échec
//! transitoire (rien n'est parti) libère l'entrée pour plus tard ;
//! un refus du fournisseur bloque la cible définitivement.

use crate::envoi::{self, Echec};
use crate::missions::EtatMissions;
use crate::partage::Partage;
use chrono::{Datelike, Local, Timelike};
use oc_coeur::planifier::{envois_dus, Entree, Etat};
use oc_coeur::Garde;
use std::sync::Arc;

pub fn demarrer(p: Arc<Partage>) {
    std::thread::spawn(move || {
        let tick = std::env::var("OC_TICK_MS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(60_000u64);
        loop {
            cycle(&p);
            std::thread::sleep(std::time::Duration::from_millis(tick));
        }
    });
}

fn maintenant() -> (u8, u8, String, i64) {
    let now = Local::now();
    let mut js = now.weekday().number_from_monday() as u8;
    let mut h = now.hour() as u8;
    /* OC_FENETRE_TEST (développement seulement) : force un mardi 10 h
       pour tester la boucle quel que soit le moment du run */
    if std::env::var("OC_FENETRE_TEST").is_ok() {
        js = 2;
        h = 10;
    }
    (js, h, now.format("%Y-%m-%d").to_string(), now.timestamp_millis())
}

pub fn cycle(p: &Arc<Partage>) {
    let (js, h, date, present) = maintenant();
    if !oc_coeur::dans_fenetre(js, h) {
        return;
    }
    let Some(pub_pair) = p
        .assoc
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|a| a.appareil["pub"].as_str().map(String::from))
    else {
        return;
    };
    let mut em = EtatMissions::charger(&p.coffre);
    let camps = em.campagnes(&pub_pair, present);
    if camps.is_empty() {
        return;
    }
    let arrets = em.arrets.clone();
    let dus = envois_dus(&camps, &em.journal, &arrets, &date);
    if dus.is_empty() {
        return;
    }
    let (reglage, mdp) = p.reglage_mail();
    if reglage.hote.is_empty() && std::env::var("OC_SMTP_TEST").is_err() {
        println!("compagnon : {} envoi(s) en attente — messagerie à régler", dus.len());
        return;
    }
    /* la garde, reconstruite du journal : fait/incertain comptent au
       plafond, un refus bloque sans compter */
    let mut garde = Garde::default();
    for e in &em.journal {
        match e.etat {
            Etat::Erreur => garde.bloquer(&e.sid),
            _ => garde.consigner(&e.sid, &e.date),
        }
    }
    for du in dus {
        if garde.autoriser(&du.sid, &du.cp_id, &date, js, h).is_err() {
            continue;
        }
        /* AVANT l'envoi : l'identifiant est pris — un crash ici laisse
           « incertain », jamais un double */
        em.journal.push(Entree { sid: du.sid.clone(), date: date.clone(), etat: Etat::Incertain });
        em.sauver(&p.coffre);
        match envoi::envoyer(&reglage, &mdp, &du.email, &du.subject, &du.body) {
            Ok(()) => {
                if let Some(e) = em.journal.last_mut() {
                    e.etat = Etat::Fait;
                }
                em.sauver(&p.coffre);
                garde.consigner(&du.sid, &date);
                println!("compagnon : envoyé {}", du.sid);
            }
            Err(Echec::Transitoire(e)) => {
                /* rien n'est parti : on libère, la boucle re-tentera */
                em.journal.pop();
                em.sauver(&p.coffre);
                eprintln!("compagnon : réseau — {e}");
                return; /* inutile d'insister ce cycle-ci */
            }
            Err(Echec::Refus(e)) => {
                if let Some(en) = em.journal.last_mut() {
                    en.etat = Etat::Erreur;
                }
                em.sauver(&p.coffre);
                garde.bloquer(&du.sid);
                eprintln!("compagnon : refusé {} — {e}", du.sid);
            }
        }
    }
}
