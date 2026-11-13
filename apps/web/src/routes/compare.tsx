import { createFileRoute } from '@tanstack/react-router';
import { CompareLayout } from '../compare/layout.tsx';

export const Route = createFileRoute('/compare')({
  component: CompareLayout,
});
