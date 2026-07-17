//! Les secrets du Compagnon (clé de canal, graine d'identité, plus
//! tard mots de passe d'application) : trousseau du système d'abord
//! (`keyring`), repli fichier 0600 dans le dossier de données à
//! défaut — annoncé au journal, jamais silencieux. Aucun secret ne
//! sort jamais dans un log.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::fs;
use std::path::PathBuf;

const SERVICE: &str = "OpenContact Compagnon";

pub struct Secrets {
    dossier: PathBuf,
}

impl Secrets {
    pub fn new(dossier: PathBuf) -> Self {
        fs::create_dir_all(&dossier).ok();
        Secrets { dossier }
    }
    fn fichier(&self, nom: &str) -> PathBuf {
        self.dossier.join(format!("secret-{nom}.b64"))
    }

    pub fn lire(&self, nom: &str) -> Option<Vec<u8>> {
        if let Ok(e) = keyring::Entry::new(SERVICE, nom) {
            if let Ok(s) = e.get_password() {
                if let Ok(v) = B64.decode(s.trim()) {
                    return Some(v);
                }
            }
        }
        fs::read_to_string(self.fichier(nom))
            .ok()
            .and_then(|s| B64.decode(s.trim()).ok())
    }

    pub fn ecrire(&self, nom: &str, val: &[u8]) -> bool {
        let s = B64.encode(val);
        if let Ok(e) = keyring::Entry::new(SERVICE, nom) {
            if e.set_password(&s).is_ok() {
                return true;
            }
        }
        let p = self.fichier(nom);
        if fs::write(&p, &s).is_ok() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&p, fs::Permissions::from_mode(0o600)).ok();
            }
            eprintln!("compagnon : trousseau indisponible — « {nom} » gardé en fichier protégé");
            return true;
        }
        false
    }

    pub fn effacer(&self, nom: &str) {
        if let Ok(e) = keyring::Entry::new(SERVICE, nom) {
            let _ = e.delete_credential();
        }
        let _ = fs::remove_file(self.fichier(nom));
    }
}
