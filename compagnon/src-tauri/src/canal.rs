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
            /* la découverte est ANONYME : elle répond à toute origine web
               (CORS `*` + Private-Network), donc elle ne révèle que le
               strict nécessaire à l'appairage — jamais le nom de la machine
               (donnée personnelle) ni l'état d'association (empreinte).
               Le vrai nom voyage plus tard, sur le canal authentifié
               (réponse d'appairage, `ping`). Le sel n'est exposé que si un
               appairage attend un code, et il ne suffit pas sans le code. */
            let ap = p.appairage.lock().unwrap();
            let actif = ap
                .as_ref()
                .filter(|a| a.depuis.elapsed() < APPAIRAGE_TTL && a.essais < APPAIRAGE_ESSAIS);
            json(
                200,
                serde_json::json!({
                    "v": 1,
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
            let rep = repondre_boite(p, app, &msg);
            json(200, serde_json::json!({ "d": sceller(&k, "canal", &rep.to_string(), &iv12()) }))
        }

        _ => json(404, serde_json::json!({ "e": "chemin" })),
    }
}

/* ---------- la conversation associée : missions, rapport, arrêts ---------- */
fn repondre_boite(
    p: &Arc<Partage>,
    app: &tauri::AppHandle,
    msg: &serde_json::Value,
) -> serde_json::Value {
    use crate::missions::{EtatMissions, MissionRecue};
    match msg["t"].as_str() {
        Some("ping") => {
            let (r, _) = p.reglage_mail();
            serde_json::json!({ "t": "pong", "nom": p.nom, "associe": true,
                "messagerie": !r.hote.is_empty() || std::env::var("OC_SMTP_TEST").is_ok(),
                "mcp": crate::mcp::actif(p.dossier()) })
        }
        Some("dissocier") => {
            p.dissocier();
            use tauri::Emitter;
            let _ = app.emit("oc://associe", ());
            serde_json::json!({ "t": "ok" })
        }
        /* L'anneau évolue après l'appairage (le Compagnon lui-même,
           puis de nouveaux téléphones). Le cœur n'accepte qu'une
           version signée et strictement plus récente. */
        Some("anneau") => match p.actualiser_anneau(&msg["ring"]) {
            Ok(change) => serde_json::json!({ "t": "ok", "change": change }),
            Err(e) => serde_json::json!({ "e": e }),
        },
        /* une mission signée est confiée — vérifiée AVANT d'être rangée,
           et re-vérifiée à chaque lecture par le planificateur */
        Some("mission") => {
            let w = &msg["wire"];
            let (m, sig, dev) = (
                w["m"].as_str().unwrap_or(""),
                w["sig"].as_str().unwrap_or(""),
                w["dev"].as_str().unwrap_or(""),
            );
            let assoc = p.assoc.lock().unwrap();
            let Some(a) = assoc.as_ref() else {
                return serde_json::json!({ "e": "associe" });
            };
            let Some(pub_dev) = a.cle_mission(dev) else {
                return serde_json::json!({ "e": "appareil" });
            };
            drop(assoc);
            let present = chrono::Local::now().timestamp_millis();
            let ms = match oc_coeur::verifier_mission(m, sig, &pub_dev, present) {
                Ok(ms) => ms,
                Err(e) => return serde_json::json!({ "e": format!("mission:{e:?}") }),
            };
            let mut em = EtatMissions::charger(&p.coffre);
            em.ranger(MissionRecue {
                mid: ms.mid.clone(),
                m: m.into(),
                sig: sig.into(),
                dev: dev.into(),
                recu: present,
                revoquee: false,
            });
            em.sauver(&p.coffre);
            println!("compagnon : mission reçue {}", ms.mid);
            if ms.kind == "mail-scan" {
                /* l'analyse démarre tout de suite, bornée et annulable */
                let jours = ms.params["jours"].as_i64().unwrap_or(7).clamp(1, 90);
                let prompt = ms.params["prompt"].as_str().unwrap_or("").to_string();
                crate::analyse::lancer(p.clone(), ms.mid.clone(), jours, prompt);
            } else {
                /* campagne : premier passage sans attendre le tick */
                let p2 = p.clone();
                std::thread::spawn(move || crate::planif::cycle(&p2));
            }
            serde_json::json!({ "t": "mission-ok", "mid": ms.mid })
        }
        Some("revoquer") => {
            let mid = msg["mid"].as_str().unwrap_or("");
            let mut em = EtatMissions::charger(&p.coffre);
            for mr in em.missions.iter_mut() {
                if mr.mid == mid {
                    mr.revoquee = true;
                }
            }
            em.sauver(&p.coffre);
            println!("compagnon : mission révoquée {mid}");
            serde_json::json!({ "t": "ok" })
        }
        /* réponse reçue côté PWA : la cible s'arrête, non débrayable */
        Some("arreter-cible") => {
            let cid = msg["cid"].as_str().unwrap_or("").to_string();
            if !cid.is_empty() {
                let mut em = EtatMissions::charger(&p.coffre);
                if !em.arrets.contains(&cid) {
                    em.arrets.push(cid);
                    em.sauver(&p.coffre);
                }
            }
            serde_json::json!({ "t": "ok" })
        }
        /* où en est une analyse — et son résultat quand elle a fini */
        Some("analyse-etat") => {
            let mid = msg["mid"].as_str().unwrap_or("");
            let mut v = crate::analyse::etat(p, mid);
            v["t"] = "analyse".into();
            v
        }
        /* le journal complet — la PWA replie (markSent idempotent) */
        Some("rapport") => {
            let em = EtatMissions::charger(&p.coffre);
            serde_json::json!({ "t": "rapport", "journal": em.journal,
                "arrets": em.arrets, "reponses": em.reponses })
        }
        /* ---- rédaction IA « via ton ordinateur » (D5) ---- */
        /* La demande part en tâche de fond : le canal reste vif (présence,
           missions) pendant que le fournisseur travaille. La clé vit le
           temps de l'appel, en mémoire — jamais écrite, jamais logguée.
           `op` : "texte" (défaut) ou "modeles" (la liste RÉELLE du
           runtime — c'est dedans que l'utilisateur choisit). */
        Some("ia-demarrer") => {
            let jid = msg["jid"].as_str().unwrap_or("").to_string();
            let op = msg["op"].as_str().unwrap_or("texte").to_string();
            let (fournisseur, cle, modele, prompt, systeme) = (
                msg["provider"].as_str().unwrap_or("").to_string(),
                msg["key"].as_str().unwrap_or("").to_string(),
                msg["model"].as_str().unwrap_or("").to_string(),
                msg["prompt"].as_str().unwrap_or("").to_string(),
                msg["system"].as_str().unwrap_or("").to_string(),
            );
            if !oc_coeur::ia::jid_valide(&jid) {
                return serde_json::json!({ "e": "jid" });
            }
            let recevable = match op.as_str() {
                "modeles" => oc_coeur::ia::valider_liste(&fournisseur, &cle),
                "texte" => oc_coeur::ia::valider_demande(&fournisseur, &prompt, &systeme, &cle, &modele),
                _ => Err("op"),
            };
            if let Err(e) = recevable {
                return serde_json::json!({ "e": e });
            }
            {
                let mut jobs = p.ia.lock().unwrap();
                if jobs.values().any(|v| v.contains("\"en cours\"")) {
                    return serde_json::json!({ "e": "occupe" });
                }
                jobs.clear(); /* les résultats jamais relus ne s'accumulent pas */
                jobs.insert(jid.clone(), r#"{"etat":"en cours"}"#.into());
            }
            let p2 = p.clone();
            std::thread::spawn(move || {
                let encore = {
                    let p3 = p2.clone();
                    let jid3 = jid.clone();
                    move || {
                        p3.ia
                            .lock()
                            .unwrap()
                            .get(&jid3)
                            .map(|v| v.contains("\"en cours\""))
                            .unwrap_or(false)
                    }
                };
                let annule = || !encore();
                let fini = if op == "modeles" {
                    match crate::ia::lister(&fournisseur, &cle) {
                        Ok(liste) => serde_json::json!({ "etat": "fini", "modeles": liste }),
                        Err(e) => serde_json::json!({ "etat": "erreur", "e": e }),
                    }
                } else {
                    match crate::ia::generer(&fournisseur, &cle, &modele, &prompt, &systeme, &annule) {
                        Ok(texte) => serde_json::json!({ "etat": "fini", "texte": texte }),
                        Err(e) => serde_json::json!({ "etat": "erreur", "e": e }),
                    }
                };
                println!(
                    "compagnon : ia {fournisseur} {op} — {}",
                    if fini["etat"] == "fini" { "ok" } else { "refus court" }
                );
                /* annulée entre-temps = résultat jeté, rien d'écrit */
                let mut jobs = p2.ia.lock().unwrap();
                if jobs.get(&jid).map(|v| v.contains("\"en cours\"")).unwrap_or(false) {
                    jobs.insert(jid, fini.to_string());
                }
            });
            serde_json::json!({ "t": "ok" })
        }
        Some("ia-etat") => {
            let jid = msg["jid"].as_str().unwrap_or("");
            let mut jobs = p.ia.lock().unwrap();
            match jobs.get(jid).cloned() {
                None => serde_json::json!({ "t": "ia", "etat": "inconnue" }),
                Some(s) => {
                    let mut v: serde_json::Value =
                        serde_json::from_str(&s).unwrap_or_else(|_| serde_json::json!({ "etat": "erreur", "e": "echec" }));
                    if v["etat"] != "en cours" {
                        jobs.remove(jid); /* consommé : le texte ne traîne pas */
                    }
                    v["t"] = "ia".into();
                    v
                }
            }
        }
        /* la PWA renonce (feuille fermée) : l'entrée disparaît, le
           travail en cours est tué (Codex) ou son résultat jeté */
        Some("ia-annuler") => {
            let jid = msg["jid"].as_str().unwrap_or("");
            p.ia.lock().unwrap().remove(jid);
            serde_json::json!({ "t": "ok" })
        }
        /* ---- l'assistant IA (P8-2) — géré depuis OpenContact ---- */
        Some("mcp-regler") => {
            let on = msg["actif"].as_bool().unwrap_or(false);
            crate::mcp::regler(p.dossier(), on);
            serde_json::json!({ "t": "ok", "actif": on })
        }
        /* le résumé en liste blanche que l'assistant a le droit de lire —
           refusé tant que l'assistant n'est pas autorisé */
        Some("resume") => {
            if !crate::mcp::actif(p.dossier()) {
                return serde_json::json!({ "e": "coupe" });
            }
            match crate::mcp::ranger_resume(p.dossier(), &msg["resume"]) {
                Ok(()) => serde_json::json!({ "t": "ok" }),
                Err(e) => serde_json::json!({ "e": e }),
            }
        }
        /* les propositions en attente de tri — la PWA les rapporte,
           l'utilisateur décide, puis les règle une à une */
        Some("propositions") => {
            serde_json::json!({ "t": "propositions",
                "actif": crate::mcp::actif(p.dossier()),
                "liste": crate::mcp::lister_propositions(p.dossier()) })
        }
        Some("proposition-reglee") => {
            let pid = msg["pid"].as_str().unwrap_or("");
            let action = msg["action"].as_str().unwrap_or("fusion");
            if crate::mcp::regler_proposition(p.dossier(), pid, action) {
                serde_json::json!({ "t": "ok" })
            } else {
                serde_json::json!({ "e": "pid" })
            }
        }
        _ => serde_json::json!({ "t": "?" }),
    }
}
