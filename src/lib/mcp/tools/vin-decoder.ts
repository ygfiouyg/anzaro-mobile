/**
 * MCP Tool: VIN Decoder
 * فك تشفير VIN (Vehicle Identification Number) (محلي).
 */
import type { MCPTool } from "../types";

export const vinDecoderTool: MCPTool = {
  name: "vin_decoder",
  description: "فك تشفير VIN لسيارة (محلي). استخدمها لما المستخدم يقول 'vin' أو 'رقم سيارة'.",
  parameters: {
    type: "object",
    properties: {
      vin: { type: "string", description: "رقم الـ VIN (17 حرف)" },
    },
    required: ["vin"],
  },
  async execute(params) {
    const vin = String(params.vin || "").toUpperCase().trim();
    if (!vin) return { success: false, error: "vin مطلوب" };
    if (vin.length !== 17) return { success: false, error: "VIN لازم 17 حرف" };
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      return { success: false, error: "VIN فيه حروف غير صالحة (ممنوع: I, O, Q)" };
    }

    try {
      const decoded = decodeVIN(vin);
      const isValid = validateVINCheckDigit(vin);

      return {
        success: true,
        data: {
          vin,
          ...decoded,
          check_digit_valid: isValid,
          wmi: vin.slice(0, 3),
          vds: vin.slice(0, 8),
          vis: vin.slice(9, 17),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function decodeVIN(vin: string) {
  // WMI (World Manufacturer Identifier) - first 3 chars
  const wmi = vin.slice(0, 3);
  const manufacturer = WMI_MAP[wmi] || { manufacturer: "Unknown", country: getCountryFromWMI(wmi) };

  // VDS (Vehicle Descriptor Section) - positions 4-8
  const vds = vin.slice(3, 8);

  // VIS (Vehicle Identifier Section) - positions 10-17
  const vis = vin.slice(9, 17);

  // Model Year (position 10)
  const yearCode = vin[9];
  const modelYear = YEAR_CODES[yearCode] || "Unknown";

  // Assembly Plant (position 11)
  const plantCode = vin[10];

  // Sequential number (positions 12-17)
  const sequentialNumber = vin.slice(11, 17);

  return {
    country: manufacturer.country,
    manufacturer: manufacturer.manufacturer,
    model_year: modelYear,
    assembly_plant_code: plantCode,
    serial_number: sequentialNumber,
    vehicle_descriptor: vds,
    vehicle_identifier: vis,
  };
}

function getCountryFromWMI(wmi: string): string {
  const first = wmi[0];
  const codes: Record<string, string> = {
    A: "Africa", B: "Africa", C: "Africa", D: "Africa", E: "Africa",
    F: "Africa", G: "Africa", H: "Africa",
    J: "Asia", K: "Asia", L: "Asia", M: "Asia", N: "Asia", P: "Asia",
    R: "Asia", S: "Asia", T: "Asia", U: "Asia", V: "Asia", W: "Asia", X: "Asia",
    Y: "Asia", Z: "Asia",
    "1": "North America", "2": "North America", "3": "North America",
    "4": "North America", "5": "North America", "6": "North America", "7": "North America",
    "8": "South America", "9": "South America",
    "0": "Oceania",
  };
  return codes[first] || "Unknown";
}

const WMI_MAP: Record<string, { manufacturer: string; country: string }> = {
  "1FA": { manufacturer: "Ford", country: "USA" },
  "1FB": { manufacturer: "Ford", country: "USA" },
  "1FC": { manufacturer: "Ford", country: "USA" },
  "1FT": { manufacturer: "Ford Truck", country: "USA" },
  "1G1": { manufacturer: "Chevrolet", country: "USA" },
  "1G2": { manufacturer: "Pontiac", country: "USA" },
  "1G4": { manufacturer: "Buick", country: "USA" },
  "1GM": { manufacturer: "General Motors", country: "USA" },
  "1HG": { manufacturer: "Honda", country: "USA" },
  "1HZ": { manufacturer: "Honda", country: "USA" },
  "1J4": { manufacturer: "Jeep", country: "USA" },
  "1NW": { manufacturer: "Nissan", country: "USA" },
  "1VW": { manufacturer: "Volkswagen", country: "USA" },
  "2FA": { manufacturer: "Ford", country: "Canada" },
  "2FM": { manufacturer: "Ford", country: "Canada" },
  "2FT": { manufacturer: "Ford Truck", country: "Canada" },
  "2G1": { manufacturer: "Chevrolet", country: "Canada" },
  "2HG": { manufacturer: "Honda", country: "Canada" },
  "2HK": { manufacturer: "Honda", country: "Canada" },
  "2T": { manufacturer: "Toyota", country: "Canada" },
  "3FA": { manufacturer: "Ford", country: "Mexico" },
  "3VW": { manufacturer: "Volkswagen", country: "Mexico" },
  "JM1": { manufacturer: "Mazda", country: "Japan" },
  "JHM": { manufacturer: "Honda", country: "Japan" },
  "JHL": { manufacturer: "Honda", country: "Japan" },
  "JN1": { manufacturer: "Nissan", country: "Japan" },
  "JT1": { manufacturer: "Toyota", country: "Japan" },
  "JT2": { manufacturer: "Toyota", country: "Japan" },
  "JTM": { manufacturer: "Toyota", country: "Japan" },
  "JTH": { manufacturer: "Lexus", country: "Japan" },
  "JF1": { manufacturer: "Subaru", country: "Japan" },
  "JF2": { manufacturer: "Subaru", country: "Japan" },
  "WBA": { manufacturer: "BMW", country: "Germany" },
  "WBS": { manufacturer: "BMW M", country: "Germany" },
  "WDB": { manufacturer: "Mercedes-Benz", country: "Germany" },
  "WDC": { manufacturer: "Mercedes-Benz", country: "Germany" },
  "WDD": { manufacturer: "Mercedes-Benz", country: "Germany" },
  "WVW": { manufacturer: "Volkswagen", country: "Germany" },
  "WAU": { manufacturer: "Audi", country: "Germany" },
  "WP0": { manufacturer: "Porsche", country: "Germany" },
  "VF1": { manufacturer: "Renault", country: "France" },
  "VF3": { manufacturer: "Peugeot", country: "France" },
  "ZAM": { manufacturer: "Maserati", country: "Italy" },
  "ZAP": { manufacturer: "Piaggio", country: "Italy" },
  "ZDF": { manufacturer: "Ferrari", country: "Italy" },
  "ZFA": { manufacturer: "Fiat", country: "Italy" },
  "ZFF": { manufacturer: "Ferrari", country: "Italy" },
  "ZHW": { manufacturer: "Lamborghini", country: "Italy" },
  "SAL": { manufacturer: "Land Rover", country: "UK" },
  "SAR": { manufacturer: "Land Rover", country: "UK" },
  "SCA": { manufacturer: "Rolls-Royce", country: "UK" },
  "SCC": { manufacturer: "Lotus", country: "UK" },
  "SDB": { manufacturer: "Rover", country: "UK" },
  "SHH": { manufacturer: "Honda", country: "UK" },
  "SHS": { manufacturer: "Honda", country: "UK" },
  "TMB": { manufacturer: "Skoda", country: "Czech" },
  "TMK": { manufacturer: "Skoda", country: "Czech" },
  "VSS": { manufacturer: "Seat", country: "Spain" },
  "YS2": { manufacturer: "Scania", country: "Sweden" },
  "YS3": { manufacturer: "Saab", country: "Sweden" },
  "YV1": { manufacturer: "Volvo", country: "Sweden" },
  "YV4": { manufacturer: "Volvo", country: "Sweden" },
};

const YEAR_CODES: Record<string, string> = {
  A: "2010", B: "2011", C: "2012", D: "2013", E: "2014",
  F: "2015", G: "2016", H: "2017", J: "2018", K: "2019",
  L: "2020", M: "2021", N: "2022", P: "2023", R: "2024",
  S: "2025", T: "2026", V: "2027", W: "2028", X: "2029",
  Y: "2030",
  "1": "2001", "2": "2002", "3": "2003", "4": "2004", "5": "2005",
  "6": "2006", "7": "2007", "8": "2008", "9": "2009",
  "0": "2030 (or 2000)",
};

function validateVINCheckDigit(vin: string): boolean {
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2,
    T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  };

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const val = transliteration[ch];
    if (val === undefined) return false;
    sum += val * weights[i];
  }

  const checkDigit = sum % 11;
  const checkChar = checkDigit === 10 ? "X" : String(checkDigit);

  return vin[8] === checkChar;
}
