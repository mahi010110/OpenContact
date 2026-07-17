// OpenContact Compagnon — la coquille (D17) : vie du processus,
// zone de notification, fenêtre de réglages ; les capacités natives
// s'exposent au cerveau JS par commandes, la garde `oc-coeur`
// re-vérifie chaque action sensible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

mod commandes;

fn montrer(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("principal") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            montrer(app); // une seconde instance ramène la fenêtre
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            commandes::etat_compagnon,
            commandes::garde_autoriser,
            commandes::verifier_mission_signee,
            commandes::autostart_etat,
            commandes::autostart_regler
        ])
        .setup(|app| {
            // un bureau sans zone de notification ne doit pas empêcher
            // le Compagnon de vivre : la fenêtre reste le poste de repli
            let tray = (|| -> tauri::Result<()> {
                let ouvrir = MenuItem::with_id(app, "ouvrir", "Ouvrir", true, None::<&str>)?;
                let quitter = MenuItem::with_id(app, "quitter", "Quitter", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&ouvrir, &quitter])?;
                TrayIconBuilder::with_id("principal")
                    .icon(app.default_window_icon().expect("icône").clone())
                    .tooltip("OpenContact Compagnon")
                    .menu(&menu)
                    .on_menu_event(|app, e| match e.id.as_ref() {
                        "ouvrir" => montrer(app),
                        "quitter" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
                Ok(())
            })();
            if let Err(e) = tray {
                eprintln!("compagnon : zone de notification indisponible ({e})");
            }
            println!("compagnon : prêt");
            Ok(())
        })
        .on_window_event(|w, e| {
            // fermer la fenêtre = continuer en arrière-plan, pas quitter
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                let _ = w.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("démarrage du Compagnon");
}
