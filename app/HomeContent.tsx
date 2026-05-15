'use client';

import { CTAButton } from '@/components/CTAButton';
import Logo from '@/components/logo';
import BenefitsGridLite from '@/components/Benefits/BenefitsGridLite';
import WhatsAppMockup from '@/components/WhatsAppMockup';
import SubscriptionSummary from '@/components/SubscriptionSummary';

export default function HomeContent() {
  return (
    <div className="container mx-auto px-4 py-12 md:py-20">

      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
        <div className="mb-6">
          <Logo className="h-16 w-auto mx-auto" />
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
          Cada mañana, un mensaje hecho para vos.
        </h1>
        <p className="text-lg md:text-xl text-white/70 mb-8">
          Tu horóscopo del día, tu afirmación, tu número y color de la suerte, y un consejo para lo que querés trabajar. Todo en un mensaje breve, directo a WhatsApp.
        </p>

        <div className="my-10 md:my-12 flex justify-center">
          <WhatsAppMockup />
        </div>

        <CTAButton href="/checkout" text="Quiero mi guía diaria" className="text-lg" />
        <p className="text-sm text-white/50 mt-3">$U 390/mes · Sin apps · Cancelás cuando quieras</p>
      </section>

      {/* Beneficios */}
      <section className="mb-16 md:mb-24">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-10 md:mb-12">
          Todo lo que recibís
        </h2>
        <BenefitsGridLite />
      </section>

      {/* Cómo funciona */}
      <section className="mb-16 md:mb-24">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-10 md:mb-12">
          ¿Cómo funciona?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center px-4">
            <div className="text-6xl font-extrabold text-violet-400 mb-3 leading-none">1</div>
            <h3 className="text-lg font-bold text-white mb-2">Te registrás en minutos</h3>
            <p className="text-white/65 text-sm leading-relaxed">
              Ingresás tu nombre, tu signo y tu número de WhatsApp. Elegís en qué querés enfocarte.
            </p>
          </div>
          <div className="text-center px-4">
            <div className="text-6xl font-extrabold text-violet-400 mb-3 leading-none">2</div>
            <h3 className="text-lg font-bold text-white mb-2">Confirmás tu WhatsApp</h3>
            <p className="text-white/65 text-sm leading-relaxed">
              Te enviamos un mensaje de bienvenida. Lo respondés para activar tu cuenta. Un solo paso.
            </p>
          </div>
          <div className="text-center px-4">
            <div className="text-6xl font-extrabold text-violet-400 mb-3 leading-none">3</div>
            <h3 className="text-lg font-bold text-white mb-2">Recibís tu guía cada mañana</h3>
            <p className="text-white/65 text-sm leading-relaxed">
              Tu mensaje personalizado llega directo a tu WhatsApp. Sin apps. Sin spam. Solo vos y tu guía.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-8">
          Empezá hoy. Primer mensaje en minutos.
        </h2>
        <SubscriptionSummary />
        <div className="mt-8">
          <CTAButton href="/checkout" text="Quiero mi guía diaria" className="text-xl" />
        </div>
      </section>

    </div>
  );
}
