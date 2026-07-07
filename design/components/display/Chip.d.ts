/**
 * Chip de donnée en mono : technos, villes, tags.
 */
export interface ChipProps {
  children?: React.ReactNode;
  /** Point carré coloré à gauche */
  dot?: boolean;
  /** Couleur CSS du point (défaut : teal) */
  dotColor?: string;
  /** Affiche un ✕ de retrait */
  onRemove?: () => void;
  style?: React.CSSProperties;
}
