//! P8-2 — la frontière MCP, côté pur : bornes et liste blanche.
//!
//! Le serveur MCP ne fait qu'appeler ces fonctions ; la vérité métier
//! (vocabulaires fermés, liens neutralisés, dédoublonnage, fusion sans
//! écrasement) reste dans le moteur JS partagé de la PWA — chaque
//! proposition repasse par `parseInput` → aperçu avant fusion. Ici on
//! garde seulement la porte : schéma fermé, tailles, comptes, et
//! l'identifiant de rejeu (pid) dérivé du contenu — la même proposition
//! rejouée produit le même pid, donc jamais deux aperçus.

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

/// Une proposition ne dépasse jamais ces bornes — au-delà, refus
/// explicite (jamais de troncature silencieuse : le client corrige).
pub const PROP_PISTES_MAX: usize = 30;
pub const PROP_CONTACTS_MAX: usize = 8;
pub const PROP_TAILLE_MAX: usize = 256 * 1024;
/// L'outil de lecture sert au plus ce nombre de pistes.
pub const RESUME_LIMITE_MAX: usize = 50;
pub const RESUME_LIMITE_DEFAUT: usize = 20;

/* bornes par champ (caractères) — proposition ET résumé */
const B_NOM: usize = 120;
const B_VILLE: usize = 80;
const B_DOMAINE: usize = 24;
const B_URL: usize = 300;
const B_TEXTE: usize = 1000;
const B_ROLE: usize = 120;
const B_EMAIL: usize = 160;
const B_TEL: usize = 40;
const B_POSTE: usize = 24;
const B_POSTES_MAX: usize = 5;

/* les clés acceptées — tout le reste (y compris __proto__, constructor,
   prototype, id, status, notes…) est un refus, pas un oubli : le privé
   et la confiance ne s'écrivent pas depuis un client IA */
const CLES_PISTE: [(&str, usize); 9] = [
    ("name", B_NOM),
    ("city", B_VILLE),
    ("domain", B_DOMAINE),
    ("desc", B_TEXTE),
    ("website", B_URL),
    ("techs", B_TEXTE),
    ("process", B_TEXTE),
    ("tips", B_TEXTE),
    ("positions", 0), /* tableau, traité à part */
];
const CLES_CONTACT: [(&str, usize); 6] = [
    ("name", B_NOM),
    ("role", B_ROLE),
    ("email", B_EMAIL),
    ("phone", B_TEL),
    ("link", B_URL),
    ("note", B_TEXTE),
];

pub struct Proposition {
    /// Identifiant de rejeu : SHA-256 du contenu nettoyé (hex, 16).
    pub pid: String,
    /// L'enveloppe `share` v4 prête pour le rail de la PWA.
    pub share: Value,
    /// Nombre de pistes retenues.
    pub n: usize,
}

fn chaine(v: &Value, cle: &str, borne: usize) -> Result<Option<String>, String> {
    match v {
        Value::Null => Ok(None),
        Value::String(s) => {
            let s = s.trim();
            if s.chars().count() > borne {
                return Err(format!("{cle} : plus de {borne} caractères"));
            }
            Ok(if s.is_empty() { None } else { Some(s.to_string()) })
        }
        _ => Err(format!("{cle} : une chaîne est attendue")),
    }
}

fn nettoyer_contact(v: &Value) -> Result<Option<Value>, String> {
    let Some(o) = v.as_object() else {
        return Err("contacts : un objet est attendu".into());
    };
    for k in o.keys() {
        if !CLES_CONTACT.iter().any(|(c, _)| c == k) {
            return Err(format!("contact : champ inconnu « {k} »"));
        }
    }
    let mut out = Map::new();
    for (cle, borne) in CLES_CONTACT {
        if let Some(val) = o.get(cle) {
            if let Some(s) = chaine(val, cle, borne)? {
                out.insert(cle.into(), Value::String(s));
            }
        }
    }
    Ok(if out.is_empty() { None } else { Some(Value::Object(out)) })
}

fn nettoyer_piste(v: &Value) -> Result<Value, String> {
    let Some(o) = v.as_object() else {
        return Err("pistes : un objet est attendu".into());
    };
    for k in o.keys() {
        if k != "contacts" && !CLES_PISTE.iter().any(|(c, _)| c == k) {
            return Err(format!("piste : champ inconnu « {k} »"));
        }
    }
    let mut out = Map::new();
    for (cle, borne) in CLES_PISTE {
        let Some(val) = o.get(cle) else { continue };
        if cle == "positions" {
            let Some(arr) = val.as_array() else {
                return Err("positions : un tableau est attendu".into());
            };
            if arr.len() > B_POSTES_MAX {
                return Err(format!("positions : plus de {B_POSTES_MAX} entrées"));
            }
            let mut postes = vec![];
            for p in arr {
                if let Some(s) = chaine(p, "positions", B_POSTE)? {
                    postes.push(Value::String(s));
                }
            }
            if !postes.is_empty() {
                out.insert("positions".into(), Value::Array(postes));
            }
        } else if let Some(s) = chaine(val, cle, borne)? {
            out.insert(cle.into(), Value::String(s));
        }
    }
    if !out.contains_key("name") {
        return Err("piste sans nom".into());
    }
    if let Some(cs) = o.get("contacts") {
        let Some(arr) = cs.as_array() else {
            return Err("contacts : un tableau est attendu".into());
        };
        if arr.len() > PROP_CONTACTS_MAX {
            return Err(format!("plus de {PROP_CONTACTS_MAX} contacts par piste"));
        }
        let mut contacts = vec![];
        for c in arr {
            if let Some(ct) = nettoyer_contact(c)? {
                contacts.push(ct);
            }
        }
        if !contacts.is_empty() {
            out.insert("contacts".into(), Value::Array(contacts));
        }
    }
    Ok(Value::Object(out))
}

/// La porte d'entrée du seul rail d'écriture : une entrée structurée,
/// bornée, au schéma fermé → l'enveloppe `share` qui repassera par
/// l'aperçu de la PWA. Toute surprise est un refus explicite.
pub fn valider_proposition(v: &Value) -> Result<Proposition, String> {
    let brut = serde_json::to_string(v).map_err(|_| "format".to_string())?;
    if brut.len() > PROP_TAILLE_MAX {
        return Err(format!("proposition trop volumineuse (max {PROP_TAILLE_MAX} octets)"));
    }
    let Some(o) = v.as_object() else {
        return Err("un objet { pistes: [...] } est attendu".into());
    };
    for k in o.keys() {
        if k != "pistes" {
            return Err(format!("champ inconnu « {k} »"));
        }
    }
    let Some(arr) = o.get("pistes").and_then(|p| p.as_array()) else {
        return Err("un tableau « pistes » est attendu".into());
    };
    if arr.is_empty() {
        return Err("proposition vide".into());
    }
    if arr.len() > PROP_PISTES_MAX {
        return Err(format!("plus de {PROP_PISTES_MAX} pistes par proposition"));
    }
    let mut companies = vec![];
    for p in arr {
        companies.push(nettoyer_piste(p)?);
    }
    let canonique = serde_json::to_string(&companies).map_err(|_| "format".to_string())?;
    let pid = {
        let mut h = Sha256::new();
        h.update(canonique.as_bytes());
        let d = h.finalize();
        d.iter().take(8).map(|b| format!("{b:02x}")).collect::<String>()
    };
    let n = companies.len();
    Ok(Proposition {
        pid,
        share: json!({ "v": 4, "app": "mcp", "kind": "share", "companies": companies }),
        n,
    })
}

/// Le résumé servi en lecture : re-filtré ICI contre la liste blanche,
/// quel que soit ce que le fichier contient — une valeur inconnue
/// n'est jamais retournée parce qu'elle existe dans le stockage.
pub fn filtrer_resume(v: &Value, limite: usize) -> Value {
    let limite = limite.clamp(1, RESUME_LIMITE_MAX);
    let vide = vec![];
    let brutes = v.get("pistes").and_then(|p| p.as_array()).unwrap_or(&vide);
    let mut pistes: Vec<Value> = vec![];
    for p in brutes {
        let Some(o) = p.as_object() else { continue };
        let mut out = Map::new();
        for (cle, borne) in [("nom", B_NOM), ("ville", B_VILLE), ("domaine", B_DOMAINE), ("maj", 10)] {
            if let Some(Value::String(s)) = o.get(cle) {
                let s: String = s.chars().take(borne).collect();
                if !s.is_empty() {
                    out.insert(cle.into(), Value::String(s));
                }
            }
        }
        if let Some(Value::Array(ps)) = o.get("postes") {
            let ps: Vec<Value> = ps
                .iter()
                .filter_map(|x| x.as_str())
                .take(B_POSTES_MAX)
                .map(|s| Value::String(s.chars().take(B_POSTE).collect()))
                .collect();
            if !ps.is_empty() {
                out.insert("postes".into(), Value::Array(ps));
            }
        }
        if out.contains_key("nom") {
            pistes.push(Value::Object(out));
        }
    }
    /* tri déterministe : dernière activité d'abord, puis le nom */
    pistes.sort_by(|a, b| {
        let maj = |x: &Value| x.get("maj").and_then(|m| m.as_str()).unwrap_or("").to_string();
        let nom = |x: &Value| x.get("nom").and_then(|m| m.as_str()).unwrap_or("").to_string();
        maj(b).cmp(&maj(a)).then(nom(a).cmp(&nom(b)))
    });
    let total = v.get("total").and_then(|t| t.as_u64()).unwrap_or(pistes.len() as u64);
    let montrees = pistes.len().min(limite);
    pistes.truncate(limite);
    let mut suivi = Map::new();
    if let Some(Value::Object(s)) = v.get("suivi") {
        for cle in ["a_contacter", "en_cours", "reponse"] {
            if let Some(n) = s.get(cle).and_then(|x| x.as_u64()) {
                suivi.insert(cle.into(), Value::from(n));
            }
        }
    }
    json!({ "pistes": pistes, "total": total, "montrees": montrees, "suivi": suivi })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn normale() -> Value {
        json!({ "pistes": [
            { "name": "Sopra Steria", "city": "Lille", "domain": "esn",
              "positions": ["stage", "alternance"],
              "contacts": [{ "name": "Iris", "email": "iris@exemple.fr" }] },
            { "name": "Exotec", "city": "Croix" }
        ] })
    }

    #[test]
    fn proposition_normale_et_pid_stable() {
        let p1 = valider_proposition(&normale()).expect("valide");
        let p2 = valider_proposition(&normale()).expect("valide");
        assert_eq!(p1.n, 2);
        assert_eq!(p1.pid, p2.pid, "rejeu = même pid");
        assert_eq!(p1.pid.len(), 16);
        assert_eq!(p1.share["v"], 4);
        assert_eq!(p1.share["kind"], "share");
        assert_eq!(p1.share["companies"][0]["name"], "Sopra Steria");
        assert_eq!(p1.share["companies"][0]["contacts"][0]["email"], "iris@exemple.fr");
        /* un contenu différent change le pid */
        let autre = valider_proposition(&json!({ "pistes": [{ "name": "Autre" }] })).unwrap();
        assert_ne!(p1.pid, autre.pid);
    }

    #[test]
    fn refus_vide_trop_et_sans_nom() {
        assert!(valider_proposition(&json!({ "pistes": [] })).is_err());
        assert!(valider_proposition(&json!({})).is_err());
        assert!(valider_proposition(&json!({ "pistes": [{ "city": "Lille" }] })).is_err());
        let trop: Vec<Value> = (0..=PROP_PISTES_MAX).map(|i| json!({ "name": format!("p{i}") })).collect();
        assert!(valider_proposition(&json!({ "pistes": trop })).is_err());
    }

    #[test]
    fn refus_champs_inconnus_et_prototype() {
        for hostile in [
            json!({ "pistes": [{ "name": "X" }], "autre": 1 }),
            json!({ "pistes": [{ "name": "X", "status": "reply" }] }),
            json!({ "pistes": [{ "name": "X", "notes": "privé" }] }),
            json!({ "pistes": [{ "name": "X", "id": "<img onerror=1>" }] }),
            json!({ "pistes": [{ "name": "X", "__proto__": { "polluted": true } }] }),
            json!({ "pistes": [{ "name": "X", "constructor": {} }] }),
            json!({ "pistes": [{ "name": "X", "prototype": {} }] }),
            json!({ "pistes": [{ "name": "X", "contacts": [{ "name": "A", "conf": "ok" }] }] }),
            json!({ "pistes": [{ "name": { "profond": { "objet": 1 } } }] }),
        ] {
            assert!(valider_proposition(&hostile).is_err(), "aurait dû refuser : {hostile}");
        }
    }

    #[test]
    fn refus_bornes_de_taille() {
        let long = "x".repeat(B_NOM + 1);
        assert!(valider_proposition(&json!({ "pistes": [{ "name": long }] })).is_err());
        let gros = "x".repeat(PROP_TAILLE_MAX);
        assert!(valider_proposition(&json!({ "pistes": [{ "name": "X", "desc": gros }] })).is_err());
        /* un lien piégé reste une donnée bornée ici : c'est le rail JS
           de la PWA qui le neutralise avant toute fusion (prouvé E2E) */
        let p = valider_proposition(&json!({ "pistes": [{ "name": "X",
            "contacts": [{ "name": "A", "link": "javascript:alert(1)" }] }] })).unwrap();
        assert_eq!(p.share["companies"][0]["contacts"][0]["link"], "javascript:alert(1)");
    }

    #[test]
    fn resume_refiltre_liste_blanche_tri_et_limite() {
        let stocke = json!({ "pistes": [
            { "nom": "Beta", "maj": "2026-07-01", "notes": "PRIVÉ", "status": "reply",
              "email": "fuite@exemple.fr", "postes": ["stage"] },
            { "nom": "Alpha", "maj": "2026-07-10", "ville": "Lille" },
            { "nom": "Camée", "maj": "2026-07-10" },
            { "sans_nom": true }
        ], "total": 4, "suivi": { "a_contacter": 2, "en_cours": 1, "reponse": 1, "secret": 9 } });
        let r = filtrer_resume(&stocke, 2);
        let ps = r["pistes"].as_array().unwrap();
        assert_eq!(ps.len(), 2);
        /* tri : maj desc puis nom asc — déterministe */
        assert_eq!(ps[0]["nom"], "Alpha");
        assert_eq!(ps[1]["nom"], "Camée");
        assert_eq!(r["montrees"], 2);
        assert_eq!(r["total"], 4);
        assert_eq!(r["suivi"]["a_contacter"], 2);
        assert!(r["suivi"].get("secret").is_none(), "clé inconnue jamais servie");
        let plein = serde_json::to_string(&r).unwrap();
        for interdit in ["PRIVÉ", "fuite@exemple.fr", "reply", "sans_nom"] {
            assert!(!plein.contains(interdit), "fuite : {interdit}");
        }
        /* limite bornée quoi qu'on demande */
        assert_eq!(filtrer_resume(&stocke, 9999)["pistes"].as_array().unwrap().len(), 3);
    }
}
