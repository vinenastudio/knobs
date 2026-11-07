import { useEffect, useState } from 'react';
import { isArabic, locale, t } from '../i18n';

const cities = [
  { ar: 'طوكيو', lat: 35.68, lng: 139.65, name: 'Tokyo' },
  { ar: 'بورتلاند', lat: 45.52, lng: -122.68, name: 'Portland, Oregon' },
  { ar: 'لندن', lat: 51.51, lng: -0.13, name: 'London' },
  { ar: 'برلين', lat: 52.52, lng: 13.4, name: 'Berlin' },
];

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const now = () =>
  `${new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    timeZoneName: 'short',
    weekday: 'long',
  }).format(new Date())} · ${zone}`;

declare global {
  interface Window {
    locate?: () => void;
  }
}

export function Greeting() {
  const [time, setTime] = useState(now);
  const [place, setPlace] = useState(isArabic ? 'بورتلاند' : 'Portland, Oregon');
  useEffect(() => {
    const timer = setInterval(() => setTime(now()), 15_000);
    // Only on request: the page never asks for the location by itself.
    window.locate = () =>
      navigator.geolocation?.getCurrentPosition(({ coords }) => {
        const away = (city: (typeof cities)[number]) =>
          Math.hypot(city.lat - coords.latitude, city.lng - coords.longitude);
        const near = cities.reduce((best, city) => (away(city) < away(best) ? city : best));
        setPlace(
          `${isArabic ? near.ar : near.name} · ${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`,
        );
      });
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="card greet">
      <div>
        <h1>{t.hello}</h1>
        <p>{time}</p>
        <p>
          {`${t.pickup}: `}
          <span id="place">{place}</span>
        </p>
      </div>
      <div className="spacer" />
      <span className="live">
        <b />
        <span>{t.live}</span>
      </span>
    </section>
  );
}
