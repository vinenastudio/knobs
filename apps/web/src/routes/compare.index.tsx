import { createFileRoute } from '@tanstack/react-router';
import { compareIndexHead } from '../compare/head.ts';
import { CompareIndex } from '../compare/layout.tsx';

export const Route = createFileRoute('/compare/')({
  component: CompareIndex,
  head: compareIndexHead,
});
