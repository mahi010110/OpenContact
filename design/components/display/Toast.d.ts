/**
 * Message système mono avec LED carrée de statut.
 */
export interface ToastProps {
  tone?: 'info' | 'ok' | 'warn' | 'error';
  /** Icône pixel optionnelle */
  icon?: string;
  iconBase?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
