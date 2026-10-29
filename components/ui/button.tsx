import type { ButtonHTMLAttributes } from "react";
export function Button({ variant = "default", size = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) { return <button {...props} className={`ui-button ui-button-${variant} ui-button-${size} ${className}`} />; }
