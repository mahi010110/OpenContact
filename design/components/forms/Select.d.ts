/**
 * Liste déroulante système avec chevron pixel.
 */
export interface SelectProps {
  /** [{value,label}] ou ["a","b"] */
  options?: Array<{ value: string; label: string } | string>;
  value?: string;
  onChange?: (e: any) => void;
  disabled?: boolean;
  'aria-label'?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
