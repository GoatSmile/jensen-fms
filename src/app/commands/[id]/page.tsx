/**
 * A dictated command's review page. Command rows live in inbound_messages
 * beside calls, and the detail page already renders both kinds (breadcrumbs
 * by kind, the same access rule), so this route shares it.
 */
export { default } from "@/app/calls/[id]/page";
