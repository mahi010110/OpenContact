/**
 * Badge pixel (Silkscreen 8px) — étiquettes système : partagé, privé, statut.
 */
export interface BadgeProps {
  tone?: 'neutral' | 'shared' | 'private' | 'accent' | 'info' | 'warn' | 'danger';
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
