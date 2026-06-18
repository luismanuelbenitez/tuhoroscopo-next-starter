import { Suspense } from "react";
import CheckoutContent from "../../checkout/CheckoutContent";

export default function HoroscopoCheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "#0e0b22" }} />}>
      <CheckoutContent />
    </Suspense>
  );
}
