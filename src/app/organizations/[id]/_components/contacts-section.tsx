"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Panel } from "@/components/ui/panel";

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

function fullName(row: ContactRow): string {
  const parts = [row.first_name, row.last_name].filter(Boolean) as string[];
  return parts.join(" ").trim();
}

export function ContactsSection({ organizationId, rows }: Props) {
  const t = useTranslations("contacts");
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingRow = useMemo(
    () => rows.find((r) => r.id === editingId) ?? null,
    [rows, editingId],
  );

  // Memoized because ContactDialog resets its form whenever `initial` changes
  // identity. Built inline in JSX it was a fresh object every render, so any
  // re-render of this section while the dialog was open wiped what the user
  // had typed.
  const editingValues = useMemo(
    () => (editingRow ? contactRowToValues(editingRow) : null),
    [editingRow],
  );

  // The edit dialog reads from a row each time it opens; close on stale id.
  function handleEditOpenChange(next: boolean) {
    if (!next) setEditingId(null);
  }

  return (
    <Panel
      title={t("title")}
      description={t("count", { count: rows.length })}
      action={
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          {t("addContact")}
        </Button>
      }
    >
      {error ? (
        <p className="text-destructive mb-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          inPanel
          icon={UserRound}
          title={t("emptyTitle")}
          description={t("emptyDesc")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thName")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("thRole")}
              </TableHead>
              <TableHead>{t("thEmail")}</TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("thPhone")}
              </TableHead>
              <TableHead className="hidden md:table-cell">
                {t("thLanguage")}
              </TableHead>
              <TableHead className="w-[80px]">{t("thPrimary")}</TableHead>
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
      )}

      <ContactDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="create"
        organizationId={organizationId}
        initial={EMPTY_CONTACT}
      />
      {editingRow && editingValues ? (
        <ContactDialog
          open={editingId !== null}
          onOpenChange={handleEditOpenChange}
          mode="edit"
          organizationId={organizationId}
          contactId={editingRow.id}
          initial={editingValues}
        />
      ) : null}
    </Panel>
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
  const t = useTranslations("contacts");
  const tCommon = useTranslations("common");
  const tLang = useTranslations("lang");
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
          <span className="text-muted-foreground italic">{t("noName")}</span>
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
        {row.preferred_language ? (
          tLang.has(row.preferred_language) ? (
            tLang(row.preferred_language)
          ) : (
            row.preferred_language
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.is_primary ? <Badge variant="success">{t("primary")}</Badge> : null}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("actionsFor", { name: name || t("contactFallback") })}
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
              {t("edit")}
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
              {confirmArchive ? tCommon("confirmRepeat") : t("archive")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
