# QC-249 — entorno-de-preview · requirements.md

> **Zona:** `backend` · **Complejidad:** `medium` · **depends_on:** — ·
> **Rama:** `feature/QC-249-entorno-de-preview`
>
> **Alcance.** Cada PR a `dev` publica una preview de la app en Vercel, sin la integración de Git
> de Vercel, contra una base y un storage de preview propios. El build de preview migra y siembra
> esa base (seed base + seed de demo). Correo, cola de documentos e IA no tienen efecto real en
> preview. El link solo lo abren cuentas de Vercel del equipo.
>
> **Lo que NO entra.** Crear el proyecto de Supabase, los buckets ni cargar variables en Vercel
> (lo hace el humano; ya hechas la base y, en curso, el storage). Una base por PR. El paso dev → prod
> (se hace al cerrar el rediseño). Previews de PRs desde forks (GitHub no les da secrets).
>
> Sembrado por `/afinar-feature` el 2026-10-09. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-09 | ¿Cuándo se crea una preview? | En cada PR a `dev`, y se actualiza con cada push al PR. El link queda visible en el PR. |
| 2026-10-09 | ¿Con qué datos arranca? | Seed base + seed de demo (QC-230), ambos idempotentes. **Enmienda QC-230:** la guarda de `scripts/seed-demo.ts` pasa a admitir `VERCEL_ENV=preview` contra la base remota de preview; sigue negándose siempre en `production`. Nota fechada en el spec de QC-230. |
| 2026-10-09 | ¿Efectos fuera de la app en preview? | Apagados o con dobles: ningún correo real sale, la lectura de PDFs usa los dobles existentes, no se gastan créditos de IA de prod. |
| 2026-10-09 | ¿Varias previews a la vez? | Comparten la única base de preview. Se acepta que una migración de un PR afecte la base que ven otras previews. |
| 2026-10-09 | ¿Quién abre una preview? | Solo cuentas de Vercel del equipo (Deployment Protection). |
| 2026-10-09 | ¿Storage? | Separado: buckets en el proyecto de Supabase de preview; variables con scope Preview, cargadas por el humano. |
| 2026-10-09 | Despliegue | Por CLI y token como `desplegar.yml` (QC-229): `npx vercel@<fija> deploy` sin `--prod`, sin `pnpm install` en el runner. Heredado de QC-229. |
| 2026-10-09 | Build en preview | `scripts/build.mjs` corre migrate y seed también con `VERCEL_ENV=preview`; sin `VERCEL_ENV`, sigue saltándolos (lado seguro, QC-229). |
