//! Le canal local : un petit serveur HTTP sur 127.0.0.1 que la PWA
//! du même ordinateur découvre et interroge. Rien d'utile n'y circule
//! en clair : l'appairage est chiffré sous la clé dérivée du code
//! court, la suite sous la clé de canal née de l'appairage. Un
//! processus local qui parle sans le code n'obtient rien.

use crate::partage::{b64, Association, Partage};
use oc_coeur::{ouvrir, sceller};
use rand::RngCore;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tiny_http::{Header, Method, Response, Server};

pub const PORTS: [u16; 3] = [17095, 17096, 17097];
const APPAIRAGE_TTL: Duration = Duration::from_secs(120);
const APPAIRAGE_ESSAIS: u32 = 5;

fn en_tetes(r: Response<std::io::Cursor<Vec<u8>>>) -> Response<std::io::Cursor<Vec<u8>>> {
    /* la PWA peut venir de n'importe quelle origine : la sécurité est
       dans le chiffre, pas dans l'origine. PNA : Chrome exige l'accord
       explicite pour joindre le réseau local depuis le web. */
    let h = |k: &str, v: &str| Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap();
    r.with_header(h("Access-Control-Allow-Origin", "*"))
        .with_header(h("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
        .with_header(h("Access-Control-Allow-Headers", "content-type"))
        .with_header(h("Access-Control-Allow-Private-Network", "true"))
        .with_header(h("Cache-Control", "no-store"))
        .with_header(h("Content-Type", "application/json"))
}

fn json(code: u16, v: serde_json::Value) -> Response<std::io::Cursor<Vec<u8>>> {
    en_tetes(Response::from_data(v.to_string().into_bytes()).with_status_code(code))
}

fn iv12() -> [u8; 12] {
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    iv
}

pub fn demarrer(p: Arc<Partage>, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        for port in PORTS {
            match Server::http(("127.0.0.1", port)) {
                Ok(srv) => {
                    p.port.store(port, Ordering::Relaxed);
                    println!("compagnon : canal local prêt ({port})");
                    boucle(srv, p, app);
                    return;
                }
                Err(_) => continue,
            }
        }
        eprintln!("compagnon : canal local indisponible (ports occupés)");
    });
}

fn boucle(srv: Server, p: Arc<Partage>, app: tauri::AppHandle) {
    for mut req in srv.incoming_requests() {
        let mut corps = String::new();
        let _ = req.as_reader().read_to_string(&mut corps);
        let rep = repondre(&p, &app, req.method(), req.url(), &corps);
        let _ = req.respond(rep);
    }
}

fn repondre(
    p: &Arc<Partage>,
    app: &tauri::AppHandle,
    methode: &Method,
    url: &str,
    corps: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    if *methode == Method::Options {
        return json(204, serde_json::json!({}));
    }

    match (methode, url) {
        (Method::Get, "/oc-compagnon") => {
            /* la découverte : qui je suis, et le sel si un appairage
               attend un code — jamais un secret */
            let ap = p.appairage.lock().unwrap();
            let actif = ap
                .as_ref()
                .filter(|a| a.depuis.elapsed() < APPAIRAGE_TTL && a.essais < APPAIRAGE_ESSAIS);
            json(
                200,
                serde_json::json!({
                    "v": 1, "nom": p.nom, "associe": p.associe(),
                    "appairage": actif.map(|a| serde_json::json!({ "s": b64(&a.sel) }))
                }),
            )
        }

        (Method::Post, "/appairage") => {
            let d = match serde_json::from_str::<serde_json::Value>(corps) {
                Ok(v) => v["d"].as_str().unwrap_or("").to_string(),
                Err(_) => return json(400, serde_json::json!({ "e": "format" })),
            };
            let mut ap = p.appairage.lock().unwrap();
            let Some(a) = ap.as_mut() else {
                return json(403, serde_json::json!({ "e": "ferme" }));
            };
            if a.depuis.elapsed() >= APPAIRAGE_TTL || a.essais >= APPAIRAGE_ESSAIS {
                *ap = None;
                return json(403, serde_json::json!({ "e": "ferme" }));
            }
            let clair = match ouvrir(&a.kc, "canal-appairage", &d) {
                Ok(c) => c,
                Err(_) => {
                    a.essais += 1;
                    return json(403, serde_json::json!({ "e": "code" }));
                }
            };
            let msg: serde_json::Value = match serde_json::from_str(&clair) {
                Ok(v) => v,
                Err(_) => return json(400, serde_json::json!({ "e": "format" })),
            };
            /* le code a prouvé l'utilisateur : on apprend l'appareil et
               l'anneau (TOFU), on scelle une clé de canal durable */
            let mut k = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut k);
            let reponse = serde_json::json!({
                "compagnon": { "id": p.id, "name": p.nom, "pub": p.pub_b64url, "role": "companion" },
                "k": b64(&k)
            });
            let kc = a.kc;
            drop(ap);
            p.sceller_canal(
                k,
                Association {
                    appareil: msg["device"].clone(),
                    ring: msg["ring"].clone(),
                    nom: msg["device"]["name"].as_str().unwrap_or("Appareil").into(),
                },
            );
            use tauri::Emitter;
            let _ = app.emit("oc://associe", ());
            json(
                200,
                serde_json::json!({ "d": sceller(&kc, "canal-appairage", &reponse.to_string(), &iv12()) }),
            )
        }

        (Method::Post, "/boite") => {
            let Some(k) = *p.canal_k.lock().unwrap() else {
                return json(403, serde_json::json!({ "e": "associe" }));
            };
            let d = match serde_json::from_str::<serde_json::Value>(corps) {
                Ok(v) => v["d"].as_str().unwrap_or("").to_string(),
                Err(_) => return json(400, serde_json::json!({ "e": "format" })),
            };
            let clair = match ouvrir(&k, "canal", &d) {
                Ok(c) => c,
                Err(_) => return json(403, serde_json::json!({ "e": "canal" })),
            };
            let msg: serde_json::Value = serde_json::from_str(&clair).unwrap_or_default();
            let rep = match msg["t"].as_str() {
                Some("ping") => serde_json::json!({ "t": "pong", "nom": p.nom, "associe": true }),
                Some("dissocier") => {
                    /* la PWA rompt : le Compagnon oublie tout du pair */
                    p.dissocier();
                    use tauri::Emitter;
                    let _ = app.emit("oc://associe", ());
                    serde_json::json!({ "t": "ok" })
                }
                _ => serde_json::json!({ "t": "?" }),
            };
            json(200, serde_json::json!({ "d": sceller(&k, "canal", &rep.to_string(), &iv12()) }))
        }

        _ => json(404, serde_json::json!({ "e": "chemin" })),
    }
}
