/**
 * Icône pixel-art (pixelarticons) teintée par currentColor via mask CSS.
 */
export interface IconProps {
  /** Nom du fichier dans assets/icons/, sans extension (ex : "search") */
  name: string;
  /** Taille en px — multiples de 8 recommandés (16, 24, 32) */
  size?: number;
  /** Chemin relatif vers assets/icons/ depuis la page hôte */
  base?: string;
  style?: React.CSSProperties;
}
