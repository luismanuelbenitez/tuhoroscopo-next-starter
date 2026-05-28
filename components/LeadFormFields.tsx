// ============================================================
// === Archivo: components/LeadFormFields.tsx
// === Descripción: Componente "tonto" que renderiza los campos
// === del formulario. SIN LÓGICA INTERNA.
// === Refinamientos: Eliminados iconos 'lucide', restaurados emojis en labels/options.
// ============================================================
'use client'; // Necesario por ReactCountryFlag y onChange handlers

import React from 'react';
import ReactCountryFlag from "react-country-flag";
// Eliminamos Sparkles y Bot de las importaciones
import { Phone, ChevronDown } from 'lucide-react';

// --- TIPOS Y CONSTANTES (Solo datos para renderizar) ---
interface FormData {
  name: string;
  signo: string;
  contenidoPreferido: string;
  whatsapp: string;
}

interface LeadFormFieldsProps {
  formData: FormData;
  handleInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  isLoading: boolean;
  acepta: boolean; // Estado del checkbox
  handleCheckboxChange: (e: React.ChangeEvent<HTMLInputElement>) => void; // Handler para el checkbox
}

// *** CORRECCIÓN AQUÍ: Restauramos emojis en las labels ***
const signos = [
  { value: 'Aries', label: '🐏 Aries' },
  { value: 'Tauro', label: '🐂 Tauro' },
  { value: 'Géminis', label: '♊ Géminis' },
  { value: 'Cáncer', label: '🦀 Cáncer' },
  { value: 'Leo', label: '🦁 Leo' },
  { value: 'Virgo', label: '🌸 Virgo' },
  { value: 'Libra', label: '⚖️ Libra' },
  { value: 'Escorpio', label: '🦂 Escorpio' },
  { value: 'Sagitario', label: '🏹 Sagitario' },
  { value: 'Capricornio', label: '🐐 Capricornio' },
  { value: 'Acuario', label: '🌊 Acuario' },
  { value: 'Piscis', label: '🐟 Piscis' },
];
// *** CORRECCIÓN AQUÍ: Restauramos emojis en las labels ***
const preferencias = [
  { value: 'general', label: '🧠 General' },
  { value: 'trabajo y dinero', label: '💼 Trabajo y dinero' },
  { value: 'amor', label: '❤️ Relaciones' },
  { value: 'bienestar', label: '🧘 Bienestar mental' },
];

export default function LeadFormFields({
  formData,
  handleInputChange,
  isLoading,
  acepta,
  handleCheckboxChange
}: LeadFormFieldsProps) {

  // Clases base para inputs y selects
  const inputBaseClasses = "w-full py-3 bg-white/8 border border-transparent rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-violet-500/60 ring-1 ring-white/15 disabled:opacity-60";
  const selectBaseClasses = `${inputBaseClasses} appearance-none`;

  return (
    <div className="space-y-5">
       {/* Nombre */}
       <div>
           <label htmlFor="name" className="block text-sm text-white/80 mb-1">Nombre</label>
           <input
            id="name"
            name="name"
            className={`${inputBaseClasses} px-4`} // Padding normal
            placeholder="Tu nombre"
            value={formData.name}
            onChange={handleInputChange}
            disabled={isLoading}
            required
           />
       </div>

       {/* Signo */}
       <div className="relative">
           <label htmlFor="signo" className="block text-sm text-white/80 mb-1">Tu signo</label>
           {/* Eliminamos el ícono Sparkles posicionado absolutamente */}
           {/* <Sparkles className="absolute left-3 top-9 h-5 w-5 text-white/50 pointer-events-none z-10" /> */}
           <select
            id="signo"
            name="signo"
            // *** CORRECCIÓN AQUÍ: Ajustamos padding izquierdo y derecho ***
            className={`${selectBaseClasses} px-4 pr-10`} // Padding normal a la izquierda, espacio para flecha a la derecha
            value={formData.signo}
            onChange={handleInputChange}
            disabled={isLoading}
            required
           >
            {/* *** CORRECCIÓN AQUÍ: Restauramos emoji del placeholder option *** */}
            <option value="" disabled>Seleccioná tu signo</option>
            {signos.map((s) => ( <option key={s.value} value={s.value}> {s.label} </option> ))}
           </select>
           {/* Indicador visual de select (se mantiene) */}
           <ChevronDown className="absolute right-3 top-9 h-5 w-5 text-white/50 pointer-events-none" />
       </div>

       {/* Contenido Preferido */}
       <div className="relative">
           <label htmlFor="contenidoPreferido" className="block text-sm text-white/80 mb-1">¿En qué querés enfocarte?</label>
            {/* Eliminamos el ícono Bot posicionado absolutamente */}
           {/* <Bot className="absolute left-3 top-9 h-5 w-5 text-white/50 pointer-events-none z-10" /> */}
           <select
            id="contenidoPreferido"
            name="contenidoPreferido"
            // *** CORRECCIÓN AQUÍ: Ajustamos padding izquierdo y derecho ***
            className={`${selectBaseClasses} px-4 pr-10`} // Padding normal a la izquierda, espacio para flecha a la derecha
            value={formData.contenidoPreferido}
            onChange={handleInputChange}
            disabled={isLoading}
            required
            >
             <option value="" disabled>Seleccioná una opción...</option>
             {preferencias.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
           </select>
           {/* Indicador visual de select (se mantiene) */}
           <ChevronDown className="absolute right-3 top-9 h-5 w-5 text-white/50 pointer-events-none" />
       </div>

       {/* WhatsApp (sin cambios en esta parte) */}
       <div>
           <label htmlFor="whatsapp" className="block text-sm text-white/80 mb-1">Tu número de WhatsApp</label>
           <div className="flex gap-2 items-center">
             <div className="flex items-center gap-2 rounded-xl bg-white/8 px-3 ring-1 ring-white/15 h-[52px]">
                <ReactCountryFlag countryCode="UY" svg style={{ width: "24px", height: "18px", borderRadius: "2px" }} title="Uruguay" className="shadow-sm" />
                <span className="text-white/70 font-medium tracking-wide">+598</span>
             </div>
             <input
               id="whatsapp"
               name="whatsapp"
               className="flex-1 rounded-xl bg-white/8 px-4 py-3 h-[52px] ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-violet-500/60 placeholder:text-white/40 disabled:opacity-60"
               placeholder="099123456"
               inputMode="numeric"
               value={formData.whatsapp}
               onChange={handleInputChange}
               disabled={isLoading}
               required
               pattern="09\d{7}"
               title="Ingresa tu celular uruguayo sin el +598 (ej: 091234567)"
             />
           </div>
           <p className="mt-1 text-xs text-white/60">Te vamos a escribir acá.   </p>
       </div>

        {/* Checkbox Política de Privacidad (sin cambios) */}
        <label className="mt-4 flex items-start gap-2 text-sm text-white/80">
            <input
                type="checkbox"
                checked={acepta}
                onChange={handleCheckboxChange}
                disabled={isLoading}
                required
                className="mt-1 accent-violet-500"
            />
            <span>
                Acepto la{' '}
                <a
                 className="underline hover:text-violet-300"
                 href="/politica-de-privacidad"
                 target="_blank"
                 rel="noreferrer"
                >
                 Política de privacidad
                </a>{' '}
                y los{' '}
                <a
                 className="underline hover:text-violet-300"
                 href="/terminos-del-servicio"
                 target="_blank"
                 rel="noreferrer"
                >
                 Términos del servicio
                </a>.
            </span>
        </label>
    </div>
  );
}

