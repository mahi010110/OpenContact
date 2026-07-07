/**
 * Champ de saisie en creux (fond clair, bordure encre, biseau inversé).
 */
export interface InputProps {
  /** Rend un textarea redimensionnable */
  multiline?: boolean;
  /** Police mono (valeurs, codes, URLs) */
  mono?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (e: any) => void;
  disabled?: boolean;
  type?: string;
  style?: React.CSSProperties;
}
