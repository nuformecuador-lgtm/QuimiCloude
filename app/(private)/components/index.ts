// Barrel de los componentes de la zona privada
// (`docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en cada archivo de componente,
// nunca aqui. Asi `layout.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { SidebarToggle, SIDEBAR_TOGGLE_LABEL } from './sidebar-toggle';
export {
  ThemeToggle,
  THEME_TOGGLE_LABEL,
  THEME_OPTION_LIGHT_LABEL,
  THEME_OPTION_DARK_LABEL,
  THEME_OPTION_SYSTEM_LABEL,
} from './theme-toggle';
