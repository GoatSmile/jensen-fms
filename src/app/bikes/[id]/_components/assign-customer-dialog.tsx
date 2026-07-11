"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Combobox } from "@/components/ui/combobox";
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
  /** Disabled when the bike is terminal (retired / lost / archived). */
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
  /**
   * Current bike status — drives whether this dialog acts as "slating" (during
   * build) or "assigning at delivery" (in_stock → assigned). Status is the
   * source of truth for physical state; setting a customer never changes it
   * except in_stock → assigned, which has always been the delivery moment.
   */
  bikeStatus: string;
};

export function AssignCustomerDialog({
  bikeId,
  disabled,
  disabledReason,
  currentOwner,
  organizations,
  organizationUnits,
  bikeStatus,
}: Props) {
  // Build statuses use the dialog to "slate" a customer; in_stock + later
  // statuses do the real assignment. The copy flexes so the user can tell
  // which one they're doing.
  const isSlating = bikeStatus === "planning" || bikeStatus === "building";
  const t = useTranslations("bikeDetail.assign");
  const tStatus = useTranslations("bikeStatus");
  const tCommon = useTranslations("common");
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
      setError(t("pickACustomerError"));
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

  const triggerLabel = currentOwner
    ? t("changeCustomer")
    : isSlating
      ? t("slateFor")
      : t("assignTo");

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
            <DialogTitle>{triggerLabel}</DialogTitle>
            <DialogDescription>
              {isSlating
                ? t.rich("slateDesc", {
                    status: tStatus(bikeStatus),
                    em: (chunks) => <em>{chunks}</em>,
                  })
                : t.rich("assignDesc", {
                    em: (chunks) => <em>{chunks}</em>,
                  })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-org">{t("customer")}</Label>
            <Combobox
              id="assign-org"
              value={orgId}
              onValueChange={onOrgChange}
              options={organizations.map((o) => ({
                value: o.id,
                label: o.display_name ?? o.legal_name,
                sublabel: o.segment_name,
              }))}
              placeholder={t("pickCustomer")}
              searchPlaceholder={t("searchCustomers")}
              emptyMessage={t("noCustomersMatch")}
              emptyState={t("noActiveCustomers")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-unit">{t("subUnitOptional")}</Label>
            <Select
              value={unitId}
              onValueChange={setUnitId}
              disabled={!orgId || unitsForOrg.length === 0}
            >
              <SelectTrigger id="assign-unit">
                <SelectValue
                  placeholder={
                    !orgId
                      ? t("pickCustomerFirst")
                      : unitsForOrg.length === 0
                        ? t("noSubUnits")
                        : t("noSubUnit")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_UNIT}>{t("noSubUnit")}</SelectItem>
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
                <UserMinus aria-hidden /> {t("unassign")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={pending || !orgId}
            >
              {pending
                ? tCommon("saving")
                : currentOwner && orgId === currentOwner.organizationId
                  ? t("updateUnit")
                  : isSlating
                    ? t("slate")
                    : t("assign")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
