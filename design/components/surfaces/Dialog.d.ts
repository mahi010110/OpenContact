/**
 * Modale sur voile tramé (dither), fenêtre à barre marine.
 */
export interface DialogProps {
  open?: boolean;
  title?: string;
  icon?: string;
  iconBase?: string;
  onClose?: () => void;
  /** Boutons du pied (zone chrome) */
  footer?: React.ReactNode;
  /** Largeur max en px */
  width?: number;
  children?: React.ReactNode;
}
