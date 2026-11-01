// Business browsing groups, with geographic subregions. These are not visa jurisdictions.
export const locationGroups = [
  "Regions",
  "Southeast Asia",
  "East Asia",
  "South Asia",
  "Central Asia",
  "Oceania",
  "Europe",
  "Middle East",
  "Africa",
  "North America",
  "Latin America & Caribbean",
  "Other regions",
  "Coverage",
  "Cities and other locations",
];

export const locationRegions = [
  {
    id: "apac",
    label: "APAC",
    group: "Regions",
    aliases: ["Asia Pacific", "Asia-Pacific"],
  },
  {
    id: "emea",
    label: "EMEA",
    group: "Regions",
    aliases: ["Europe Middle East Africa", "Europe, Middle East and Africa"],
  },
  { id: "americas", label: "Americas", group: "Regions", aliases: ["America"] },
  {
    id: "southeast-asia",
    label: "Southeast Asia",
    group: "Southeast Asia",
    aliases: [
      "SEA",
      "South East Asia",
      "South-Eastern Asia",
      "Southeastern Asia",
    ],
  },
  {
    id: "east-asia",
    label: "East Asia",
    group: "East Asia",
    aliases: ["Eastern Asia"],
  },
  {
    id: "south-asia",
    label: "South Asia",
    group: "South Asia",
    aliases: ["Southern Asia"],
  },
  {
    id: "central-asia",
    label: "Central Asia",
    group: "Central Asia",
    aliases: [],
  },
  { id: "oceania", label: "Oceania", group: "Oceania", aliases: [] },
  { id: "europe", label: "Europe", group: "Europe", aliases: [] },
  {
    id: "middle-east",
    label: "Middle East",
    group: "Middle East",
    aliases: ["Western Asia", "West Asia"],
  },
  { id: "africa", label: "Africa", group: "Africa", aliases: [] },
  {
    id: "north-america",
    label: "North America",
    group: "North America",
    aliases: ["Northern America"],
  },
  {
    id: "latam",
    label: "Latin America & Caribbean",
    group: "Latin America & Caribbean",
    aliases: ["LATAM", "Latin America", "Latin America and the Caribbean"],
  },
  { id: "asia", label: "Asia", group: "Other regions", aliases: [] },
  {
    id: "south-america",
    label: "South America",
    group: "Other regions",
    aliases: [],
  },
  {
    id: "anz",
    label: "Australia & New Zealand",
    group: "Other regions",
    aliases: ["ANZ", "Australia and New Zealand"],
  },
];

export function parentRegions(id: string): string[] {
  switch (id) {
    case "southeast-asia":
    case "east-asia":
    case "south-asia":
    case "central-asia":
      return ["apac", "asia"];
    case "anz":
      return ["oceania", "apac"];
    case "oceania":
      return ["apac"];
    case "europe":
    case "africa":
      return ["emea"];
    case "middle-east":
      return ["emea", "asia"];
    case "south-america":
      return ["latam", "americas"];
    case "north-america":
    case "latam":
      return ["americas"];
    default:
      return [];
  }
}

const inCodes = (country: string, codes: string) =>
  codes.split(" ").includes(country);
export function countryRegion(
  code: string,
  continent: string,
): string | undefined {
  if (inCodes(code, "BN KH ID LA MY MM PH SG TH TL VN"))
    return "southeast-asia";
  if (inCodes(code, "CN HK JP KP KR MO MN TW")) return "east-asia";
  if (inCodes(code, "AF BD BT IN MV NP PK LK")) return "south-asia";
  if (inCodes(code, "KZ KG TJ TM UZ")) return "central-asia";
  if (inCodes(code, "AM AZ BH CY GE IR IQ IL JO KW LB OM PS QA SA SY TR AE YE"))
    return "middle-east";
  if (inCodes(code, "AU NZ")) return "anz";
  if (continent === "EU") return "europe";
  if (continent === "AF") return "africa";
  if (continent === "OC") return "oceania";
  if (continent === "SA") return "south-america";
  if (continent === "NA")
    return inCodes(code, "US CA BM GL PM") ? "north-america" : "latam";
  if (continent === "AS") return "asia";
}
