/**
 * Fenêtre : le conteneur signature (barre de titre pixel, ombre dure).
 * @startingPoint section="Composants" subtitle="Fenêtre à barre de titre — le conteneur signature" viewport="420x260"
 */
export interface WindowProps {
  /** Titre de la barre (Silkscreen, capitales). Omis = simple panneau. */
  title?: string;
  /** Icône pixel à gauche du titre */
  icon?: string;
  iconBase?: string;
  /** default = encre · accent = marine · inactive = gris tramé */
  variant?: 'default' | 'accent' | 'inactive';
  /** Affiche le bouton fermer */
  onClose?: () => void;
  /** Nœuds additionnels à droite de la barre */
  actions?: React.ReactNode;
  /** Contenu de la barre d'état basse (mono) */
  statusBar?: React.ReactNode;
  /** Corps sans padding */
  flush?: boolean;
  /** Ombre courte (cartes en liste) */
  flat?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
