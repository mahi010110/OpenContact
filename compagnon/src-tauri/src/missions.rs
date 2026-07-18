//! Les missions confiées et le journal des envois — persistés au
//! coffre local. Une mission garde sa chaîne SIGNÉE d'origine : elle
//! est re-vérifiée (signature, expiration, révocation) à CHAQUE
//! lecture — pas seulement à la réception.

use crate::coffrelocal::CoffreLocal;
use crate::partage::Association;
use oc_coeur::planifier::{Campagne, Entree};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct MissionRecue {
    pub mid: String,
    pub m: String, /* la chaîne JSON exacte, signée */
    pub sig: String,
    pub dev: String,
    pub recu: i64,
    #[serde(default)]
    pub revoquee: bool,
}

#[derive(Serialize, Deserialize, Default)]
pub struct EtatMissions {
    pub missions: Vec<MissionRecue>,
    pub journal: Vec<Entree>,
    /// Cibles arrêtées (réponse reçue — non débrayable), par `cid`.
    #[serde(default)]
    pub arrets: Vec<String>,
    /// Réponses DÉTECTÉES ici (IMAP) — la PWA les replie sur les fiches.
    #[serde(default)]
    pub reponses: Vec<String>,
}

impl EtatMissions {
    pub fn charger(c: &CoffreLocal) -> Self {
        c.lire("missions")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn sauver(&self, c: &CoffreLocal) {
        if let Ok(s) = serde_json::to_string(self) {
            c.ecrire("missions", &s);
        }
    }
    /// Range (ou remplace, même `mid`) une mission reçue.
    pub fn ranger(&mut self, mr: MissionRecue) {
        self.missions.retain(|x| x.mid != mr.mid);
        self.missions.push(mr);
    }
    /// Les campagnes des missions VIVANTES — signature re-vérifiée
    /// contre la clé publique de SON appareil dans l'anneau, à chaque appel.
    pub fn campagnes(&self, assoc: &Association, present_ms: i64) -> Vec<Campagne> {
        self.missions
            .iter()
            .filter(|mr| !mr.revoquee)
            .filter_map(|mr| {
                let pub_dev = assoc.cle_mission(&mr.dev)?;
                let ms = oc_coeur::verifier_mission(&mr.m, &mr.sig, &pub_dev, present_ms).ok()?;
                if ms.kind != "campaign-run" {
                    return None;
                }
                serde_json::from_value::<Campagne>(ms.params.get("campaign")?.clone()).ok()
            })
            .collect()
    }
}
