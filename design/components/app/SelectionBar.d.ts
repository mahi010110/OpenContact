/**
 * Barre de sélection multiple (partage ciblé, suppression groupée, prospection).
 */
export interface SelectionBarProps {
  /** Nombre d'éléments sélectionnés */
  count?: number;
  /** Libellé complet (sinon « N sélectionnée(s) ») */
  countLabel?: string;
  /** Outils de la première ligne : Tout / Aucune / fermer */
  tools?: React.ReactNode;
  /** Actions groupées (boutons pleine largeur en dessous) */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}
