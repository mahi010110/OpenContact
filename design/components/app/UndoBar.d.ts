/**
 * Filet de sécurité : « Fusion terminée : 4 ajouts. » + bouton Annuler.
 */
export interface UndoBarProps {
  /** Message système factuel, en mono */
  message?: React.ReactNode;
  /** Libellé de l'action (défaut : « Annuler ») */
  actionLabel?: string;
  /** Restauration de l'état d'avant */
  onAction?: () => void;
  /** Fermer sans annuler (optionnel) */
  onDismiss?: () => void;
  /** Chemin relatif vers assets/icons/ depuis la page hôte */
  iconBase?: string;
  style?: React.CSSProperties;
}
