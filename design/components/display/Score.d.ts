/**
 * Indice de complétude d'une fiche : pastille mono 0–100.
 */
export interface ScoreProps {
  /** Valeur 0–100 (bornée automatiquement) */
  value?: number;
  /** Si fourni, la pastille devient un bouton (explication au tap) */
  onClick?: () => void;
  style?: React.CSSProperties;
}
