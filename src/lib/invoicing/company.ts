/**
 * Seller identity printed on invoices. App constants, not DB — there is
 * exactly one company and these change ~never.
 *
 * !! PLACEHOLDERS: CVR, bank details, address and contact lines below need
 * the real values before the first invoice goes to a customer. The print
 * page shows a visible warning while any placeholder remains.
 */

export const COMPANY = {
  name: "Jensen Production ApS",
  addressLine1: "[gadenavn + nr.]",
  zipCity: "[postnr. by]",
  countryDa: "Danmark",
  countryEn: "Denmark",
  cvr: "[CVR-nr.]",
  email: "[faktura-email]",
  phone: "[telefon]",
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
