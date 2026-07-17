//! OpenContact Compagnon — le cœur : la garde des règles critiques.
//!
//! (D17) Le cerveau JS — les mêmes modules `engine/` que la PWA —
//! décide QUOI faire ; ce module re-vérifie chaque action AVANT
//! qu'elle parte, indépendamment du cerveau :
//! · la mission est signée (Ed25519), vivante, du bon genre ;
//! · l'envoi n'a jamais été fait (journal idempotent) ;
//! · le plafond global (15/jour, toutes campagnes) est respecté ;
//! · l'heure est dans la fenêtre d'envoi (lun–ven, 8 h – 19 h) ;
//! · l'envoi appartient bien à la campagne couverte par la mission.
//!
//! Fonctions pures : le temps, la date et le jour sont toujours des
//! paramètres — jamais lus ici. Les invariants miroirs vivent dans
//! `engine/campaign.js` et `engine/mission.js` ; le vecteur signé de
//! `tests.js` est vérifié à l'identique ici (test croisé JS → Rust).

pub mod enveloppe;
pub mod garde;
pub mod mission;
pub mod planifier;

pub use enveloppe::{cle_du_code, ouvrir, sceller, ITER_APPAIRAGE};
pub use garde::{dans_fenetre, Garde, Refus as RefusGarde, PLAFOND_JOUR};
pub use mission::{verifier_mission, Mission, Refus as RefusMission};
