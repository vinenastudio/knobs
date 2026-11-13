import { createFileRoute } from '@tanstack/react-router';
import { comparePageHead, loadComparePage } from '../compare/head.ts';
import { ComparePageView } from '../compare/layout.tsx';

// TanStack types head's loaderData from loader, so loader must come first (react-doctor
// tanstack-start-route-property-order); the key sort would put it after head.
// oxlint-disable perfectionist/sort-objects
export const Route = createFileRoute('/compare/$slug')({
  loader: ({ params }) => loadComparePage(params.slug),
  head: ({ loaderData, params }) => comparePageHead(loaderData, params.slug),
  component: ComparePage,
});
// oxlint-enable perfectionist/sort-objects

function ComparePage() {
  const { slug } = Route.useParams();
  return <ComparePageView slug={slug} />;
}
