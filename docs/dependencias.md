# docs/dependencias.md — Registro de dependencias aprobadas

Toda entrada de `dependencies` y `devDependencies` de `package.json` tiene que estar
listada aquí. La guardia `tests/guards/guard-dependencias-aprobadas.test.ts` compara las
dos listas y falla si sobra algo en `package.json`. El gate corre sin red: la guardia no
consulta npm, solo compara nombres contra esta tabla. Los cuatro checks los verifica una
persona (o el agente con red disponible) **antes** de añadir la fila, y la fila es el acta.

La regla y su porqué viven en `docs/architecture.md > Dependencias de terceros`.

## Cómo se añade una fila

1. El agente propone: qué hace la librería, qué código nos ahorra, y el resultado de los
   cuatro checks (`npm view <pkg> deprecated time.modified license`, descargas semanales).
2. **El humano aprueba.** Sin aprobación no se instala; el agente para y devuelve.
3. Se añade la fila con la fecha y quién aprobó, y se instala.

## Estados

- `aprobada` — pasó los cuatro checks y un humano la aprobó. La fila dice cuándo.
- `excepcion` — falla algún check y el humano la aceptó igual. La fila dice **qué check
  falló y por qué se aceptó**. Sin ese porqué la fila no vale.
- `heredada` — estaba en el repo antes de esta regla (2026-09-01) y aún no pasó los cuatro
  checks. No bloquea el gate; se resuelve en la feature de auditoría del board.

## Registro

| Paquete | Para qué | Estado | Fecha | Notas |
| --- | --- | --- | --- | --- |
| `@base-ui/react` | Primitivas headless sobre las que monta shadcn/ui | heredada | 2026-09-01 | Pendiente de auditoría |
| `@prisma/client` | Cliente del ORM | heredada | 2026-09-01 | Pendiente de auditoría |
| `bcryptjs` | Hash y verificacion de contrasena (QC-5) | heredada | 2026-09-01 | Entro con QC-5, que se mergeo en `origin/dev` DESPUES de escribirse este registro; el humano aprobo la libreria al ordenar rehacer la feature con ella. Pendiente de auditoria como el resto |
| `class-variance-authority` | Variantes de clases en componentes ui/ | heredada | 2026-09-01 | Pendiente de auditoría |
| `clsx` | Composición condicional de clases | heredada | 2026-09-01 | Pendiente de auditoría |
| `lucide-react` | Iconos | heredada | 2026-09-01 | Pendiente de auditoría |
| `next` | Framework (App Router) | heredada | 2026-09-01 | Pendiente de auditoría |
| `react` | Librería de UI | heredada | 2026-09-01 | Pendiente de auditoría |
| `react-dom` | Renderer DOM de React | heredada | 2026-09-01 | Pendiente de auditoría |
| `shadcn` | CLI para añadir primitivas a `components/ui/` | heredada | 2026-09-01 | Pendiente de auditoría |
| `sonner` | Toasts | heredada | 2026-09-01 | Pendiente de auditoría |
| `tailwind-merge` | Resolución de clases Tailwind en conflicto | heredada | 2026-09-01 | Pendiente de auditoría |
| `tw-animate-css` | Animaciones para Tailwind v4 | heredada | 2026-09-01 | Pendiente de auditoría |
| `zod` | Validación en el borde (route handlers, webhooks) | heredada | 2026-09-01 | Pendiente de auditoría |
| `@tailwindcss/postcss` | Plugin PostCSS de Tailwind v4 | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@testing-library/dom` | Base de Testing Library | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@testing-library/jest-dom` | Matchers de DOM para los tests de UI | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@testing-library/react` | Render de componentes en tests | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@testing-library/user-event` | Simulación de interacción en tests | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@types/node` | Tipos de Node | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@types/pg` | Tipos de `pg` | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@types/react` | Tipos de React | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@types/react-dom` | Tipos de React DOM | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `@vitejs/plugin-react` | Plugin React para el runner de tests | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `eslint` | Linter | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `eslint-config-next` | Reglas ESLint de Next.js | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `jsdom` | Entorno DOM del proyecto `ui` de Vitest | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `pg` | Cliente Postgres para `db:rollback` y tests de integración | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `prisma` | CLI de migraciones | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `tailwindcss` | CSS utilitario | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `tsx` | Ejecuta los scripts TypeScript de `scripts/` | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `typescript` | Compilador (strict) | heredada | 2026-09-01 | dev — Pendiente de auditoría |
| `vitest` | Runner de tests | heredada | 2026-09-01 | dev — Pendiente de auditoría |
