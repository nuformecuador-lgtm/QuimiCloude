# QC-171 — recortes-con-url-publica · requirements.md

> **Zona:** `fullstack` · **Complejidad:** _la asigna el leader en F1.0_ · **depends_on:** — ·
> **Rama:** `feature/QC-171-recortes-con-url-publica`
>
> **Alcance.** Los recortes de imagen de un catálogo en PDF pasan a un bucket **público y propio**
> y se muestran con **URL pública** en vez de enlace firmado. Se guarda la **ruta** y la URL se
> compone en el servidor al leer. Aplica a las tres pantallas que muestran un recorte: la revisión
> de la importación (fila y selector de recorte), la vitrina de `/proveedores` y la tabla del
> catálogo del proveedor. En las dos últimas la imagen importada hoy no se ve, porque la pantalla
> recibe la ruta y la usa como dirección.
>
> **Lo que NO entra.** Mover los recortes que ya están en el bucket privado (se dan por perdidos).
> Borrar recortes al descartar una importación o dar de baja un proveedor (no se abre ficha hasta
> que se pida). La imagen de `products` y la de recetas, que no vienen de un recorte. Los PDF, que
> siguen en su bucket privado con enlace firmado.
>
> Sembrado por `/afinar-feature` el 2026-09-25. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-09-25 | ¿Las imágenes del catálogo pueden ser públicas? | **Sí.** Las rutas llevan empresa y archivo (dos UUID) y nadie puede listar el bucket sin credencial. |
| 2026-09-25 | ¿Bucket compartido con recetas o propio? | **Público pero propio**, separado del de recetas: ciclo de vida y límites de tamaño y tipo independientes. Los buckets no tienen coste propio en Supabase. |
| 2026-09-25 | ¿Se guarda la URL o la ruta? | **La ruta.** La URL pública se compone en el servidor al leer, nunca en la pantalla. Heredado de QC-25 R25 y QC-26. |
| 2026-09-25 | ¿Qué pasa con los recortes ya subidos al bucket privado? | **Se dan por perdidos.** No se mueven; las líneas que los tienen muestran el marcador de `EntityImage` (heredado de QC-140 D5) y se re-importa el PDF si se quiere la imagen. |
| 2026-09-25 | ¿Deroga decisiones anteriores? | **QC-110 no**: su bucket «nuevo y propio» (`[D17]`) se mantiene. **Se deroga la fila 2026-09-24 de QC-158** («pintarla con URL firmada es de QC-140»): se pinta con URL pública, y lo hace esta ficha porque QC-140 cerró sin pintarla. |
| 2026-09-25 | ¿Permisos? | **Sin cambios**: cada pantalla conserva el suyo (`proveedores.consultar`, heredado de QC-140 D10; los de documentos, de QC-142 y QC-169). La URL pública no pasa por ningún permiso. |
| 2026-09-25 | ¿Librería? | **Ninguna nueva**: `getPublicUrl` de `@supabase/storage-js`, ya aprobada y en uso en recetas. |
| 2026-09-25 | ¿Frontera con QC-176? | **Esta ficha solo cambia dónde viven los recortes y cómo se muestran.** Cómo se generan y cómo se emparejan con las filas (llamada de coordenadas, recorte y subida, `crop-pairing.ts`, emparejamiento por orden en la revisión) es de **QC-176** y aquí no se toca: la revisión conserva el emparejamiento actual y solo cambia la URL con la que pinta. QC-171 va **antes** que QC-176 (link *Blocks* en el board). |
| 2026-09-25 | ¿Hace falta E2E? | **No, se difiere con motivo.** No es flujo crítico según `CHECKPOINTS.md`, y en el E2E el almacenamiento es simulado, así que no puede demostrar que la imagen se ve. Cobertura unitaria y de integración de que la URL se compone y llega a cada pantalla; el E2E de QC-158 sigue en verde. |
