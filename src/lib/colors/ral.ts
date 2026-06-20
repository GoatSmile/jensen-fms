/**
 * RAL Classic → approximate sRGB hex, so picking a RAL code on the colour form
 * can auto-fill the hex and the swatch shows a real colour everywhere a colour
 * is rendered. These are the widely-published sRGB approximations of the RAL
 * Classic fan deck — indicative, not a colour-managed match — and the hex stays
 * editable on the form. Not exhaustive: a RAL not listed here just leaves the
 * hex blank for the admin to paste.
 */
const RAL_CLASSIC_HEX: Record<string, string> = {
  "1000": "#BEBD7F", // Green beige
  "1001": "#C2B078", // Beige
  "1003": "#F9A800", // Signal yellow
  "1004": "#E2A300", // Golden yellow
  "1007": "#E88C00", // Daffodil yellow
  "1015": "#E6D2B5", // Light ivory
  "1018": "#F3DA0B", // Zinc yellow
  "1021": "#FAAB00", // Colza yellow
  "1023": "#F8F32B", // Traffic yellow
  "1028": "#FF9B00", // Melon yellow
  "2000": "#ED760E", // Yellow orange
  "2004": "#E25303", // Pure orange
  "2008": "#ED6B21", // Bright red orange
  "2009": "#DE5307", // Traffic orange
  "3000": "#AF2B1E", // Flame red
  "3001": "#A52019", // Signal red
  "3002": "#A2231D", // Carmine red
  "3003": "#9B111E", // Ruby red
  "3005": "#59191F", // Wine red
  "3011": "#781F19", // Brown red
  "3020": "#C1121C", // Traffic red
  "4005": "#6C4675", // Blue lilac
  "4008": "#924E7D", // Signal violet
  "5002": "#20214F", // Ultramarine blue
  "5003": "#1D1E33", // Sapphire blue
  "5004": "#181B24", // Black blue
  "5005": "#1E2460", // Signal blue
  "5009": "#22697C", // Azure blue
  "5010": "#0E294B", // Gentian blue
  "5012": "#3481B8", // Light blue
  "5015": "#2874B2", // Sky blue
  "5017": "#063971", // Traffic blue
  "6005": "#114232", // Moss green
  "6009": "#27352A", // Fir green
  "6011": "#6C7156", // Reseda green
  "6018": "#57A639", // Yellow green
  "6029": "#20603D", // Mint green
  "7001": "#8A9597", // Silver grey
  "7011": "#52595D", // Iron grey
  "7012": "#575D5E", // Basalt grey
  "7015": "#51565C", // Slate grey
  "7016": "#293133", // Anthracite grey
  "7021": "#23282B", // Black grey
  "7035": "#C5C7C4", // Light grey
  "7037": "#7D7F7D", // Dusty grey
  "7040": "#9DA1AA", // Window grey
  "7042": "#8D948D", // Traffic grey A
  "7043": "#4E5452", // Traffic grey B
  "8003": "#734222", // Clay brown
  "8011": "#5B3A29", // Nut brown
  "8014": "#382C1E", // Sepia brown
  "8016": "#45322E", // Mahogany brown
  "8017": "#403A3A", // Chocolate brown
  "8019": "#3E3B32", // Grey brown
  "9001": "#E9E0D2", // Cream
  "9002": "#D7D7D7", // Grey white
  "9003": "#ECECE7", // Signal white
  "9004": "#282828", // Signal black
  "9005": "#0A0A0A", // Jet black
  "9006": "#A5A5A5", // White aluminium
  "9007": "#8F8F8F", // Grey aluminium
  "9010": "#F7F9EF", // Pure white
  "9011": "#1C1C1C", // Graphite black
  "9016": "#F6F6F6", // Traffic white
  "9017": "#1E1E1E", // Traffic black
  "9018": "#CFD3CD", // Papyrus white
  "9023": "#787B7A", // Pearl dark grey
};

/**
 * Normalise a free-typed RAL code ("RAL 9005", "ral9005", "9005") to the bare
 * 4-digit classic number, then look up its approximate hex. Returns null when
 * unknown so the caller leaves the hex untouched.
 */
export function ralToHex(ralCode: string | null | undefined): string | null {
  if (!ralCode) return null;
  const digits = ralCode.replace(/[^0-9]/g, "");
  if (digits.length !== 4) return null;
  return RAL_CLASSIC_HEX[digits] ?? null;
}
