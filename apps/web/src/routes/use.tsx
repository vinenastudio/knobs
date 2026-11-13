import { createFileRoute } from '@tanstack/react-router';
import { UseLayout, UseNotFound } from '../use/layout.tsx';

export const Route = createFileRoute('/use')({
  component: UseLayout,
  notFoundComponent: UseNotFound,
});
