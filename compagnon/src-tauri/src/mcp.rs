//! P8-2 — le serveur MCP local (spec §11) : strictement local, coupé
//! par défaut, autorisé et révocable depuis OpenContact.
//!
//! Transport **stdio uniquement** : c'est le client IA compatible qui
//! lance `oc-compagnon --mcp` — aucun port, aucune origine, aucun
//! relais, aucun compte, aucune télémétrie. Deux outils, pas un de
//! plus : une lecture bornée (résumé de pistes en liste blanche,
//! re-filtré par `oc_coeur::mcp`) et un dépôt de proposition. Aucune
//! suppression, aucune écriture directe : une proposition devient une
//! enveloppe `share` scellée en attente, que la PWA fait repasser par
//! son aperçu multi-sélection — l'utilisateur coche, fusionne ou
//! écarte. Le drapeau `mcp-actif` est relu à CHAQUE appel : couper
//! l'assistant dans OpenContact prend effet immédiatement.
//! Journal local sobre (`mcp-journal.log`) : jamais un contenu de
//! piste, une note, un secret ni un corps d'e-mail.

use oc_coeur::mcp::{filtrer_resume, valider_proposition, RESUME_LIMITE_DEFAUT, RESUME_LIMITE_MAX};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ServerHandler, ServiceExt,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const ACTIF: &str = "mcp-actif";
const RESUME: &str = "mcp-resume";
const VUS: &str = "mcp-vus";
const PROP_PREFIXE: &str = "mcp-prop-";
const JOURNAL: &str = "mcp-journal.log";
const CLE_MCP: &str = "mcp.k";
const VUS_MAX: usize = 200;
const PROPS_SERVIES: usize = 5;
const RESUME_TAILLE_MAX: usize = 512 * 1024;

/* ---------- l'état partagé entre la coquille (canal → PWA) et le
   processus `--mcp` (lancé par le client IA) : des fichiers scellés
   du dossier de données. Deux processus INDÉPENDANTS doivent ouvrir
   les mêmes enveloppes ; or les trousseaux de session (keyutils) ne
   sont pas garantis partagés entre un binaire de bureau et un
   processus lancé par un client tiers. La clé de ces fichiers vit
   donc en fichier 0600 — le repli déjà documenté du projet — et ne
   protège QUE cet échange : résumé en liste blanche et propositions
   (pas un secret du trousseau, pas une donnée du coffre). ---------- */

struct CoffreMcp {
    cle: [u8; 32],
    dossier: PathBuf,
}

impl CoffreMcp {
    fn ouvrir(dossier: &Path) -> Self {
        let chemin = dossier.join(CLE_MCP);
        let cle: [u8; 32] = std::fs::read(&chemin)
            .ok()
            .and_then(|v| v.try_into().ok())
            .unwrap_or_else(|| {
                let mut k = [0u8; 32];
                rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut k);
                let _ = std::fs::write(&chemin, k);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o600));
                }
                k
            });
        CoffreMcp { cle, dossier: dossier.to_path_buf() }
    }
    fn chemin(&self, nom: &str) -> PathBuf {
        self.dossier.join(format!("{nom}.ocv"))
    }
    fn lire(&self, nom: &str) -> Option<String> {
        let env = std::fs::read_to_string(self.chemin(nom)).ok()?;
        oc_coeur::ouvrir(&self.cle, nom, env.trim()).ok()
    }
    fn ecrire(&self, nom: &str, clair: &str) {
        let mut iv = [0u8; 12];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut iv);
        let _ = std::fs::write(self.chemin(nom), oc_coeur::sceller(&self.cle, nom, clair, &iv));
    }
    fn effacer(&self, nom: &str) {
        let _ = std::fs::remove_file(self.chemin(nom));
    }
    fn lister(&self, prefixe: &str) -> Vec<String> {
        let Ok(entrees) = std::fs::read_dir(&self.dossier) else { return vec![] };
        let mut noms: Vec<String> = entrees
            .flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter_map(|f| f.strip_suffix(".ocv").map(str::to_string))
            .filter(|n| n.starts_with(prefixe))
            .collect();
        noms.sort();
        noms
    }
}

pub fn actif(dossier: &Path) -> bool {
    std::fs::read_to_string(dossier.join(ACTIF))
        .map(|s| s.trim() == "1")
        .unwrap_or(false)
}

/// Autoriser ou couper l'assistant — décidé dans OpenContact (PWA).
/// Couper efface aussi le résumé : rien à lire pour un assistant révoqué.
pub fn regler(dossier: &Path, on: bool) {
    if on {
        let _ = std::fs::write(dossier.join(ACTIF), "1");
    } else {
        let _ = std::fs::remove_file(dossier.join(ACTIF));
        CoffreMcp::ouvrir(dossier).effacer(RESUME);
    }
    journal(dossier, if on { "assistant autorise depuis OpenContact" } else { "assistant coupe depuis OpenContact" });
}

/// Le résumé en liste blanche poussé par la PWA (engine/mcp.js) —
/// borné à l'entrée, re-filtré à chaque lecture par le cœur.
pub fn ranger_resume(dossier: &Path, v: &Value) -> Result<(), String> {
    let s = serde_json::to_string(v).map_err(|_| "format".to_string())?;
    if s.len() > RESUME_TAILLE_MAX {
        return Err("troplourd".into());
    }
    CoffreMcp::ouvrir(dossier).ecrire(
        RESUME,
        &json!({ "at": chrono::Local::now().timestamp_millis(), "resume": v }).to_string(),
    );
    Ok(())
}

/// Les propositions en attente, les plus anciennes d'abord.
pub fn lister_propositions(dossier: &Path) -> Vec<Value> {
    let coffre = CoffreMcp::ouvrir(dossier);
    let mut out: Vec<Value> = coffre
        .lister(PROP_PREFIXE)
        .iter()
        .filter_map(|nom| coffre.lire(nom))
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect();
    out.sort_by_key(|v| v.get("at").and_then(|a| a.as_i64()).unwrap_or(0));
    out.truncate(PROPS_SERVIES);
    out
}

fn pid_valide(pid: &str) -> bool {
    pid.len() == 16 && pid.bytes().all(|b| b.is_ascii_hexdigit())
}

/// La PWA a fusionné ou écarté une proposition : elle disparaît d'ici.
/// Idempotent — la re-signaler ne fait rien de plus.
pub fn regler_proposition(dossier: &Path, pid: &str, action: &str) -> bool {
    if !pid_valide(pid) {
        return false;
    }
    let coffre = CoffreMcp::ouvrir(dossier);
    let nom = format!("{PROP_PREFIXE}{pid}");
    if coffre.lire(&nom).is_none() {
        return true;
    }
    coffre.effacer(&nom);
    journal(dossier, &format!("proposition {pid} {}", if action == "abandon" { "ecartee" } else { "fusionnee" }));
    true
}

/// Association rompue : plus d'assistant, plus de résumé, plus de
/// propositions en attente, ni de mémoire de rejeu, ni de clé.
pub fn purger(dossier: &Path) {
    let _ = std::fs::remove_file(dossier.join(ACTIF));
    let coffre = CoffreMcp::ouvrir(dossier);
    coffre.effacer(RESUME);
    coffre.effacer(VUS);
    for nom in coffre.lister(PROP_PREFIXE) {
        coffre.effacer(&nom);
    }
    let _ = std::fs::remove_file(dossier.join(CLE_MCP));
}

/// Journal local des actions MCP : horodatage + geste + comptes.
/// JAMAIS un contenu (piste, note, secret, e-mail).
pub fn journal(dossier: &Path, ligne: &str) {
    let chemin = dossier.join(JOURNAL);
    if let Ok(meta) = std::fs::metadata(&chemin) {
        if meta.len() > 128 * 1024 {
            if let Ok(tout) = std::fs::read_to_string(&chemin) {
                let garde: String = tout.chars().skip(tout.chars().count().saturating_sub(64 * 1024)).collect();
                let _ = std::fs::write(&chemin, garde);
            }
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&chemin) {
        let _ = writeln!(f, "{} {}", chrono::Local::now().format("%Y-%m-%dT%H:%M:%S"), ligne);
    }
}

fn vus_lire(coffre: &CoffreMcp) -> Vec<String> {
    coffre
        .lire(VUS)
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
fn vus_ajouter(coffre: &CoffreMcp, pid: &str) {
    let mut vus = vus_lire(coffre);
    vus.retain(|p| p != pid);
    vus.push(pid.to_string());
    if vus.len() > VUS_MAX {
        vus.drain(..vus.len() - VUS_MAX);
    }
    if let Ok(s) = serde_json::to_string(&vus) {
        coffre.ecrire(VUS, &s);
    }
}

/* ---------- le serveur ---------- */

/// Entrée de l'outil de lecture : fermée, une seule borne.
#[derive(Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LectureParams {
    /// Nombre maximal de pistes retournées (1 à 50, 20 par défaut).
    pub limite: Option<u32>,
}

/// Un contact proposé — champs du contrat `share`, rien d'autre.
#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ContactPropose {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Une piste proposée — schéma fermé : ni statut, ni note privée, ni
/// confiance, ni identifiant. Toute clé inconnue est un refus.
#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PistePropose {
    /// Nom de l'entreprise (obligatoire).
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    /// Domaine : esn, cyber, cloud, dsi, public, startup, industrie, commerce, sante ou autre.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub techs: Option<String>,
    /// Postes visés : stage, alternance, cdi, cdd, freelance.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub positions: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tips: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contacts: Option<Vec<ContactPropose>>,
}

/// Entrée de l'outil de proposition : des pistes, rien d'autre.
#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PropositionParams {
    /// Les pistes proposées (1 à 30).
    pub pistes: Vec<PistePropose>,
}

struct EtatMcp {
    dossier: PathBuf,
    coffre: CoffreMcp,
}

pub struct Serveur {
    etat: Arc<EtatMcp>,
    tool_router: ToolRouter<Self>,
}

fn refus(msg: &str) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(msg.to_string())])
}

#[tool_router]
impl Serveur {
    fn new(etat: Arc<EtatMcp>) -> Self {
        Self { etat, tool_router: Self::tool_router() }
    }

    /// coupé = refus immédiat, à CHAQUE appel — la révocation depuis
    /// OpenContact n'attend pas un redémarrage du serveur.
    fn coupe(&self) -> Option<CallToolResult> {
        if actif(&self.etat.dossier) {
            None
        } else {
            journal(&self.etat.dossier, "appel refuse (assistant coupe)");
            Some(refus("L'assistant est coupé dans OpenContact. L'utilisateur peut l'autoriser depuis Moi → Mes appareils → son ordinateur."))
        }
    }

    #[tool(
        name = "resume_pistes",
        description = "Lit un résumé borné des pistes OpenContact de l'utilisateur : nom, ville, domaine, postes visés, dernière activité, et trois compteurs de suivi agrégés. Lecture seule — aucun détail privé (notes, contacts, historique) n'est accessible."
    )]
    async fn resume_pistes(
        &self,
        Parameters(p): Parameters<LectureParams>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        if let Some(r) = self.coupe() {
            return Ok(r);
        }
        let limite = p
            .limite
            .map(|l| l as usize)
            .unwrap_or(RESUME_LIMITE_DEFAUT)
            .clamp(1, RESUME_LIMITE_MAX);
        let Some(stocke) = self
            .etat
            .coffre
            .lire(RESUME)
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        else {
            return Ok(refus("Aucun résumé disponible : OpenContact doit être ouvert au moins une fois avec l'assistant autorisé."));
        };
        let r = filtrer_resume(&stocke["resume"], limite);
        journal(
            &self.etat.dossier,
            &format!("lecture resume_pistes n={}", r["montrees"].as_u64().unwrap_or(0)),
        );
        Ok(CallToolResult::structured(r))
    }

    #[tool(
        name = "proposer_pistes",
        description = "Dépose une proposition de pistes (1 à 30) pour l'utilisateur OpenContact. Rien n'est écrit directement : la proposition attend dans OpenContact, où l'utilisateur la trie, la fusionne ou l'écarte. Rejouer une proposition identique ne crée rien de plus."
    )]
    async fn proposer_pistes(
        &self,
        Parameters(p): Parameters<PropositionParams>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        if let Some(r) = self.coupe() {
            return Ok(r);
        }
        let v = serde_json::to_value(&p)
            .map_err(|_| rmcp::ErrorData::invalid_params("format", None))?;
        let prop = match valider_proposition(&v) {
            Ok(prop) => prop,
            Err(e) => {
                journal(&self.etat.dossier, "proposition refusee (bornes ou schema)");
                return Ok(refus(&format!("Proposition refusée : {e}.")));
            }
        };
        let nom = format!("{PROP_PREFIXE}{}", prop.pid);
        if self.etat.coffre.lire(&nom).is_some() {
            return Ok(CallToolResult::structured(json!({
                "pid": prop.pid, "etat": "deja_en_attente",
                "note": "Cette proposition attend déjà d'être triée dans OpenContact."
            })));
        }
        if vus_lire(&self.etat.coffre).iter().any(|x| x == &prop.pid) {
            return Ok(refus("Cette proposition a déjà été traitée dans OpenContact — rien à redéposer."));
        }
        self.etat.coffre.ecrire(
            &nom,
            &json!({
                "pid": prop.pid,
                "at": chrono::Local::now().timestamp_millis(),
                "n": prop.n,
                "share": prop.share.to_string()
            })
            .to_string(),
        );
        vus_ajouter(&self.etat.coffre, &prop.pid);
        journal(&self.etat.dossier, &format!("proposition {} recue n={}", prop.pid, prop.n));
        Ok(CallToolResult::structured(json!({
            "pid": prop.pid, "etat": "deposee", "pistes": prop.n,
            "note": "En attente dans OpenContact — rien ne fusionne sans validation de l'utilisateur."
        })))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for Serveur {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Serveur local OpenContact Compagnon. Deux outils : resume_pistes (lecture bornée, \
             liste blanche) et proposer_pistes (dépôt d'une proposition). Aucune écriture directe, \
             aucune suppression : chaque proposition repasse par l'aperçu d'OpenContact où \
             l'utilisateur décide. L'assistant peut être coupé à tout moment depuis OpenContact.",
        )
    }
}

/// Le mode `--mcp` du binaire : stdout est réservé au protocole, tout
/// le reste passe par stderr et le journal local.
pub fn lancer() -> ! {
    let dossier = dirs::data_dir()
        .expect("dossier de données")
        .join("app.opencontact.compagnon");
    std::fs::create_dir_all(&dossier).ok();
    /* pas de trousseau ici : ce processus est lancé par le client IA,
       il ne touche ni aux secrets ni au coffre du Compagnon */
    let coffre = CoffreMcp::ouvrir(&dossier);
    journal(&dossier, "mcp demarre (stdio)");
    let etat = Arc::new(EtatMcp { dossier: dossier.clone(), coffre });
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio");
    let code = rt.block_on(async move {
        match Serveur::new(etat).serve(rmcp::transport::stdio()).await {
            Ok(service) => {
                let _ = service.waiting().await;
                0
            }
            Err(e) => {
                eprintln!("compagnon : mcp — {e}");
                1
            }
        }
    });
    journal(&dossier, "mcp arrete");
    std::process::exit(code)
}
