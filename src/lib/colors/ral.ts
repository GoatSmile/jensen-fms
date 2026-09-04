/**
 * RAL Classic → approximate sRGB hex, so picking a RAL code on the colour form
 * can auto-fill the hex and the swatch shows a real colour everywhere a colour
 * is rendered. These are the widely-published sRGB approximations of the RAL
 * Classic fan deck (source: Wikipedia "List of RAL colours") — indicative, not
 * a colour-managed match.
 *
 * This is the *complete* RAL Classic deck, so any standard code the painter
 * (Metacoat) uses resolves to a swatch. Changing a value here only affects the
 * swatch fallback for RAL-only colours and future auto-fills — stored `hex`
 * values on existing `colors` rows are independent and untouched.
 */
const RAL_CLASSIC_HEX: Record<string, string> = {
  // 1xxx — yellows & beiges
  "1000": "#CDBA88", "1001": "#D0B084", "1002": "#D2AA6D", "1003": "#F9A800",
  "1004": "#E49E00", "1005": "#CB8E00", "1006": "#E29000", "1007": "#E88C00",
  "1011": "#AF804F", "1012": "#DDAF27", "1013": "#E3D9C6", "1014": "#DDC49A",
  "1015": "#E6D2B5", "1016": "#F1DD38", "1017": "#F6A950", "1018": "#FACA30",
  "1019": "#A48F7A", "1020": "#A08F65", "1021": "#F6B600", "1023": "#F7B500",
  "1024": "#BA8F4C", "1026": "#FFFF00", "1027": "#A77F0E", "1028": "#FF9B00",
  "1032": "#E2A300", "1033": "#F99A1C", "1034": "#EB9C52", "1035": "#908370",
  "1036": "#80643F", "1037": "#F09200",
  // 2xxx — oranges
  "2000": "#DD7907", "2001": "#BE4E20", "2002": "#C63927", "2003": "#FA842B",
  "2004": "#E75B12", "2005": "#FF2300", "2007": "#FFA421", "2008": "#F3752C",
  "2009": "#E15501", "2010": "#D4652F", "2011": "#EC7C25", "2012": "#DB6A50",
  "2013": "#954527", "2017": "#FA4402",
  // 3xxx — reds
  "3000": "#AB2524", "3001": "#A02128", "3002": "#A1232B", "3003": "#8D1D2C",
  "3004": "#701F29", "3005": "#5E2028", "3007": "#402225", "3009": "#703731",
  "3011": "#7E292C", "3012": "#CB8D73", "3013": "#9C322E", "3014": "#D47479",
  "3015": "#E1A6AD", "3016": "#AC4034", "3017": "#D3545F", "3018": "#D14152",
  "3020": "#C1121C", "3022": "#D56D56", "3024": "#F70000", "3026": "#FF0000",
  "3027": "#B42041", "3028": "#E72512", "3031": "#AC323B", "3032": "#711521",
  "3033": "#B24C43",
  // 4xxx — violets
  "4001": "#8A5A83", "4002": "#933D50", "4003": "#D15B8F", "4004": "#691639",
  "4005": "#83639D", "4006": "#992572", "4007": "#4A203B", "4008": "#904684",
  "4009": "#A38995", "4010": "#C63678", "4011": "#8773A1", "4012": "#6B6880",
  // 5xxx — blues
  "5000": "#384C70", "5001": "#1F4764", "5002": "#2B2C7C", "5003": "#2A3756",
  "5004": "#1D1F2A", "5005": "#154889", "5007": "#41678D", "5008": "#313C48",
  "5009": "#2E5978", "5010": "#13447C", "5011": "#232C3F", "5012": "#3481B8",
  "5013": "#232D53", "5014": "#6C7C98", "5015": "#2874B2", "5017": "#0E518D",
  "5018": "#21888F", "5019": "#1A5784", "5020": "#0B4151", "5021": "#07737A",
  "5022": "#2F2A5A", "5023": "#4D668E", "5024": "#6A93B0", "5025": "#296478",
  "5026": "#102C54",
  // 6xxx — greens
  "6000": "#327662", "6001": "#28713E", "6002": "#276235", "6003": "#4B573E",
  "6004": "#0E4243", "6005": "#0F4336", "6006": "#40433B", "6007": "#283424",
  "6008": "#35382E", "6009": "#26392F", "6010": "#3E753B", "6011": "#68825B",
  "6012": "#31403D", "6013": "#797C5A", "6014": "#444337", "6015": "#3D403A",
  "6016": "#026A52", "6017": "#468641", "6018": "#48A43F", "6019": "#B7D9B1",
  "6020": "#354733", "6021": "#86A47C", "6022": "#3E3C32", "6024": "#008754",
  "6025": "#53753C", "6026": "#005D52", "6027": "#81C0BB", "6028": "#2D5546",
  "6029": "#007243", "6032": "#0F8558", "6033": "#478A84", "6034": "#7FB0B2",
  "6035": "#1B542C", "6036": "#005D4C", "6037": "#25E712", "6038": "#00F700",
  "6039": "#00F700",
  // 7xxx — greys
  "7000": "#7E8B92", "7001": "#8F999F", "7002": "#817F68", "7003": "#7A7B6D",
  "7004": "#9EA0A1", "7005": "#6B716F", "7006": "#756F61", "7008": "#746643",
  "7009": "#5B6259", "7010": "#575D57", "7011": "#555D61", "7012": "#596163",
  "7013": "#555548", "7015": "#51565C", "7016": "#373F43", "7021": "#2E3234",
  "7022": "#4B4D46", "7023": "#818479", "7024": "#474A50", "7026": "#374447",
  "7030": "#939388", "7031": "#5D6970", "7032": "#B9B9A8", "7033": "#818979",
  "7034": "#939176", "7035": "#CBD0CC", "7036": "#9A9697", "7037": "#7C7F7E",
  "7038": "#B4B8B0", "7039": "#6B695F", "7040": "#9DA3A6", "7042": "#8F9695",
  "7043": "#4E5451", "7044": "#BDBDB2", "7045": "#91969A", "7046": "#82898E",
  "7047": "#CFD0CF", "7048": "#888175",
  // 8xxx — browns
  "8000": "#887142", "8001": "#9C6B30", "8002": "#7B5141", "8003": "#80542F",
  "8004": "#8F4E35", "8007": "#6F4A2F", "8008": "#6F4F28", "8011": "#5A3A29",
  "8012": "#673831", "8014": "#49392D", "8015": "#633A34", "8016": "#4C2F26",
  "8017": "#44322D", "8019": "#3F3A3A", "8022": "#211F20", "8023": "#A65E2F",
  "8024": "#79553C", "8025": "#755C49", "8028": "#4E3B2B", "8029": "#773C27",
  // 9xxx — whites & blacks
  "9001": "#EFEBDC", "9002": "#DDDED4", "9003": "#F4F8F4", "9004": "#2E3032",
  "9005": "#0A0A0D", "9006": "#A5A8A6", "9007": "#8F8F8C", "9010": "#F7F9EF",
  "9011": "#1C1C1C", "9012": "#FFFDE6", "9016": "#F7FBF5", "9017": "#2A2D2F",
  "9018": "#CFD3CD", "9022": "#858583", "9023": "#7E8182",
};

/**
 * Normalise a free-typed RAL code ("RAL 9005", "ral9005", "9005") to the bare
 * 4-digit classic number, then look up its approximate hex. Returns null when
 * unknown so the caller leaves the hex untouched.
 */
export function ralToHex(ralCode: string | null | undefined): string | null {
  const digits = normaliseRalCode(ralCode);
  return digits ? RAL_CLASSIC_HEX[digits] : null;
}

/**
 * The bare 4-digit form of a code that is actually IN the deck, or null.
 *
 * Storing the normalised form is what lets `colors.ral_code` be joined on at
 * all — "RAL 1006" and "1006" are the same colour and must not be two rows'
 * worth of different strings.
 */
export function normaliseRalCode(
  ralCode: string | null | undefined,
): string | null {
  if (!ralCode) return null;
  const digits = ralCode.replace(/[^0-9]/g, "");
  if (digits.length !== 4) return null;
  return digits in RAL_CLASSIC_HEX ? digits : null;
}

/**
 * Is this a real RAL Classic code?
 *
 * The reason this exists: a colour reached production named "RAL 5013" carrying
 * the code 2150, which is not a RAL code at all, and nothing objected — the
 * form took it as free text and `ralToHex` merely returned null, so the row
 * saved with a mismatched hex and went onto two orders. An unknown code is now
 * refused at the source.
 */
export function isRalCode(ralCode: string | null | undefined): boolean {
  return normaliseRalCode(ralCode) !== null;
}
