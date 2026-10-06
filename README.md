# QuimiCloude

Aplicación Next.js (App Router) + TypeScript + Prisma + Postgres (Supabase), desplegada en
Vercel. El stack y la arquitectura están en `docs/architecture.md`.

El repo se trabaja con el **arnés SDD v2**, que viene de la plantilla
[`singularis-co/harness_config`](https://github.com/singularis-co/harness_config). El arnés es un
proceso para que agentes de Claude Code trabajen en equipo de forma verificable: spec antes que
código, estado en disco, trazabilidad requisito→test y un gate ejecutable.

## Empezar (cada persona, una vez)

1. Clona el repo, crea tu `.env` desde `.env.example` y corre `pnpm install`.
2. Abre Claude Code en la raíz y corre `/jira-connect`. Fija tu identidad de Jira en
   `.arnes.local.json`; ese archivo no se versiona.
3. Pide «importa el board» (paso F0) y corre `./init.sh`. Debe salir en verde.

## El día a día

- Abre Claude Code en la raíz: actúa como **leader** (`CLAUDE.md`). Te muestra tu sesión anterior
  y tus features en vuelo.
- Pídele la siguiente feature. Antes de tomarla, el leader:
  - comprueba en Jira que nadie la tiene;
  - te la asigna;
  - publica su rama, que funciona como candado (`docs/equipo.md`).
- Aprueba el spec moviendo la tarjeta de *Spec en revisión* a *En curso*.
- Mergea el PR **solo con el check `gate-completo` en verde**.

## Mapa

| Para | Mira |
| --- | --- |
| El flujo completo y quién hace qué | `AGENTS.md` |
| Trabajo en equipo, candado, cupo | `docs/equipo.md` |
| El gate (local rápido, CI completo) | `docs/gate.md` |
| Qué leer y cuánto | `docs/lectura.md` |
| Perfil del proyecto | `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`, `docs/dependencias.md` |
| Actualizar el arnés desde la plantilla | `./scripts/arnes-sync.sh` |
