//! Les commandes offertes au cerveau JS. Principe D17 : le cerveau
//! propose, la garde Rust re-vérifie — une action refusée ici ne part
//! pas, quoi qu'ait décidé le JS.

use crate::partage::{b64, code_court, Appairage, Partage};
use rand::RngCore;
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use tauri::State;
use tauri_plugin_autostart::ManagerExt;

#[derive(Serialize)]
pub struct Etat {
    pub version: String,
    pub associe: bool,
    pub nom: String,
    pub pair: Option<String>,
}

/// L'appairage : la fenêtre demande un code court, l'affiche, et la
/// PWA du même ordinateur vient le prouver sur le canal local.
#[tauri::command]
pub fn appairage_demarrer(p: State<Arc<Partage>>) -> Result<String, String> {
    let code = code_court();
    let mut sel = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut sel);
    let kc = oc_coeur::cle_du_code(&code, &sel);
    *p.appairage.lock().unwrap() = Some(Appairage {
        code: code.clone(),
        sel,
        kc,
        depuis: Instant::now(),
        essais: 0,
    });
    Ok(code)
}
#[tauri::command]
pub fn appairage_annuler(p: State<Arc<Partage>>) {
    *p.appairage.lock().unwrap() = None;
}
#[tauri::command]
pub fn dissocier(p: State<Arc<Partage>>) {
    p.dissocier();
}
/* le sel de l'appairage en cours — la même valeur que la découverte
   du canal expose à la PWA (utile aux tests) */
#[tauri::command]
pub fn appairage_sel(p: State<Arc<Partage>>) -> Option<String> {
    p.appairage.lock().unwrap().as_ref().map(|a| b64(&a.sel))
}

/// Démarrage automatique avec la session — optionnel, jamais imposé.
#[tauri::command]
pub fn autostart_etat(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn autostart_regler(app: tauri::AppHandle, actif: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if actif { al.enable() } else { al.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn etat_compagnon(p: State<Arc<Partage>>) -> Etat {
    Etat {
        version: env!("CARGO_PKG_VERSION").into(),
        associe: p.associe(),
        nom: p.nom.clone(),
        pair: p.assoc.lock().unwrap().as_ref().map(|a| a.nom.clone()),
    }
}

/// La garde avant UN envoi : journal rejoué + toutes les règles.
/// `journal` : les envois faits `(sid, date)` ; `jour_semaine` ISO
/// (1 = lundi) et `heure` locale sont fournis par l'appelant.
#[tauri::command]
pub fn garde_autoriser(
    sid: String,
    cp_id: String,
    date: String,
    jour_semaine: u8,
    heure: u8,
    journal: Vec<(String, String)>,
) -> Result<(), String> {
    oc_coeur::Garde::depuis(journal)
        .autoriser(&sid, &cp_id, &date, jour_semaine, heure)
        .map_err(|e| format!("{e:?}"))
}

/// Vérifie un fil de mission `{ m, sig }` contre la clé publique de
/// l'appareil émetteur (apprise à l'association) — rend la mission
/// parsée si tout tient, sinon le refus.
#[tauri::command]
pub fn verifier_mission_signee(
    m: String,
    sig_b64: String,
    pub_b64url: String,
    present_ms: i64,
) -> Result<serde_json::Value, String> {
    oc_coeur::verifier_mission(&m, &sig_b64, &pub_b64url, present_ms)
        .map(|ms| {
            serde_json::json!({
                "mid": ms.mid, "kind": ms.kind, "params": ms.params,
                "createdAt": ms.cree_a, "expiresAt": ms.expire_a
            })
        })
        .map_err(|e| format!("{e:?}"))
}
