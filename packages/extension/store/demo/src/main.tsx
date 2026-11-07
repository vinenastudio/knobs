import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);

await Promise.allSettled(
  ['/api/orders?day=today', '/api/products/top', '/api/customers/returning'].map((path) =>
    fetch(path),
  ),
);
