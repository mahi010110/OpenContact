//! Le coffre local du Compagnon : missions (elles portent le contenu
//! des campagnes — privé), journal des envois et réglages messagerie
//! reposent SCELLÉS (`OCV1.`) sous une clé de stockage gardée au
//! trousseau. Un fichier lu sans le trousseau ne dit rien.

use crate::secrets::Secrets;
use oc_coeur::{ouvrir, sceller};
use rand::RngCore;
use std::fs;
use std::path::PathBuf;

pub struct CoffreLocal {
    cle: [u8; 32],
    dossier: PathBuf,
}

impl CoffreLocal {
    pub fn ouvrir(secrets: &Secrets, dossier: PathBuf) -> Self {
        let cle: [u8; 32] = match secrets.lire("stockage.k") {
            Some(v) if v.len() == 32 => v.try_into().unwrap(),
            _ => {
                let mut k = [0u8; 32];
                rand::thread_rng().fill_bytes(&mut k);
                secrets.ecrire("stockage.k", &k);
                k
            }
        };
        CoffreLocal { cle, dossier }
    }
    fn chemin(&self, nom: &str) -> PathBuf {
        self.dossier.join(format!("{nom}.ocv"))
    }
    pub fn lire(&self, nom: &str) -> Option<String> {
        let env = fs::read_to_string(self.chemin(nom)).ok()?;
        ouvrir(&self.cle, nom, env.trim()).ok()
    }
    pub fn ecrire(&self, nom: &str, clair: &str) {
        let mut iv = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv);
        let _ = fs::write(self.chemin(nom), sceller(&self.cle, nom, clair, &iv));
    }
}
