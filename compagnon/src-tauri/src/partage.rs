//! L'état partagé entre la fenêtre (commandes) et le canal local
//! (serveur) : identité de l'appareil, association, appairage en
//! cours. Les secrets vivent dans `Secrets` ; le non-secret
//! (association, identité publique) dans `etat.json`.

use crate::coffrelocal::CoffreLocal;
use crate::envoi::ReglageMail;
use crate::secrets::Secrets;
use base64::engine::general_purpose::{STANDARD as B64, URL_SAFE_NO_PAD};
use base64::Engine;
use ed25519_dalek::SigningKey;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicU16;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Serialize, Deserialize, Clone)]
pub struct Association {
    /// L'appareil OpenContact qui nous a associés : `{id, name, pub}`.
    pub appareil: serde_json::Value,
    /// L'anneau appris à l'association (TOFU sur canal authentifié).
    pub ring: serde_json::Value,
    pub nom: String,
}

#[derive(Serialize, Deserialize, Default)]
struct EtatDisque {
    id: String,
    assoc: Option<Association>,
}

pub struct Appairage {
    pub code: String,
    pub sel: [u8; 16],
    pub kc: [u8; 32],
    pub depuis: Instant,
    pub essais: u32,
}

pub struct Partage {
    pub secrets: Secrets,
    pub coffre: CoffreLocal,
    dossier: PathBuf,
    pub id: String,
    pub pub_b64url: String,
    pub nom: String,
    pub assoc: Mutex<Option<Association>>,
    pub canal_k: Mutex<Option<[u8; 32]>>,
    pub appairage: Mutex<Option<Appairage>>,
    pub port: AtomicU16,
}

const ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789"; /* sans I, L, O, 0, 1 */

pub fn code_court() -> String {
    let mut r = rand::thread_rng();
    let mut s = String::new();
    for i in 0..8 {
        if i == 4 {
            s.push('-');
        }
        s.push(ALPHABET[(r.next_u32() as usize) % ALPHABET.len()] as char);
    }
    s
}

impl Partage {
    pub fn ouvrir(dossier: PathBuf) -> Self {
        let secrets = Secrets::new(dossier.clone());
        let mut disque: EtatDisque = fs::read_to_string(dossier.join("etat.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        /* identité Ed25519 : graine dans le trousseau, créée au premier
           lancement — la clé publique nomme cet appareil dans l'anneau */
        let seed: [u8; 32] = match secrets.lire("identite.seed") {
            Some(v) if v.len() == 32 => v.try_into().unwrap(),
            _ => {
                let mut s = [0u8; 32];
                rand::thread_rng().fill_bytes(&mut s);
                secrets.ecrire("identite.seed", &s);
                s
            }
        };
        let pub_b64url = URL_SAFE_NO_PAD.encode(SigningKey::from_bytes(&seed).verifying_key().to_bytes());
        if disque.id.is_empty() {
            disque.id = format!("cg{}", &pub_b64url[..10].to_lowercase());
        }
        let canal_k = secrets
            .lire("canal.k")
            .and_then(|v| <[u8; 32]>::try_from(v).ok());
        let nom = hostname::get()
            .ok()
            .and_then(|h| h.into_string().ok())
            .unwrap_or_else(|| "Ordinateur".into());

        let coffre = CoffreLocal::ouvrir(&secrets, dossier.clone());
        let p = Partage {
            secrets,
            coffre,
            dossier,
            id: disque.id.clone(),
            pub_b64url,
            nom,
            assoc: Mutex::new(disque.assoc),
            canal_k: Mutex::new(canal_k),
            appairage: Mutex::new(None),
            port: AtomicU16::new(0),
        };
        p.persister();
        p
    }

    pub fn persister(&self) {
        let d = EtatDisque {
            id: self.id.clone(),
            assoc: self.assoc.lock().unwrap().clone(),
        };
        if let Ok(s) = serde_json::to_string(&d) {
            let _ = fs::write(self.dossier.join("etat.json"), s);
        }
    }

    pub fn associe(&self) -> bool {
        self.assoc.lock().unwrap().is_some()
    }

    /// Rompre l'association : l'appareil pair et la clé de canal
    /// disparaissent — un nouvel appairage repart de zéro.
    pub fn dissocier(&self) {
        *self.assoc.lock().unwrap() = None;
        *self.canal_k.lock().unwrap() = None;
        self.secrets.effacer("canal.k");
        self.persister();
    }

    /// Le réglage messagerie (scellé) + le mot de passe (trousseau).
    pub fn reglage_mail(&self) -> (ReglageMail, String) {
        let r = self
            .coffre
            .lire("mail")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let mdp = self
            .secrets
            .lire("mail.mdp")
            .and_then(|v| String::from_utf8(v).ok())
            .unwrap_or_default();
        (r, mdp)
    }
    pub fn ecrire_reglage_mail(&self, r: &ReglageMail, mdp: &str) {
        if let Ok(s) = serde_json::to_string(r) {
            self.coffre.ecrire("mail", &s);
        }
        if !mdp.is_empty() {
            self.secrets.ecrire("mail.mdp", mdp.as_bytes());
        }
    }

    pub fn sceller_canal(&self, k: [u8; 32], assoc: Association) {
        self.secrets.ecrire("canal.k", &k);
        *self.canal_k.lock().unwrap() = Some(k);
        *self.assoc.lock().unwrap() = Some(assoc);
        *self.appairage.lock().unwrap() = None;
        self.persister();
    }
}

/* l'enveloppe du fil réutilise oc-coeur ; b64 standard pour les sels */
pub fn b64(v: &[u8]) -> String {
    B64.encode(v)
}
