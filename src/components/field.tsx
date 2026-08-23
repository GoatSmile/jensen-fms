import { Label } from "@/components/ui/label";

/**
 * Form field wrapper — label (+ optional required marker) over the control,
 * with an optional hint and validation error beneath. The single shared
 * version of the `Field` that used to be copy-pasted across every form and
 * dialog.
 *
 * The hint sits OUTSIDE the `Label` on purpose: `Label` is
 * `flex items-center gap-2`, so a hint nested inside it becomes a flex item
 * beside the label text rather than a line under the field.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string | null;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Read-only labelled value for detail pages — renders inside a `<dl>`. Shows a
 * muted "—" when empty; `multiline` preserves whitespace for notes/diagnoses.
 */
export function ReadField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">
        {value && value.trim() !== "" ? (
          multiline ? (
            <pre className="whitespace-pre-wrap font-sans text-sm">{value}</pre>
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground italic">—</span>
        )}
      </dd>
    </div>
  );
}
