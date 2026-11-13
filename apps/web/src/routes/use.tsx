import { createFileRoute } from '@tanstack/react-router';
import { UseLayout } from '../use/layout.tsx';

export const Route = createFileRoute('/use')({
  component: UseLayout,
});
