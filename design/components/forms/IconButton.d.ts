/**
 * Bouton carré à icône pixel-art seule.
 */
export interface IconButtonProps {
  /** Nom d'icône (fichier dans assets/icons/, sans .svg) */
  icon: string;
  /** Chemin vers assets/icons/ si la page n'est pas à la racine */
  iconBase?: string;
  variant?: 'default' | 'ghost';
  size?: 'sm' | 'md';
  /** Obligatoire : libellé accessible */
  'aria-label': string;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}
