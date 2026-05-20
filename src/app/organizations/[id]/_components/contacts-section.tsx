"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

import { archiveContact } from "../_actions/manage-contacts";
import {
  ContactDialog,
  EMPTY_CONTACT,
  type ContactDialogValues,
} from "./contact-dialog";

export type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  is_primary: boolean;
  notes: string | null;
};

type Props = {
  organizationId: string;
  rows: ContactRow[];
};

const LANGUAGE_LABEL: Record<string, string> = {
  da: "Dansk",
  en: "English",
};

function fullName(row: ContactRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean) as string[];
  return parts.join(" ").trim();
}

export function ContactsSection({ organizationId, rows }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingRow = useMemo(
    () => rows.find((r) => r.id === editingId) ?? null,
    [rows, editingId],
  );

  // The edit dialog reads from a row each time it opens; close on stale id.
  function handleEditOpenChange(next: boolean) {
    if (!next) setEditingId(null);
  }

  return (
    <section className="rounded-md border">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Contacts</h2>
          <span className="text-muted-foreground text-xs">
            {rows.length} {rows.length === 1 ? "contact" : "contacts"}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          Add contact
        </Button>
      </header>

      {error ? (
        <p className="text-destructive border-b px-4 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={UserRound}
            title="No contacts yet"
            description="Add the people you talk to at this customer — facilities, reception, billing."
          />
        </div>
      ) : (
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Language</TableHead>
                <TableHead className="w-[80px]">Primary</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ContactTableRow
                  key={row.id}
                  row={row}
                  onEdit={() => setEditingId(row.id)}
                  onError={setError}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ContactDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        organizationId={organizationId}
        initial={EMPTY_CONTACT}
      />
      {editingRow ? (
        <ContactDialog
          open={editingId !== null}
          onOpenChange={handleEditOpenChange}
          mode="edit"
          organizationId={organizationId}
          contactId={editingRow.id}
          initial={contactRowToValues(editingRow)}
        />
      ) : null}
    </section>
  );
}

function contactRowToValues(row: ContactRow): ContactDialogValues {
  return {
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    role: row.role ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    preferred_language: row.preferred_language ?? "",
    is_primary: row.is_primary,
    notes: row.notes ?? "",
  };
}

function ContactTableRow({
  row,
  onEdit,
  onError,
}: {
  row: ContactRow;
  onEdit: () => void;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  function runArchive() {
    onError(null);
    start(async () => {
      const r = await archiveContact(row.id);
      if (!r.ok) {
        onError(r.error);
        setConfirmArchive(false);
      } else {
        router.refresh();
      }
    });
  }

  const name = fullName(row);

  return (
    <TableRow>
      <TableCell className="text-sm">
        {name || (
          <span className="text-muted-foreground italic">No name</span>
        )}
      </TableCell>
      <TableCell className="hidden text-sm md:table-cell">
        {row.role ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-sm">
        {row.email ? (
          <a
            href={`mailto:${row.email}`}
            className="font-mono text-xs hover:underline"
          >
            {row.email}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden text-sm lg:table-cell">
        {row.phone ? (
          <a href={`tel:${row.phone}`} className="hover:underline">
            {row.phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden text-sm md:table-cell">
        {row.preferred_language
          ? (LANGUAGE_LABEL[row.preferred_language] ?? row.preferred_language)
          : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        {row.is_primary ? <Badge variant="success">Primary</Badge> : null}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Actions for ${name || "contact"}`}
              disabled={pending}
            >
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onEdit();
              }}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault();
                if (confirmArchive) runArchive();
                else setConfirmArchive(true);
              }}
            >
              {confirmArchive ? "Click again to confirm" : "Archive"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
