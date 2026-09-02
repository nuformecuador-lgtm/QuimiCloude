// QC-9 T18 — Guardia: `docs/architecture.md > Permisos y autenticacion` dice la verdad (R23, R29).
//
// El documento describia el middleware como algo que «verifica existencia de cookie de sesion».
// QC-9 lo cambia: el middleware valida FIRMA y CADUCIDAD del valor firmado (y el rol que lleva
// dentro), y redirige en los dos sentidos. Una cookie que existe no es una sesion, y un documento
// que lo insinua invita a escribir el corte barato -- que es exactamente el agujero.
//
// La segunda mitad (R29) es la que de verdad importa: meter el rol DENTRO de la cookie invita al
// error contrario, creerse que el middleware autoriza. `docs/architecture.md > Acceso a datos y
// autorizacion` sigue mandando: la autorizacion se valida EN EL SERVICE. Esa frase tiene que estar
// escrita, no sobreentendida, porque el proximo que lea la seccion de permisos y encuentre un rol
// firmado en el borde va a dar por hecho lo contrario. Si alguien borra o suaviza esa frase, esta
// guardia se pone roja.
//
// Patron de `tests/guards/guard-firma-sesion-unica.test.ts`: `findRepoRoot`, funciones puras
// exportadas que reciben el TEXTO del documento, y casos sinteticos que demuestran que cada regla
// dispara Y el caso simetrico que no la viola.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))

const DOC_PATH = 'docs/architecture.md'
const SECCION = 'Permisos y autenticacion'

/**
 * Texto de la seccion `## <heading>` hasta el siguiente `## ` de primer nivel, o `null` si no
 * existe. Se compara sin acentos, para que renombrar la seccion a «Permisos y autenticación» no
 * deje la guardia muda.
 */
export function extractSection(doc: string, heading: string): string | null {
  const objetivo = stripDiacritics(heading).toLowerCase().trim()
  const lineas = doc.split('\n')
  const inicio = lineas.findIndex(
    (linea) => linea.startsWith('## ') && stripDiacritics(linea.slice(3)).toLowerCase().trim() === objetivo,
  )
  if (inicio === -1) return null

  const resto = lineas.slice(inicio + 1)
  const fin = resto.findIndex((linea) => linea.startsWith('## '))
  return (fin === -1 ? resto : resto.slice(0, fin)).join('\n')
}

/** Quita los acentos: «autenticación» y «autenticacion» son la misma palabra para esta guardia. */
function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Texto comparable: sin acentos, en minusculas, sin el marcado que solo es enfasis (`**`, `` ` ``)
 * y con los espacios colapsados. Asi la regla no depende de donde parta la linea el editor ni de
 * si la frase quedo en negrita: `**firma**` y `firma` son lo mismo.
 */
export function normalizeDocText(text: string): string {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `true` si `necesitadas` aparecen todas dentro de los `ventana` caracteres siguientes a `ancla`. */
function mencionCercana(texto: string, ancla: RegExp, necesitadas: readonly RegExp[], ventana = 240): boolean {
  const global = new RegExp(ancla.source, 'g')
  for (const match of texto.matchAll(global)) {
    const trozo = texto.slice(match.index ?? 0, (match.index ?? 0) + ventana)
    if (necesitadas.every((regla) => regla.test(trozo))) return true
  }
  return false
}

/**
 * Hallazgos sobre la seccion de permisos. Lista vacia = el documento dice lo que QC-9 implementa.
 *
 * Cada hallazgo dice QUE hay que escribir, no solo que fallo: quien la ponga roja esta editando un
 * documento, y necesita saber la frase que falta.
 */
export function findPermissionsDocFindings(doc: string): readonly string[] {
  const seccion = extractSection(doc, SECCION)
  if (seccion === null) {
    return [
      `${DOC_PATH} no tiene la seccion '## ${SECCION}' (R23). Es donde se describe que valida el ` +
        'middleware; no la renombres sin actualizar esta guardia.',
    ]
  }

  const texto = normalizeDocText(seccion)
  const findings: string[] = []

  // R23 — la frase vieja. El middleware ya no se conforma con que la cookie este ahi.
  if (/existencia de (la |una )?cookie/.test(texto)) {
    findings.push(
      `${DOC_PATH} > ${SECCION} sigue diciendo que el middleware verifica «existencia de cookie» ` +
        '(R23). Eso dejo de ser cierto en QC-9: el middleware valida la FIRMA y la CADUCIDAD del ' +
        'valor firmado. Reescribe esa linea; una cookie que existe no es una sesion.',
    )
  }

  // R23 — y la frase nueva tiene que estar, no solo faltar la vieja.
  if (!mencionCercana(texto, /valida/, [/\bfirma\b/, /caducidad/])) {
    findings.push(
      `${DOC_PATH} > ${SECCION} no dice que el middleware VALIDA la FIRMA y la CADUCIDAD de la ` +
        'cookie de sesion (R23). Escribelo con esas dos palabras en la misma frase: es lo que ' +
        'separa el corte real del corte barato.',
    )
  }

  // R29 — el rol firmado no autoriza.
  if (!mencionCercana(texto, /\brol\b/, [/no autoriza/])) {
    findings.push(
      `${DOC_PATH} > ${SECCION} no dice que el rol que viaja en la cookie NO AUTORIZA (R29). Un ` +
        'rol firmado en el borde invita justo al error contrario, asi que la frase va escrita: su ' +
        'unico efecto admisible es decidir si se enseña una pantalla.',
    )
  }

  // R29 — y la frontera de verdad, con su nombre.
  if (!/la autorizacion se valida en el service/.test(texto)) {
    findings.push(
      `${DOC_PATH} > ${SECCION} no dice que «la autorizacion se valida en el service» (R29). ` +
        "'## Acceso a datos y autorizacion' sigue mandando y el middleware no la sustituye: un " +
        'permiso implementado solo como corte de ruta no cuenta como implementado.',
    )
  }

  return findings
}

const docSource = readFileSync(join(repoRoot, DOC_PATH), 'utf8')

describe('guardia — la seccion de permisos describe el middleware real (R23, R29)', () => {
  it('docs/architecture.md > Permisos y autenticacion no habla de «existencia de cookie» y si de firma, caducidad y frontera en el service', () => {
    const findings = findPermissionsDocFindings(docSource)

    expect(findings, findings.length === 0 ? undefined : findings.join('\n')).toEqual([])
  })

  it('la seccion existe y se extrae acotada: no arrastra la siguiente', () => {
    const seccion = extractSection(docSource, SECCION)

    expect(seccion, `no se encontro '## ${SECCION}' en ${DOC_PATH}`).not.toBeNull()
    expect(seccion).toContain('middleware.ts')
    // La seccion de al lado no entra: si entrara, la guardia se pondria verde por texto ajeno.
    expect(seccion).not.toContain('Server Actions vs Route Handlers')
  })

  it('detecta el documento ANTERIOR a QC-9: existencia de cookie, sin firma ni caducidad ni frontera', () => {
    const docViejo = [
      '## Permisos y autenticacion',
      '- `middleware.ts` intercepta rutas protegidas, verifica existencia de cookie de sesion.',
      '',
      '## Otra seccion',
    ].join('\n')

    const findings = findPermissionsDocFindings(docViejo)

    expect(findings).toHaveLength(4)
    expect(findings.join('\n')).toContain('«existencia de cookie»')
    expect(findings.join('\n')).toContain('la FIRMA y la CADUCIDAD')
    expect(findings.join('\n')).toContain('NO AUTORIZA')
    expect(findings.join('\n')).toContain('se valida en el service')
  })

  it('detecta el caso a medias: cuenta la firma pero calla que el rol no autoriza (R29)', () => {
    const docAMedias = [
      '## Permisos y autenticacion',
      '- `middleware.ts` valida la firma y la caducidad de la cookie de sesion, y el rol firmado.',
      '',
      '## Otra seccion',
    ].join('\n')

    const findings = findPermissionsDocFindings(docAMedias)

    expect(findings.join('\n')).not.toContain('la FIRMA y la CADUCIDAD')
    expect(findings.join('\n')).toContain('NO AUTORIZA')
    expect(findings.join('\n')).toContain('se valida en el service')
  })

  it('un documento que lo dice todo no genera hallazgos, con acentos y con negritas', () => {
    const docBueno = [
      '## Permisos y autenticación',
      '- `middleware.ts` **valida** la cookie de sesión: su **firma**, su **caducidad** y el rol',
      '  firmado que lleva dentro.',
      '',
      'El rol de la cookie **no autoriza**: solo decide si se enseña una pantalla. La',
      '**autorización se valida en el service**, antes de tocar el repositorio.',
      '',
      '## Otra sección',
    ].join('\n')

    expect(findPermissionsDocFindings(docBueno)).toEqual([])
  })

  it('sin la seccion, la guardia avisa en vez de quedarse muda', () => {
    const findings = findPermissionsDocFindings('## Otra cosa\ntexto\n')

    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain("no tiene la seccion '## Permisos y autenticacion'")
  })
})
