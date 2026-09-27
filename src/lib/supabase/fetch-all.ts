/**
 * Read EVERY row of a query, in chunks of `chunk`.
 *
 * PostgREST caps a response at `max_rows` (Supabase's default: 1000) and says
 * nothing when it does — the rows past the cap simply are not there. A list
 * that loads "all bikes" in one request is correct at 900 bikes and quietly
 * wrong at 1100, which is exactly where the fleet import takes us. Use this for
 * the id-and-filter pass of a paged list (cheap columns only), then load the
 * full rows for one page by id.
 *
 * `make(from, to)` must build a FRESH query each call — a PostgREST builder is
 * consumed when awaited — and must carry a stable ORDER BY, or chunks can
 * overlap and skip.
 */
export async function fetchAllRows<T>(
  make: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  chunk = 1000,
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += chunk) {
    const { data, error } = await make(from, from + chunk - 1);
    if (error) return { data: all, error: error.message };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < chunk) return { data: all, error: null };
  }
}
