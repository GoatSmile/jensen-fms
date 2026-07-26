"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { submitGeneralReport } from "../_actions/submit-general-report";

export function GeneralReportForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ ticketNumber: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("phone", phone.trim());
    fd.set("email", email.trim());
    fd.set("organization", organization.trim());
    fd.set("description", description.trim());
    start(async () => {
      const r = await submitGeneralReport(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSubmitted({ ticketNumber: r.ticketNumber });
    });
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-3 rounded-md border bg-good-wash p-4 text-sm">
        <h3 className="font-semibold">Thanks — we&rsquo;ll be in touch.</h3>
        <p>
          Your message has been received. We&rsquo;ll contact you using the
          details you left.
        </p>
        <p className="text-muted-foreground font-mono text-xs">
          Reference: {submitted.ticketNumber}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gr-name">Your name</Label>
        <Input
          id="gr-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gr-phone">Phone</Label>
          <Input
            id="gr-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+45 12 34 56 78"
            autoComplete="tel"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gr-email">Email</Label>
          <Input
            id="gr-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.dk"
            autoComplete="email"
            className="font-mono"
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Leave at least one of phone or email so we can reach you.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gr-org">Where do you work? (optional)</Label>
        <Input
          id="gr-org"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="e.g. Sachsen-Hach Hospital"
          autoComplete="organization"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gr-description">What&rsquo;s going on?</Label>
        <Textarea
          id="gr-description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. I have a white bike that won't start. Can someone call me?"
          required
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
