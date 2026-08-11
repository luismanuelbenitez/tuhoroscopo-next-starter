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
 * Valida que el output estructurado de Anthropic esté completo.
 * Una lectura es inválida si alguna carta carece de interpretacion/consejo,
 * o si los campos de resumen/mensaje están vacíos.
 * Uso obligatorio en ef_tarot_generar_lectura y ef_tarot_laboratorio
 * ANTES de persistir o devolver el resultado.
 */
export function validateLectura(output: LecturaIAOutput): ValidacionLectura {
  if (!Array.isArray(output.cartas) || output.cartas.length !== 5) {
    return {
      valida: false,
      campo: "cartas",
      detalle: `Esperadas 5, recibidas ${output.cartas?.length ?? 0}`,
    };
  }
  for (let i = 0; i < output.cartas.length; i++) {
    const c = output.cartas[i];
    if (!c.interpretacion?.trim()) {
      return { valida: false, campo: `cartas[${i}].interpretacion`, detalle: "vacía o solo whitespace" };
    }
    if (!c.consejo?.trim()) {
      return { valida: false, campo: `cartas[${i}].consejo`, detalle: "vacío o solo whitespace" };
    }
  }
  if (!output.resumen_lectura?.trim()) {
    return { valida: false, campo: "resumen_lectura", detalle: "vacío" };
  }
  if (!output.mensaje_final?.trim()) {
    return { valida: false, campo: "mensaje_final", detalle: "vacío" };
  }
  if (!Array.isArray(output.proximos_pasos) || output.proximos_pasos.length < 3) {
    return {
      valida: false,
      campo: "proximos_pasos",
      detalle: `Esperados ≥3, recibidos ${output.proximos_pasos?.length ?? 0}`,
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
          description: `Síntesis de la tirada completa. Cómo las 5 cartas dialogan entre sí. Máximo ${w.resumen} palabras.`,
        },
        mensaje_final: {
          type: "string",
          description: `Mensaje final cálido y motivador para el consultante. Máximo ${w.mensaje_final} palabras.`,
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
