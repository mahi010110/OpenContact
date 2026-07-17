//! Les commandes offertes au cerveau JS. Principe D17 : le cerveau
//! propose, la garde Rust re-vérifie — une action refusée ici ne part
//! pas, quoi qu'ait décidé le JS.

use serde::Serialize;
use tauri_plugin_autostart::ManagerExt;

#[derive(Serialize)]
pub struct Etat {
    pub version: String,
    pub associe: bool,
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
pub fn etat_compagnon() -> Etat {
    Etat {
        version: env!("CARGO_PKG_VERSION").into(),
        associe: false, // l'association arrive avec l'appairage (C3)
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
