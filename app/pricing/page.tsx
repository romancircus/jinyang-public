import Header from '@/components/Header';
import Pricing from '@/components/Pricing';
import StandingOnGiants from '@/components/StandingOnGiants';
import Footer from '@/components/Footer';

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black">
      <Header />
      <div className="pt-20">
        <Pricing />
        <StandingOnGiants />
        <Footer />
      </div>
    </main>
  );
}
