//! L'envoi SMTP (lettre, TLS rustls). Le réglage vit scellé au coffre
//! local, le mot de passe d'application au trousseau — jamais dans un
//! fichier clair ni un log. `OC_SMTP_TEST=hote:port` (développement
//! seulement) route vers un puits local en clair.

use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ReglageMail {
    pub hote: String,
    pub port: u16,
    pub securite: String, /* "tls" (465) | "starttls" (587) */
    pub utilisateur: String,
    pub de: String,
    /* lecture des réponses (D8 : même mot de passe d'application) */
    #[serde(default)]
    pub imap_hote: String, /* défaut : imap.gmail.com */
    #[serde(default)]
    pub imap_port: u16, /* défaut : 993 */
}

#[derive(Debug)]
pub enum Echec {
    /// Rien n'est parti (connexion, DNS…) — re-tentable plus tard.
    Transitoire(String),
    /// Le fournisseur a refusé — jamais re-tenté en silence.
    Refus(String),
}

pub fn envoyer(r: &ReglageMail, mdp: &str, to: &str, subject: &str, body: &str) -> Result<(), Echec> {
    let de = if r.de.is_empty() { "compagnon@local.invalid" } else { &r.de };
    let msg = Message::builder()
        .from(de.parse().map_err(|_| Echec::Refus("adresse d'envoi".into()))?)
        .to(to.parse().map_err(|_| Echec::Refus("adresse destinataire".into()))?)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())
        .map_err(|e| Echec::Refus(e.to_string()))?;

    let tp = if let Ok(test) = std::env::var("OC_SMTP_TEST") {
        let mut it = test.split(':');
        let h = it.next().unwrap_or("127.0.0.1").to_string();
        let p: u16 = it.next().and_then(|x| x.parse().ok()).unwrap_or(2525);
        SmtpTransport::builder_dangerous(h).port(p).build()
    } else if r.securite == "starttls" {
        SmtpTransport::starttls_relay(&r.hote)
            .map_err(|e| Echec::Transitoire(e.to_string()))?
            .credentials(Credentials::new(r.utilisateur.clone(), mdp.to_string()))
            .port(if r.port == 0 { 587 } else { r.port })
            .build()
    } else {
        SmtpTransport::relay(&r.hote)
            .map_err(|e| Echec::Transitoire(e.to_string()))?
            .credentials(Credentials::new(r.utilisateur.clone(), mdp.to_string()))
            .port(if r.port == 0 { 465 } else { r.port })
            .build()
    };

    match tp.send(&msg) {
        Ok(_) => Ok(()),
        Err(e) => {
            /* un refus du serveur (réponse SMTP) est définitif ; tout le
               reste (connexion, io) n'est jamais parti : re-tentable */
            if e.is_permanent() {
                Err(Echec::Refus(e.to_string()))
            } else if e.is_transient() {
                Err(Echec::Refus(format!("refus temporaire : {e}")))
            } else {
                Err(Echec::Transitoire(e.to_string()))
            }
        }
    }
}
