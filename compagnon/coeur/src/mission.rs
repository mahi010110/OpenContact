//! La mission : un bon de travail signé, borné, révocable.
//! Le fil est `{ m, sig, dev }` où `m` est la chaîne JSON EXACTE qui
//! a été signée par l'appareil émetteur — on vérifie les octets, PUIS
//! on parse (aucune canonicalisation à maintenir des deux côtés).

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;

pub const GENRES: [&str; 2] = ["campaign-run", "mail-scan"];

#[derive(Debug, Deserialize, PartialEq)]
pub struct Mission {
    pub v: u32,
    pub mid: String,
    pub kind: String,
    #[serde(default)]
    pub params: serde_json::Value,
    #[serde(rename = "createdAt")]
    pub cree_a: i64,
    #[serde(rename = "expiresAt")]
    pub expire_a: i64,
    #[serde(default)]
    pub revoked: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refus {
    Signature,
    Format,
    Genre,
    Expiree,
    Revoquee,
}

/// Vérifie la signature sur les octets exacts de `m`, puis la forme
/// et la vie de la mission — dans cet ordre : rien n'est parsé avant
/// que la signature tienne.
pub fn verifier_mission(
    m: &str,
    sig_b64: &str,
    pub_b64url: &str,
    present_ms: i64,
) -> Result<Mission, Refus> {
    let cle = URL_SAFE_NO_PAD
        .decode(pub_b64url)
        .map_err(|_| Refus::Signature)?;
    let cle: [u8; 32] = cle.try_into().map_err(|_| Refus::Signature)?;
    let cle = VerifyingKey::from_bytes(&cle).map_err(|_| Refus::Signature)?;
    let sig = STANDARD.decode(sig_b64).map_err(|_| Refus::Signature)?;
    let sig = Signature::from_slice(&sig).map_err(|_| Refus::Signature)?;
    cle.verify(m.as_bytes(), &sig).map_err(|_| Refus::Signature)?;

    let ms: Mission = serde_json::from_str(m).map_err(|_| Refus::Format)?;
    if ms.v != 1 {
        return Err(Refus::Format);
    }
    if !GENRES.contains(&ms.kind.as_str()) {
        return Err(Refus::Genre);
    }
    if ms.revoked {
        return Err(Refus::Revoquee);
    }
    if present_ms >= ms.expire_a {
        return Err(Refus::Expiree);
    }
    Ok(ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    /* le MÊME vecteur que « missions Compagnon : fil signé » dans
       tests.js — graine 0..31, signature déterministe (RFC 8032).
       S'il casse d'un côté, le format du fil a changé. */
    const PUB: &str = "A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg";
    const SIG: &str =
        "oUjaqwFsq0uAA8vtYzgIgQ1itQtkz7vP6+zNJs2WVn6+FDj/Tl9dBRRsSdPi1TJW+kAFST0Qbd5CdZ+WkHsBBw==";
    const MSG: &str = r#"{"v":1,"mid":"ms-test-1","kind":"campaign-run","params":{"cpId":"cp1"},"createdAt":1752624000000,"expiresAt":1755216000000,"revoked":false}"#;

    #[test]
    fn vecteur_croise_js_rust() {
        let m = verifier_mission(MSG, SIG, PUB, 1_752_624_000_001).unwrap();
        assert_eq!(m.mid, "ms-test-1");
        assert_eq!(m.kind, "campaign-run");
        assert_eq!(m.params["cpId"], "cp1");
    }

    #[test]
    fn un_octet_change_est_refuse() {
        let falsifie = MSG.replace("cp1", "cp2");
        assert_eq!(
            verifier_mission(&falsifie, SIG, PUB, 1_752_624_000_001),
            Err(Refus::Signature)
        );
    }

    #[test]
    fn mauvaise_cle_refusee() {
        /* un caractère UTILE altéré (le dernier ne porte que des bits
           ignorés par un décodeur laxiste) */
        let autre = "B6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg";
        assert!(matches!(
            verifier_mission(MSG, SIG, autre, 1_752_624_000_001),
            Err(Refus::Signature)
        ));
    }

    #[test]
    fn expiree_et_revoquee_refusees() {
        assert_eq!(
            verifier_mission(MSG, SIG, PUB, 1_755_216_000_000),
            Err(Refus::Expiree)
        );
        /* une mission révoquée re-signée : le refus vient du champ */
        /* (on ne peut pas altérer MSG sans casser la signature — le
           test de révocation complet vit côté garde/journal) */
    }
}
