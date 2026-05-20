"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  assignBikeToCustomer,
  unassignBike,
} from "../_actions/assign-customer";

const NO_UNIT = "__no_unit__";

export type OrganizationOption = {
  id: string;
  legal_name: string;
  display_name: string | null;
  segment_name: string | null;
};

export type OrgUnitOption = {
  id: string;
  organization_id: string;
  name: string;
};

type Props = {
  bikeId: string;
  /** Disabled when the bike can't accept assignment (retired, building, …) */
  disabled?: boolean;
  disabledReason?: string;
  /** Current assignment, if any — used to label the trigger button. */
  currentOwner: {
    organizationId: string;
    organizationName: string;
    unitId: string | null;
    unitName: string | null;
  } | null;
  organizations: OrganizationOption[];
  /** Every active org-unit; we filter client-side on the picked org. */
  organizationUnits: OrgUnitOption[];
};

export function AssignCustomerDialog({
  bikeId,
  disabled,
  disabledReason,
  currentOwner,
  organizations,
  organizationUnits,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orgId, setOrgId] = useState(currentOwner?.organizationId ?? "");
  const [unitId, setUnitId] = useState(currentOwner?.unitId ?? NO_UNIT);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // When the dialog (re)opens, sync the inputs to the current assignment so
  // re-opening after a change shows the right starting state.
  function handleOpenChange(next: boolean) {
    if (next) {
      setOrgId(currentOwner?.organizationId ?? "");
      setUnitId(currentOwner?.unitId ?? NO_UNIT);
      setError(null);
    }
    setOpen(next);
  }

  const unitsForOrg = useMemo(
    () => organizationUnits.filter((u) => u.organization_id === orgId),
    [organizationUnits, orgId],
  );

  function onOrgChange(next: string) {
    setOrgId(next);
    // Reset unit when org changes — old unit doesn't belong here.
    if (next !== currentOwner?.organizationId) setUnitId(NO_UNIT);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!orgId) {
      setError("Pick a customer.");
      return;
    }
    start(async () => {
      const result = await assignBikeToCustomer(
        bikeId,
        orgId,
        unitId === NO_UNIT ? null : unitId,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  function onUnassign() {
    setError(null);
    start(async () => {
      const result = await unassignBike(bikeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  const triggerLabel = currentOwner ? "Change customer" : "Assign to customer";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <UserCheck aria-hidden /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {currentOwner ? "Change customer" : "Assign to customer"}
            </DialogTitle>
            <DialogDescription>
              The bike moves to <em>assigned</em> status and its{" "}
              <span className="font-mono text-xs">assigned_at</span> stamp is
              refreshed. Use &ldquo;Unassign&rdquo; if the bike is being
              returned to stock.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-org">Customer</Label>
            <Select value={orgId} onValueChange={onOrgChange}>
              <SelectTrigger id="assign-org">
                <SelectValue placeholder="Pick a customer…" />
              </SelectTrigger>
              <SelectContent>
                {organizations.length === 0 ? (
                  <div className="text-muted-foreground p-2 text-xs">
                    No active customers. Add one from the Customers page.
                  </div>
                ) : (
                  organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      <div className="flex flex-col">
                        <span>{o.display_name ?? o.legal_name}</span>
                        {o.segment_name ? (
                          <span className="text-muted-foreground text-xs">
                            {o.segment_name}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-unit">Sub-unit (optional)</Label>
            <Select
              value={unitId}
              onValueChange={setUnitId}
              disabled={!orgId || unitsForOrg.length === 0}
            >
              <SelectTrigger id="assign-unit">
                <SelectValue
                  placeholder={
                    !orgId
                      ? "Pick a customer first"
                      : unitsForOrg.length === 0
                        ? "No sub-units"
                        : "No sub-unit"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_UNIT}>No sub-unit</SelectItem>
                {unitsForOrg.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            {currentOwner ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onUnassign}
                disabled={pending}
                className="text-destructive hover:text-destructive sm:mr-auto"
              >
                <UserMinus aria-hidden /> Unassign
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !orgId}
            >
              {pending
                ? "Saving…"
                : currentOwner && orgId === currentOwner.organizationId
                  ? "Update unit"
                  : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
