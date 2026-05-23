"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Money } from "@/components/money";
import { SegmentedId } from "@/components/segmented-id";
import { formatDate } from "@/lib/parts/format";
import {
  OPEN_TICKET_STATUSES,
  type TicketStatus,
} from "@/lib/maintenance/ticket-status";
import {
  OPEN_WO_STATUSES,
  WO_STATUS_VARIANT,
  woStatusLabel,
  type WorkOrderStatus,
} from "@/lib/maintenance/work-order-status";

import { convertTicketToWO } from "@/app/maintenance/work-orders/_actions/save-wo";

export type WORowForTicket = {
  id: string;
  wo_number: string;
  status: WorkOrderStatus;
  is_billable: boolean;
  started_at: string | null;
  completed_at: string | null;
  parts_total_dkk: number;
};

type Props = {
  ticketId: string;
  ticketStatus: TicketStatus;
  rows: WORowForTicket[];
};

export function WorkOrdersForTicketSection({
  ticketId,
  ticketStatus,
  rows,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // Show the start button when:
  //   - the ticket is still in an early lifecycle (open/in_diagnosis/awaiting_parts), OR
  //   - no in-flight WO is already linked.
  const hasInFlight = rows.some((r) => OPEN_WO_STATUSES.includes(r.status));
  const showStart =
    OPEN_TICKET_STATUSES.includes(ticketStatus) && !hasInFlight;

  function onStart() {
    setError(null);
    start(async () => {
      const r = await convertTicketToWO(ticketId);
      if (r && !r.ok) {
        setError(r.error);
      } else {
        // convertTicketToWO redirects on success — fallback refresh if we
        // somehow land here without navigating.
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Work orders</h2>
          <p className="text-muted-foreground text-xs">
            Work orders that execute the work this ticket asks for. Completing
            one auto-resolves the ticket.
          </p>
        </div>
        {showStart ? (
          <Button size="sm" onClick={onStart} disabled={isPending}>
            <Plus aria-hidden /> {isPending ? "Starting…" : "Start work order"}
          </Button>
        ) : null}
      </header>
      <div className="p-4">
        {error ? (
          <p className="text-destructive mb-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <div className="text-muted-foreground flex h-20 items-center justify-center rounded-md border border-dashed text-sm">
            No work orders linked to this ticket yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Started</TableHead>
                  <TableHead className="hidden md:table-cell">Completed</TableHead>
                  <TableHead className="text-right">Parts total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((wo) => {
                  const href = `/maintenance/work-orders/${wo.id}`;
                  return (
                    <TableRow key={wo.id} className="hover:bg-muted/50">
                      <TableCell className="p-0 text-xs">
                        <Link href={href} className="block px-4 py-2.5">
                          <SegmentedId value={wo.wo_number} />
                        </Link>
                      </TableCell>
                      <TableCell className="p-0">
                        <Link href={href} className="block px-4 py-2.5">
                          <Badge
                            variant={WO_STATUS_VARIANT[wo.status] ?? "outline"}
                          >
                            {woStatusLabel(wo.status)}
                          </Badge>
                          {!wo.is_billable ? (
                            <Badge
                              variant="secondary"
                              className="ml-1.5 font-normal"
                            >
                              Covered
                            </Badge>
                          ) : null}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                        <Link href={href} className="block px-4 py-2.5">
                          {formatDate(wo.started_at)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden p-0 text-xs md:table-cell">
                        <Link href={href} className="block px-4 py-2.5">
                          {formatDate(wo.completed_at)}
                        </Link>
                      </TableCell>
                      <TableCell className="p-0 text-right tabular-nums">
                        <Link href={href} className="block px-4 py-2.5">
                          {wo.parts_total_dkk > 0 ? (
                            <Money
                              amount={wo.parts_total_dkk}
                              currency="DKK"
                              bold={false}
                            />
                          ) : (
                            "—"
                          )}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
