import { createFileRoute } from '@tanstack/react-router';
import { knobPageHead, loadKnobPage } from '../use/head.ts';
import { UseNotFound, UsePageView } from '../use/layout.tsx';

// TanStack types head's loaderData from loader, so loader must come first (react-doctor
// tanstack-start-route-property-order); the key sort would put it after head.
// oxlint-disable perfectionist/sort-objects
export const Route = createFileRoute('/use/$slug')({
  loader: ({ params }) => loadKnobPage(params.slug),
  head: ({ loaderData, params }) => knobPageHead(loaderData, params.slug),
  component: UsePage,
  notFoundComponent: UseNotFound,
});
// oxlint-enable perfectionist/sort-objects

function UsePage() {
  const { slug } = Route.useParams();
  return <UsePageView slug={slug} />;
}
