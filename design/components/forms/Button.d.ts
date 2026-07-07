/**
 * Bouton système OpenContact — relief biseauté, presse physique.
 * @startingPoint section="Composants" subtitle="Bouton biseauté rétro-moderne" viewport="360x120"
 */
export interface ButtonProps {
  /** Style du bouton */
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  /** Taille (hauteur 24 / 32 / 40px) */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
