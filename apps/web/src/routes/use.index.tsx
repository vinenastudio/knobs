import { createFileRoute } from '@tanstack/react-router';
import { knobIndexHead } from '../use/head.ts';
import { UseIndex } from '../use/layout.tsx';

export const Route = createFileRoute('/use/')({
  component: UseIndex,
  head: knobIndexHead,
});
