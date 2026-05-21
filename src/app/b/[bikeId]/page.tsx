import { redirect } from "next/navigation";

/**
 * Short alias for bike URLs printed on QR stickers.
 *
 *   https://jensen-fms.vercel.app/b/<bike-id>
 *
 * For now this just redirects to the workshop bike detail. M6 push #4
 * will replace the page body with a public-friendly bike summary + a
 * "Report a problem" form (no auth required), and the workshop detail
 * stays at /bikes/<id> reachable from a "Open in FMS" link on the
 * public page.
 *
 * Keeping the route here from push #2 onwards means stickers printed
 * today still resolve correctly the day push #4 ships.
 */
export default async function BikeShortlinkPage({
  params,
}: {
  params: Promise<{ bikeId: string }>;
}) {
  const { bikeId } = await params;
  redirect(`/bikes/${bikeId}`);
}
