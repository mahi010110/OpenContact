/**
 * Navigation basse mobile (onglets + bouton d'ajout central carré).
 */
export interface BottomNavItem {
  /** Nom d'icône dans assets/icons/ (sans .svg) */
  icon: string;
  label: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Onglet courant : fond marine, texte blanc */
  active?: boolean;
}
export interface BottomNavProps {
  items?: BottomNavItem[];
  /** Rend le bouton d'ajout central (carré biseauté accent) */
  onAdd?: () => void;
  addLabel?: string;
  addIcon?: string;
  /** Chemin relatif vers assets/icons/ depuis la page hôte */
  iconBase?: string;
  style?: React.CSSProperties;
}
