//! Vérification de l'anneau d'appareils reçu de la PWA. Le premier
//! anneau est appris pendant l'appairage authentifié ; les suivants
//! ne remplacent cet ancrage que s'ils sont plus récents et signés
//! par le principal connu (ou par la clé de secours avec une nouvelle
//! génération). La forme canonique est le miroir exact d'engine/ring.js.

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

#[derive(Debug, PartialEq, Eq)]
pub enum RefusAnneau {
    Format,
    Signature,
    Ancien,
}

pub fn cle_appareil(ring: &serde_json::Value, id: &str) -> Option<String> {
    ring["devices"].as_array()?.iter().find_map(|d| {
        (d["id"].as_str() == Some(id))
            .then(|| d["pub"].as_str().unwrap_or("").to_string())
            .filter(|p| !p.is_empty())
    })
}

fn canon(ring: &serde_json::Value) -> Result<String, RefusAnneau> {
    if ring["v"].as_u64() != Some(1) || ring["main"].as_str().unwrap_or("").is_empty() {
        return Err(RefusAnneau::Format);
    }
    let mut devices = ring["devices"]
        .as_array()
        .cloned()
        .ok_or(RefusAnneau::Format)?;
    devices.sort_by(|a, b| {
        a["id"]
            .as_str()
            .unwrap_or("")
            .cmp(b["id"].as_str().unwrap_or(""))
    });
    let devices: Vec<serde_json::Value> = devices
        .iter()
        .map(|d| {
            serde_json::json!([
                d["id"],
                d["name"],
                d["pub"],
                d["role"],
                d["addedAt"].as_i64().unwrap_or(0)
            ])
        })
        .collect();
    let mut cmds = ring["cmds"].as_array().cloned().unwrap_or_default();
    cmds.sort_by(|a, b| {
        a["cid"]
            .as_str()
            .unwrap_or("")
            .cmp(b["cid"].as_str().unwrap_or(""))
    });
    let cmds: Vec<serde_json::Value> = cmds
        .iter()
        .map(|c| {
            serde_json::json!([
                c["cid"],
                c["cmd"],
                c["target"],
                c["t"].as_i64().unwrap_or(0)
            ])
        })
        .collect();
    serde_json::to_string(&serde_json::json!([
        1,
        ring["gen"],
        ring["seq"].as_i64().unwrap_or(0),
        ring["main"],
        ring["recovery"],
        devices,
        cmds,
        ring["updatedAt"]
    ]))
    .map_err(|_| RefusAnneau::Format)
}

fn signe_par(ring: &serde_json::Value, pub_b64url: &str) -> bool {
    let Ok(cle) = URL_SAFE_NO_PAD.decode(pub_b64url) else {
        return false;
    };
    let Ok(cle) = <[u8; 32]>::try_from(cle) else {
        return false;
    };
    let Ok(cle) = VerifyingKey::from_bytes(&cle) else {
        return false;
    };
    let Ok(sig) = STANDARD.decode(ring["sig"].as_str().unwrap_or("")) else {
        return false;
    };
    let Ok(sig) = Signature::from_slice(&sig) else {
        return false;
    };
    let Ok(msg) = canon(ring) else { return false };
    cle.verify(msg.as_bytes(), &sig).is_ok()
}

/// Rend le nouvel anneau quand il avance, `None` pour un rejeu exact.
pub fn fusionner_anneau(
    actuel: &serde_json::Value,
    entrant: &serde_json::Value,
) -> Result<Option<serde_json::Value>, RefusAnneau> {
    canon(actuel)?;
    canon(entrant)?;
    let ag = actuel["gen"].as_i64().unwrap_or(0);
    let eg = entrant["gen"].as_i64().unwrap_or(0);
    let asq = actuel["seq"].as_i64().unwrap_or(0);
    let esq = entrant["seq"].as_i64().unwrap_or(0);
    if eg < ag || (eg == ag && esq < asq) {
        return Err(RefusAnneau::Ancien);
    }
    let main = actuel["main"].as_str().ok_or(RefusAnneau::Format)?;
    let pub_main = cle_appareil(actuel, main).ok_or(RefusAnneau::Format)?;
    if signe_par(entrant, &pub_main) {
        return if eg > ag || esq > asq {
            Ok(Some(entrant.clone()))
        } else {
            Ok(None)
        };
    }
    if eg > ag {
        if let Some(secours) = actuel["recovery"].as_str() {
            if signe_par(entrant, secours) {
                return Ok(Some(entrant.clone()));
            }
        }
    }
    Err(RefusAnneau::Signature)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn signer(mut ring: serde_json::Value, cle: &SigningKey) -> serde_json::Value {
        let sig = cle.sign(canon(&ring).unwrap().as_bytes());
        ring["sig"] = STANDARD.encode(sig.to_bytes()).into();
        ring
    }

    fn anneau(seq: i64, cle: &SigningKey) -> serde_json::Value {
        let pub_a = URL_SAFE_NO_PAD.encode(cle.verifying_key().to_bytes());
        signer(
            serde_json::json!({
                "v": 1, "gen": 1, "seq": seq, "main": "A", "recovery": pub_a,
                "devices": [{ "id": "A", "name": "Ordi", "pub": pub_a,
                    "role": "main", "addedAt": 10 }],
                "cmds": [], "updatedAt": 100 + seq
            }),
            cle,
        )
    }

    #[test]
    fn anneau_plus_recent_signe_accepte_et_cle_resolue() {
        let a = SigningKey::from_bytes(&[7u8; 32]);
        let b = SigningKey::from_bytes(&[8u8; 32]);
        let old = anneau(1, &a);
        let mut new = anneau(2, &a);
        new["devices"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "B", "name": "Téléphone", "pub": URL_SAFE_NO_PAD.encode(b.verifying_key().to_bytes()),
            "role": "member", "addedAt": 20
        }));
        new = signer(new, &a);
        let got = fusionner_anneau(&old, &new).unwrap().unwrap();
        assert_eq!(
            cle_appareil(&got, "B"),
            Some(URL_SAFE_NO_PAD.encode(b.verifying_key().to_bytes()))
        );
        assert_eq!(fusionner_anneau(&got, &got).unwrap(), None);
    }

    #[test]
    fn anneau_falsifie_ou_ancien_refuse() {
        let a = SigningKey::from_bytes(&[7u8; 32]);
        let b = SigningKey::from_bytes(&[8u8; 32]);
        let old = anneau(2, &a);
        let faux = signer(anneau(3, &a), &b);
        assert_eq!(fusionner_anneau(&old, &faux), Err(RefusAnneau::Signature));
        assert_eq!(
            fusionner_anneau(&old, &anneau(1, &a)),
            Err(RefusAnneau::Ancien)
        );
    }
}
