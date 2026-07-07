/**
 * Panneau mobile glissant depuis le bas (tiroir de résultats, options).
 */
export interface SheetProps {
  /** Panneau visible */
  open?: boolean;
  /** Tap sur la poignée (fermeture) */
  onClose?: () => void;
  /** Titre de la poignée (Silkscreen capitales) */
  title?: string;
  /** Compteur mono affiché à droite du titre (ex : « 6 ») */
  count?: React.ReactNode;
  /** Hauteur : half (60 dvh, défaut) ou full (écran moins 56px) */
  snap?: 'half' | 'full';
  /** Corps sans padding (listes bord à bord) */
  flush?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
