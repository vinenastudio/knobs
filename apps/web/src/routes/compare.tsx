import { createFileRoute } from '@tanstack/react-router';
import { CompareLayout, CompareNotFound } from '../compare/layout.tsx';

export const Route = createFileRoute('/compare')({
  component: CompareLayout,
  notFoundComponent: CompareNotFound,
});
