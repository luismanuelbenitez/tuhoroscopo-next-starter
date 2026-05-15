'use client'
export default function StickyCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="px-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <a
          href="/checkout"
          className="block text-center mx-auto w-[92vw] max-w-sm rounded-full py-4 font-semibold shadow-lg bg-gradient-to-r from-yellow-400 to-pink-400"
        >
          Quiero mi guía diaria
        </a>
      </div>
    </div>
  );
}
