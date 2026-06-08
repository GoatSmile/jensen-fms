import { Label } from "@/components/ui/label";

/**
 * Form field wrapper — label (+ optional required marker) over the control,
 * with an optional validation error beneath. The single shared version of the
 * `Field` that used to be copy-pasted across every form and dialog.
 */
export function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
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
