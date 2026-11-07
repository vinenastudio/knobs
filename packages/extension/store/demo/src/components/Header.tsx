import { useState } from 'react';
import { t } from '../i18n';

const links = [t.dashboard, t.orders, t.products, t.customers];

export function Header() {
  const [open, setOpen] = useState(false);
  const nav = links.map((link, at) => (
    <a aria-current={at === 0 ? 'page' : undefined} href="#" key={link}>
      {link}
    </a>
  ));
  return (
    <>
      <header>
        <div className="logo">
          <i>{t.brand[0]}</i>
          <span>{t.brand}</span>
        </div>
        <nav>{nav}</nav>
        <div className="spacer" />
        <div className="avatar" />
        <button
          aria-expanded={open}
          aria-label={t.menu}
          className="menu-button"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <svg
            fill="none"
            height="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            viewBox="0 0 20 20"
            width="20"
          >
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      </header>
      <div className={open ? 'mobile-menu open' : 'mobile-menu'}>{nav}</div>
    </>
  );
}
