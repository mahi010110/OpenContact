/**
 * Enveloppe de champ : étiquette petites capitales + aide/erreur.
 */
export interface FieldProps {
  label?: string;
  /** Texte d'aide sous le champ */
  hint?: string;
  /** Message d'erreur (remplace hint, en rouge) */
  error?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
