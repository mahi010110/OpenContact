/**
 * Onglets « dossier » : l'actif fusionne avec le panneau, les inactifs sont tramés.
 */
export interface TabsProps {
  /** Libellés des onglets */
  tabs: string[];
  /** Index actif (contrôlé) */
  active?: number;
  onChange?: (index: number) => void;
  /** Un enfant par onglet */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
