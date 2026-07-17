//! L'enveloppe du canal : le MÊME format `OCV1.<iv>.<chiffré>` que
//! `engine/vault.js` (AES-GCM 256, AAD = `OCV1|<nom>`) — la PWA
//! scelle avec `sealValue`, le Compagnon ouvre ici, et inversement.
//! La clé d'appairage se dérive du code court par PBKDF2-SHA256,
//! comme côté WebCrypto (préfixe `code:`, itérations partagées).

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;

/// Itérations de la dérivation du code d'appairage — partagées avec
/// la PWA (`ui/compagnon.js`). Changer = casser l'appairage.
pub const ITER_APPAIRAGE: u32 = 120_000;

#[derive(Debug, PartialEq, Eq)]
pub enum Erreur {
    Format,
    Coffre,
}

/// PBKDF2-SHA256 du code court normalisé (préfixe `code:`).
pub fn cle_du_code(code: &str, sel: &[u8]) -> [u8; 32] {
    let mut cle = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        format!("code:{code}").as_bytes(),
        sel,
        ITER_APPAIRAGE,
        &mut cle,
    );
    cle
}

pub fn sceller(cle: &[u8; 32], nom: &str, clair: &str, iv: &[u8; 12]) -> String {
    let aead = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(cle));
    let ct = aead
        .encrypt(
            Nonce::from_slice(iv),
            Payload {
                msg: clair.as_bytes(),
                aad: format!("OCV1|{nom}").as_bytes(),
            },
        )
        .expect("scellement");
    format!("OCV1.{}.{}", STANDARD.encode(iv), STANDARD.encode(ct))
}

pub fn ouvrir(cle: &[u8; 32], nom: &str, env: &str) -> Result<String, Erreur> {
    let parts: Vec<&str> = env.split('.').collect();
    if parts.len() != 3 || parts[0] != "OCV1" {
        return Err(Erreur::Format);
    }
    let iv = STANDARD.decode(parts[1]).map_err(|_| Erreur::Format)?;
    let ct = STANDARD.decode(parts[2]).map_err(|_| Erreur::Format)?;
    if iv.len() != 12 {
        return Err(Erreur::Format);
    }
    let aead = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(cle));
    let clair = aead
        .decrypt(
            Nonce::from_slice(&iv),
            Payload {
                msg: &ct,
                aad: format!("OCV1|{nom}").as_bytes(),
            },
        )
        .map_err(|_| Erreur::Coffre)?;
    String::from_utf8(clair).map_err(|_| Erreur::Format)
}

#[cfg(test)]
mod tests {
    use super::*;

    /* vecteurs générés par le moteur JS (WebCrypto) — s'ils cassent,
       le format du canal a changé et la PWA ne parle plus au Compagnon */
    #[test]
    fn vecteur_croise_enveloppe_js() {
        let cle: [u8; 32] = core::array::from_fn(|i| i as u8);
        let iv: [u8; 12] = core::array::from_fn(|i| 100 + i as u8);
        let env = sceller(&cle, "canal", r#"{"t":"ping"}"#, &iv);
        assert_eq!(env, "OCV1.ZGVmZ2hpamtsbW5v.MzmqREPLJvdQBX2VOGIaiocII4LC8CaDhjkj7w==");
        assert_eq!(ouvrir(&cle, "canal", &env).unwrap(), r#"{"t":"ping"}"#);
        /* l'AAD lie l'enveloppe à son nom : un autre nom ne l'ouvre pas */
        assert_eq!(ouvrir(&cle, "autre", &env), Err(Erreur::Coffre));
    }

    #[test]
    fn vecteur_croise_derivation_code() {
        let sel: [u8; 16] = core::array::from_fn(|i| i as u8);
        let cle = cle_du_code("ABCD-2345", &sel);
        assert_eq!(
            STANDARD.encode(cle),
            "0zhUpHdF75HUrzrxzTIA1kwhXaMNsx8wJzed3TBbiwk="
        );
    }

    #[test]
    fn mauvaise_cle_refusee() {
        let cle: [u8; 32] = core::array::from_fn(|i| i as u8);
        let autre: [u8; 32] = core::array::from_fn(|i| 1 + i as u8);
        let iv = [7u8; 12];
        let env = sceller(&cle, "canal", "secret", &iv);
        assert_eq!(ouvrir(&autre, "canal", &env), Err(Erreur::Coffre));
    }
}
