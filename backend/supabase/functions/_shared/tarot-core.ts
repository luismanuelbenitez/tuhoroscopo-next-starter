// Helpers canónicos de generación de tarot — Tu Oráculo.
// Usados por: ef_tarot_generar_lectura, ef_tarot_laboratorio.
// Una sola implementación, cero duplicación.

export type WordLimits = {
  interpretacion: number;
  consejo: number;
  resumen: number;
  mensaje_final: number;
  proximo_paso: number;
};

export type LecturaIAOutput = {
  descripcion_general_tirada: string;
  cartas: Array<{ posicion: number; interpretacion: string; consejo: string }>;
  resumen_lectura: string;
  mensaje_final: string;
  proximos_pasos: string[];
  disclaimer: string;
};

export type ValidacionLectura =
  | { valida: true }
  | { valida: false; campo: string; detalle: string };

/**
 * Describe el tipo runtime de un valor para diagnóstico, sin volcar su
 * contenido (evita loguear narrativa/PII innecesaria — solo forma, no fondo).
 * Ej: "string (2840 caracteres)", "array (2 elementos)", "null", "number".
 */
function tipoRuntime(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array (${value.length} elementos)`;
  if (typeof value === "string") return `string (${value.length} caracteres)`;
  if (typeof value === "object") return "object";
  return typeof value;
}

/**
 * Valida ESTRUCTURALMENTE (en runtime) el output crudo del tool_use de
 * Anthropic. `output` llega como `unknown` a propósito: el JSON que
 * devuelve el modelo nunca se asume conforme al schema solo porque
 * TypeScript lo tipe como LecturaIAOutput — un `as LecturaIAOutput` en el
 * caller NO es validación real. Esta función es la única fuente de verdad
 * sobre si el objeto es seguro de tratar como LecturaIAOutput.
 *
 * Distingue explícitamente TIPO inválido (ej: `cartas` llegó como string en
 * vez de array) de CANTIDAD inválida (ej: llegaron 4 u 8 cartas) — un array
 * con `.length` y un string con `.length` producen números fácilmente
 * confundibles si no se valida el tipo primero (incidente 2026-08-17,
 * `cartas` no-array cuyo `.length` se reportó como si fuera cantidad de
 * cartas). Uso obligatorio en ef_tarot_generar_lectura y ef_tarot_laboratorio
 * ANTES de persistir o devolver el resultado — y antes de cualquier cast.
 */
export function validateLectura(output: unknown): ValidacionLectura {
  if (typeof output !== "object" || output === null) {
    return {
      valida: false,
      campo: "root",
      detalle: `Tipo inválido — se esperaba object, se recibió ${tipoRuntime(output)}`,
    };
  }
  const o = output as Record<string, unknown>;

  if (!Array.isArray(o.cartas)) {
    return {
      valida: false,
      campo: "cartas",
      detalle: `Tipo inválido — se esperaba array, se recibió ${tipoRuntime(o.cartas)}`,
    };
  }
  if (o.cartas.length !== 5) {
    return {
      valida: false,
      campo: "cartas",
      detalle: `Cantidad inválida — esperadas 5, recibidas ${o.cartas.length}`,
    };
  }
  for (let i = 0; i < o.cartas.length; i++) {
    const c = o.cartas[i] as Record<string, unknown> | null;
    if (typeof c?.interpretacion !== "string" || !c.interpretacion.trim()) {
      return {
        valida: false,
        campo: `cartas[${i}].interpretacion`,
        detalle: `vacía, ausente o de tipo inválido (${tipoRuntime(c?.interpretacion)})`,
      };
    }
    if (typeof c?.consejo !== "string" || !c.consejo.trim()) {
      return {
        valida: false,
        campo: `cartas[${i}].consejo`,
        detalle: `vacío, ausente o de tipo inválido (${tipoRuntime(c?.consejo)})`,
      };
    }
  }
  if (typeof o.resumen_lectura !== "string" || !o.resumen_lectura.trim()) {
    return {
      valida: false,
      campo: "resumen_lectura",
      detalle: `vacío o de tipo inválido (${tipoRuntime(o.resumen_lectura)})`,
    };
  }
  if (typeof o.mensaje_final !== "string" || !o.mensaje_final.trim()) {
    return {
      valida: false,
      campo: "mensaje_final",
      detalle: `vacío o de tipo inválido (${tipoRuntime(o.mensaje_final)})`,
    };
  }
  if (!Array.isArray(o.proximos_pasos)) {
    return {
      valida: false,
      campo: "proximos_pasos",
      detalle: `Tipo inválido — se esperaba array, se recibió ${tipoRuntime(o.proximos_pasos)}`,
    };
  }
  if (o.proximos_pasos.length < 3) {
    return {
      valida: false,
      campo: "proximos_pasos",
      detalle: `Cantidad inválida — esperados ≥3, recibidos ${o.proximos_pasos.length}`,
    };
  }
  return { valida: true };
}

export type CartaParaPrompt = {
  id: string;
  posicion_numero: number;
  posicion_nombre: string;
  posicion_descripcion: string;
  nombre_es: string;
  invertida: boolean;
  significado_normal: string;
  significado_invertido: string;
  keywords: string[];
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function interpolarTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    if (value === null || value === undefined || String(value).trim() === "") {
      result = result.replace(new RegExp(`^[^\n]*\\{\\{${key}\\}\\}[^\n]*\n?`, "gm"), "");
    } else {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

// deno-lint-ignore no-explicit-any
export function buildLecturaTool(w: WordLimits): Record<string, any> {
  return {
    name: "entregar_lectura_tarot",
    description: "Entrega la lectura de tarot personalizada en formato estructurado.",
    input_schema: {
      type: "object",
      properties: {
        descripcion_general_tirada: {
          type: "string",
          description: "Descripción introductoria de la tirada completa. 2 a 3 oraciones que enmarquen la energía global de la consulta.",
        },
        cartas: {
          type: "array",
          description: "Interpretación de cada una de las 5 cartas en su posición",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              posicion: { type: "integer", description: "Número de posición (1 a 5)" },
              interpretacion: {
                type: "string",
                minLength: 1,
                description: `Interpretación de esta carta en su posición. OBLIGATORIO: debe contener texto, no puede ser vacío. Máximo ${w.interpretacion} palabras. Conectá la carta con el tema/pregunta del consultante, su significado y orientación.`,
              },
              consejo: {
                type: "string",
                minLength: 1,
                description: `Consejo accionable y empático específico para esta carta y posición. OBLIGATORIO: debe contener texto, no puede ser vacío. 1 oración directa, máximo ${w.consejo} palabras.`,
              },
            },
            required: ["posicion", "interpretacion", "consejo"],
          },
        },
        resumen_lectura: {
          type: "string",
          description: `Síntesis narrativa de las 5 cartas como UNA historia (no "carta 1 dice... carta 2 dice..."): qué cuentan juntas sobre la situación del consultante — tensión central, contradicciones o progresión entre posiciones, qué está realmente en juego. Responde "¿qué dicen las cinco cartas juntas?", no "¿qué significa esto para vos?" (eso es mensaje_final — no lo adelantes acá). Máximo ${w.resumen} palabras: con más espacio disponible, profundizá la integración entre cartas en vez de acortar.`,
        },
        mensaje_final: {
          type: "string",
          description: `Cierre humano y personal de la lectura, dirigido directamente al consultante. Toma la comprensión construida por resumen_lectura y la aterriza en su experiencia — qué tensión merece mirar con honestidad, qué puede estar dependiendo de él/ella, una invitación a reflexionar sin decirle qué decidir. Responde "¿qué puede significar esto PARA VOS?", nunca repite ni resume lo ya dicho en resumen_lectura — si ambos campos podrían intercambiarse sin que se note, están mal. Máximo ${w.mensaje_final} palabras: con más espacio disponible, desarrollá el cierre en vez de cortarlo antes de tiempo.`,
        },
        proximos_pasos: {
          type: "array",
          description: `3 acciones concretas o reflexiones para los próximos días. Máximo ${w.proximo_paso} palabras por ítem.`,
          minItems: 3,
          maxItems: 3,
          items: { type: "string" },
        },
        disclaimer: {
          type: "string",
          description: "Nota al pie de carácter legal/espiritual. Usar el texto estándar.",
        },
      },
      required: ["descripcion_general_tirada", "cartas", "resumen_lectura", "mensaje_final", "proximos_pasos", "disclaimer"],
    },
  };
}

export function renderCartasTexto(cartas: CartaParaPrompt[]): string {
  return cartas.map((c) => {
    const orientacion = c.invertida ? "INVERTIDA" : "derecha";
    const significado = c.invertida ? c.significado_invertido : c.significado_normal;
    const keywords = c.keywords?.join(", ") ?? "";
    return `  Posición ${c.posicion_numero}: "${c.posicion_nombre}"
    - Carta: ${c.nombre_es} (${orientacion})
    - Qué representa esta posición: ${c.posicion_descripcion}
    - Significado de la carta: ${significado}
    - Keywords: ${keywords}`;
  }).join("\n\n");
}
