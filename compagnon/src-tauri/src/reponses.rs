//! La détection des réponses (D8) : le Compagnon lit la boîte avec le
//! MÊME mot de passe d'application (IMAP, en-têtes seulement — une
//! recherche `FROM … SINCE …`, jamais le contenu). Une réponse
//! détectée arrête la cible — non débrayable — et remonte au rapport
//! pour que la PWA marque la fiche. `OC_IMAP_TEST=hote:port`
//! (développement seulement) : faux IMAP local en clair.

use crate::missions::EtatMissions;
use crate::partage::Partage;
use chrono::Local;
use std::io::{Read, Write};
use std::sync::Arc;

/* la date IMAP : 16-Jul-2026 (mois anglais, insensible à la locale) */
fn date_imap(iso: &str) -> String {
    const MOIS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let p: Vec<u32> = iso.split('-').filter_map(|s| s.parse().ok()).collect();
    if p.len() != 3 || p[1] < 1 || p[1] > 12 {
        return iso.into();
    }
    format!("{}-{}-{}", p[2], MOIS[(p[1] - 1) as usize], p[0])
}

fn chercher<T: Read + Write>(
    sess: &mut imap::Session<T>,
    candidats: &[(String, String, String)], /* (cid, email, envoyé le) */
) -> Vec<String> {
    let mut vues = Vec::new();
    if sess.select("INBOX").is_err() {
        return vues;
    }
    for (cid, email, depuis) in candidats {
        let q = format!("FROM \"{}\" SINCE {}", email, date_imap(depuis));
        if let Ok(uids) = sess.uid_search(&q) {
            if !uids.is_empty() {
                vues.push(cid.clone());
            }
        }
    }
    vues
}

pub fn detecter(p: &Arc<Partage>) {
    /* même verrou que le cycle d'envoi : la détection réécrit le journal
       (arrêts, réponses) et ne doit pas se croiser avec un envoi qui écrit
       « fait » — sinon l'un écrase l'autre et un envoi confirmé peut repartir. */
    let _serialise = p.journal_lock.lock().unwrap();
    let Some(assoc) = p.assoc.lock().unwrap().clone() else {
        return;
    };
    let mut em = EtatMissions::charger(&p.coffre);
    let camps = em.campagnes(&assoc, Local::now().timestamp_millis());
    /* les cibles vivantes dont le premier message est PARTI */
    let mut candidats: Vec<(String, String, String)> = Vec::new();
    for c in &camps {
        for t in &c.targets {
            if t.state != "active" || em.arrets.contains(&t.cid) {
                continue;
            }
            let s0 = oc_coeur::planifier::sid(&c.id, &t.tid, 0);
            if let Some(e) = em
                .journal
                .iter()
                .find(|e| e.sid == s0 && e.etat == oc_coeur::planifier::Etat::Fait)
            {
                candidats.push((t.cid.clone(), t.email.clone(), e.date.clone()));
            }
        }
    }
    if candidats.is_empty() {
        return;
    }
    let (r, mdp) = p.reglage_mail();
    let vues = if let Ok(test) = std::env::var("OC_IMAP_TEST") {
        let mut it = test.split(':');
        let h = it.next().unwrap_or("127.0.0.1").to_string();
        let port: u16 = it.next().and_then(|x| x.parse().ok()).unwrap_or(1143);
        let Ok(tcp) = std::net::TcpStream::connect((h.as_str(), port)) else { return };
        let client = imap::Client::new(tcp);
        let Ok(mut sess) = client.login(&r.utilisateur, &mdp).map_err(|e| e.0) else { return };
        let v = chercher(&mut sess, &candidats);
        let _ = sess.logout();
        v
    } else {
        if r.imap_hote.is_empty() && r.hote.is_empty() {
            return; /* messagerie pas réglée : rien à lire */
        }
        let hote = if r.imap_hote.is_empty() { "imap.gmail.com".to_string() } else { r.imap_hote.clone() };
        let port = if r.imap_port == 0 { 993 } else { r.imap_port };
        let Ok(tls) = native_tls::TlsConnector::new() else { return };
        let Ok(client) = imap::connect((hote.as_str(), port), hote.as_str(), &tls) else {
            return; /* hors ligne : on repassera */
        };
        let Ok(mut sess) = client.login(&r.utilisateur, &mdp).map_err(|e| e.0) else {
            eprintln!("compagnon : lecture refusée — vérifie le mot de passe d'application");
            return;
        };
        let v = chercher(&mut sess, &candidats);
        let _ = sess.logout();
        v
    };
    if vues.is_empty() {
        return;
    }
    for cid in vues {
        if !em.arrets.contains(&cid) {
            em.arrets.push(cid.clone());
        }
        if !em.reponses.contains(&cid) {
            em.reponses.push(cid.clone());
        }
        println!("compagnon : réponse détectée — relances arrêtées ({cid})");
    }
    em.sauver(&p.coffre);
}

#[cfg(test)]
mod tests {
    use super::date_imap;
    #[test]
    fn format_date_imap() {
        assert_eq!(date_imap("2026-07-16"), "16-Jul-2026");
        assert_eq!(date_imap("2026-01-02"), "2-Jan-2026");
    }
}
