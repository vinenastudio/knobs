import { Greeting } from './components/Greeting';
import { Header } from './components/Header';
import { SalesChart } from './components/SalesChart';
import { StatCard } from './components/StatCard';
import { TopSeller } from './components/TopSeller';
import { locale, t } from './i18n';

const money = new Intl.NumberFormat(locale, {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

export function App() {
  return (
    <>
      <Header />
      <main>
        <Greeting />
        <StatCard change={12} label={t.revenue} value={money.format(4280)} />
        <StatCard change={8} label={t.orders} value={new Intl.NumberFormat(locale).format(312)} />
        <StatCard
          change={3}
          label={t.returning}
          value={new Intl.NumberFormat(locale, { style: 'percent' }).format(0.64)}
        />
        <SalesChart />
        <TopSeller />
      </main>
    </>
  );
}
