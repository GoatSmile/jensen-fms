/**
 * Seller identity printed on invoices. App constants, not DB — there is
 * exactly one company and these change ~never.
 *
 * Address and phone are the owner's real ones (2026-09-04). STILL PLACEHOLDER,
 * and needed before the first invoice goes to a customer: CVR number, invoice
 * email, and the three bank lines. The print page shows a visible warning while
 * ANY placeholder remains, so the banner stays until all five are in.
 */

export const COMPANY = {
  name: "Jensen Production ApS",
  addressLine1: "Ellekær 3",
  zipCity: "2730 Herlev",
  countryDa: "Danmark",
  countryEn: "Denmark",
  cvr: "[CVR-nr.]",
  email: "[faktura-email]",
  phone: "+45 70 21 05 46",
  bank: {
    name: "[bank]",
    regNumber: "[reg.nr.]",
    accountNumber: "[kontonr.]",
  },
} as const;

/** True while any placeholder value remains — drives the on-screen warning. */
export function companyDetailsIncomplete(): boolean {
  return JSON.stringify(COMPANY).includes("[");
}
