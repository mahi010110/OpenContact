/**
 * État vide : fenêtre centrée avec promesse, principes et actions.
 */
export interface EmptyStatePrinciple {
  /** Nom d'icône dans assets/icons/ (sans .svg) */
  icon: string;
  /** Verbe court : « Trouve », « Contribue », « Partage » */
  label: string;
}
export interface EmptyStateProps {
  /** Titre de la barre de fenêtre (défaut : OpenContact) */
  title?: string;
  /** Accroche en gras */
  heading?: string;
  /** Phrase d'explication */
  description?: string;
  principles?: EmptyStatePrinciple[];
  /** Boutons empilés, le primaire en premier */
  actions?: React.ReactNode;
  /** Chemin relatif vers assets/icons/ depuis la page hôte */
  iconBase?: string;
  style?: React.CSSProperties;
}
