/**
 * MCP Tool: Barcode Lookup
 * فك تشفير barcodes شائعة (EAN, UPC, ISBN) (محلي).
 */
import type { MCPTool } from "../types";

export const barcodeLookupTool: MCPTool = {
  name: "barcode_lookup",
  description: "فك تشفير barcodes EAN/UPC/ISBN (محلي). استخدمها لما المستخدم يقول 'barcode' أو 'باركود' أو 'EAN'.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "رقم الـ barcode" },
    },
    required: ["code"],
  },
  async execute(params) {
    const code = String(params.code || "").replace(/[\s-]/g, "");
    if (!code) return { success: false, error: "code مطلوب" };
    if (!/^\d+$/.test(code)) return { success: false, error: "barcode لازم أرقام" };

    try {
      const type = detectBarcodeType(code);
      const isValid = validateCheckDigit(code, type);

      let decoded: any = {
        code,
        type: type.name,
        type_full: type.fullName,
        length: code.length,
        valid: isValid,
        check_digit: code.slice(-1),
        main_number: code.slice(0, -1),
      };

      if (type.name === "EAN-13" || type.name === "UPC-A") {
        // GS1 prefix
        const prefix = code.slice(0, 3);
        decoded.country = getCountryFromGS1(prefix);
        decoded.gs1_prefix = prefix;
      }

      if (type.name === "ISBN-13") {
        decoded.isbn = code;
        decoded.registration_group = getISBNGroup(code.slice(3, 5));
      }

      if (type.name === "ISBN-10") {
        decoded.isbn = code;
      }

      return {
        success: true,
        data: decoded,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function detectBarcodeType(code: string): any {
  const len = code.length;
  const lastChar = code.slice(-1).toUpperCase();

  // ISBN-10 (last char can be X)
  const isbn10 = code.slice(0, 9) + lastChar;
  if (len === 10 && /^ISBN/i.test(isbn10) && /^[0-9X]+$/.test(code)) {
    return { name: "ISBN-10", fullName: "International Standard Book Number (10 digits)" };
  }
  if (len === 10 && /^[0-9]{9}[0-9X]$/i.test(code)) {
    return { name: "ISBN-10", fullName: "International Standard Book Number (10 digits)" };
  }

  // ISBN-13 (starts with 978 or 979)
  if (len === 13 && /^(978|979)/.test(code)) {
    return { name: "ISBN-13", fullName: "International Standard Book Number (13 digits)" };
  }

  // EAN-13
  if (len === 13) {
    return { name: "EAN-13", fullName: "European Article Number (13 digits)" };
  }

  // EAN-8
  if (len === 8) {
    return { name: "EAN-8", fullName: "European Article Number (8 digits)" };
  }

  // UPC-A
  if (len === 12) {
    return { name: "UPC-A", fullName: "Universal Product Code (12 digits)" };
  }

  // UPC-E
  if (len === 6 || len === 7) {
    return { name: "UPC-E", fullName: "Universal Product Code (compressed)" };
  }

  return { name: "Unknown", fullName: "Unknown barcode type" };
}

function validateCheckDigit(code: string, type: any): boolean {
  if (type.name === "ISBN-10") {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(code[i]) * (10 - i);
    }
    const last = code[9].toUpperCase();
    sum += (last === "X" ? 10 : parseInt(last)) * 1;
    return sum % 11 === 0;
  }

  // EAN/UPC/ISBN-13: mod 10
  if (["EAN-13", "EAN-8", "UPC-A", "ISBN-13"].includes(type.name)) {
    let sum = 0;
    for (let i = 0; i < code.length - 1; i++) {
      const digit = parseInt(code[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(code[code.length - 1]);
  }

  return false;
}

function getCountryFromGS1(prefix: string): string {
  const p = parseInt(prefix);
  const ranges: Array<[number, number, string]> = [
    [0, 139, "USA & Canada"],
    [300, 379, "France"],
    [380, 380, "Bulgaria"],
    [383, 383, "Slovenia"],
    [385, 385, "Croatia"],
    [387, 387, "Bosnia"],
    [400, 440, "Germany"],
    [450, 459, "Japan"],
    [460, 469, "Russia"],
    [470, 470, "Kyrgyzstan"],
    [471, 471, "Taiwan"],
    [474, 474, "Estonia"],
    [475, 475, "Latvia"],
    [476, 476, "Azerbaijan"],
    [477, 477, "Lithuania"],
    [478, 478, "Uzbekistan"],
    [479, 479, "Sri Lanka"],
    [480, 480, "Philippines"],
    [481, 481, "Belarus"],
    [482, 482, "Ukraine"],
    [484, 484, "Moldova"],
    [485, 485, "Armenia"],
    [486, 486, "Georgia"],
    [487, 487, "Kazakhstan"],
    [489, 489, "Hong Kong"],
    [500, 509, "UK"],
    [520, 521, "Greece"],
    [528, 528, "Lebanon"],
    [529, 529, "Cyprus"],
    [531, 531, "Macedonia"],
    [535, 535, "Malta"],
    [539, 539, "Ireland"],
    [540, 549, "Belgium & Luxembourg"],
    [560, 560, "Portugal"],
    [569, 569, "Iceland"],
    [570, 579, "Denmark"],
    [590, 590, "Poland"],
    [594, 594, "Romania"],
    [599, 599, "Hungary"],
    [600, 601, "South Africa"],
    [603, 603, "Ghana"],
    [608, 608, "Bahrain"],
    [609, 609, "Mauritius"],
    [611, 611, "Morocco"],
    [613, 613, "Algeria"],
    [616, 616, "Kenya"],
    [618, 618, "Ivory Coast"],
    [619, 619, "Tunisia"],
    [621, 621, "Syria"],
    [622, 622, "Egypt"],
    [624, 624, "Libya"],
    [625, 625, "Jordan"],
    [626, 626, "Iran"],
    [627, 627, "Kuwait"],
    [628, 628, "Saudi Arabia"],
    [629, 629, "UAE"],
    [640, 649, "Finland"],
    [690, 699, "China"],
    [700, 709, "Norway"],
    [729, 729, "Israel"],
    [730, 739, "Sweden"],
    [740, 740, "Guatemala"],
    [741, 741, "El Salvador"],
    [742, 742, "Honduras"],
    [743, 743, "Nicaragua"],
    [744, 744, "Costa Rica"],
    [745, 745, "Panama"],
    [746, 746, "Dominican Republic"],
    [750, 750, "Mexico"],
    [754, 755, "Canada"],
    [759, 759, "Venezuela"],
    [760, 769, "Switzerland"],
    [770, 770, "Colombia"],
    [773, 773, "Uruguay"],
    [775, 775, "Peru"],
    [777, 777, "Bolivia"],
    [779, 779, "Argentina"],
    [780, 780, "Chile"],
    [784, 784, "Paraguay"],
    [786, 786, "Ecuador"],
    [789, 790, "Brazil"],
    [800, 839, "Italy"],
    [840, 849, "Spain"],
    [850, 850, "Cuba"],
    [858, 858, "Slovakia"],
    [859, 859, "Czech Republic"],
    [860, 860, "Serbia"],
    [865, 865, "Mongolia"],
    [867, 867, "North Korea"],
    [868, 869, "Turkey"],
    [870, 879, "Netherlands"],
    [880, 880, "South Korea"],
    [884, 884, "Cambodia"],
    [885, 885, "Thailand"],
    [888, 888, "Singapore"],
    [890, 890, "India"],
    [893, 893, "Vietnam"],
    [896, 896, "Pakistan"],
    [899, 899, "Indonesia"],
    [900, 919, "Austria"],
    [930, 939, "Australia"],
    [940, 949, "New Zealand"],
    [950, 950, "GS1 HQ"],
    [955, 955, "Malaysia"],
    [958, 958, "Macau"],
  ];

  for (const [start, end, country] of ranges) {
    if (p >= start && p <= end) return country;
  }
  return "Unknown";
}

function getISBNGroup(code: string): string {
  const groups: Record<string, string> = {
    "0": "English speaking countries",
    "1": "English speaking countries",
    "2": "French speaking countries",
    "3": "German speaking countries",
    "4": "Japan",
    "5": "Russian speaking countries",
    "7": "China",
    "80": "Czech Republic & Slovakia",
    "82": "Norway",
    "83": "Poland",
    "84": "Spain",
    "85": "Brazil",
    "87": "Denmark",
    "88": "Italy",
    "89": "Korea",
    "90": "Netherlands",
    "91": "Sweden",
    "92": "International (UN, EU)",
    "93": "India",
    "94": "Netherlands",
    "977": "Egypt",
    "978": "Arabic speaking countries",
    "9954": "Algeria",
    "9957": "Saudi Arabia",
    "9960": "Syria",
    "9961": "Tunisia",
    "9962": "Palestine",
    "9963": "Cyprus",
    "9964": "Morocco",
    "9966": "Kenya",
    "9967": "Kyrgyzstan",
    "9968": "Costa Rica",
    "9970": "Uganda",
    "9971": "Singapore",
    "9972": "Peru",
    "9973": "Tunisia (alternative)",
    "9974": "Uruguay",
    "9975": "Moldova",
    "9976": "Tanzania",
    "9977": "Costa Rica",
    "9978": "Ecuador",
    "9979": "Iceland",
    "9980": "Papua New Guinea",
    "9981": "Morocco (alternative)",
    "9982": "Zambia",
    "9983": "Gambia",
    "9984": "Latvia",
    "9985": "Estonia",
    "9986": "Lithuania",
    "9987": "Tanzania",
    "9988": "Ghana",
    "9989": "Macedonia",
    "99901": "Bahrain",
    "99902": "Gabon",
    "99903": "Mauritius",
    "99904": "Cape Verde",
    "99905": "Botswana",
    "99906": "Oman",
    "99908": "Malawi",
    "99909": "Maldives",
    "99910": "Lesotho",
    "99911": "Botswana",
    "99912": "Andorra",
    "99913": "Suriname",
    "99914": "Maldives",
    "99915": "Mauritania",
    "99916": "Haiti",
    "99917": "Bhutan",
    "99918": "Macao",
    "99919": "Benin",
    "99920": "Bolivia",
    "99921": "Kuwait",
    "99922": "Qatar",
    "99923": "Togo",
    "99924": "Jamaica",
    "99925": "Belize",
    "99926": "Senegal",
    "99927": "Cyprus (Turkish)",
    "99928": "Jordan",
    "99929": "Cuba",
    "99930": "Cambodia",
    "99931": "Madagascar",
    "99932": "Barbados",
    "99933": "Myanmar",
    "99934": "Aruba",
    "99935": "Zimbabwe",
    "99936": "Mali",
    "99937": "Trinidad & Tobago",
    "99938": "Sri Lanka",
    "99939": "Albania",
    "99940": "Namibia",
    "99941": "Niger",
    "99942": "Dominican Republic",
    "99943": "Reunion",
    "99944": "Mongolia",
    "99945": "Syria",
    "99946": "Malta",
    "99947": "Georgia",
    "99948": "Mozambique",
    "99949": "Congo",
    "99950": "Congo (DRC)",
    "99951": "Zimbabwe",
    "99952": "Honduras",
    "99953": "Liberia",
    "99954": "Myanmar",
    "99955": "Algeria (alternative)",
    "99956": "Nicaragua",
    "99957": "Lebanon",
    "99958": "St. Lucia",
    "99959": "Saudi Arabia",
    "99960": "Panama",
    "99961": "Mauritius",
    "99962": "Cyprus",
    "99963": "Ghana",
    "99964": "Kazakhstan",
    "99965": "Botswana",
    "99966": "Malawi",
    "99967": "Lesotho",
    "99968": "Angola",
    "99969": "Brunei",
    "99970": "Iran",
    "99971": "Afghanistan",
    "99972": "Nigeria",
    "99973": "Ethiopia",
    "99974": "Sudan",
    "99975": "Yemen",
    "99976": "Tajikistan",
    "99977": "Sri Lanka",
    "99978": "Uzbekistan",
    "99979": "Nigeria",
    "99980": "Azerbaijan",
    "99981": "Tunisia",
    "99982": "Syria",
    "99983": "Bulgaria",
    "99984": "Qatar",
    "99985": "Jordan",
    "99986": "Kenya",
    "99987": "Kuwait",
    "99988": "Malaysia",
    "99989": "Indonesia",
    "99990": "Uruguay",
    "99991": "Estonia",
    "99992": "Latvia",
    "99993": "Lithuania",
    "99994": "Slovenia",
    "99995": "Croatia",
    "99996": "Serbia",
    "99997": "Bosnia",
    "99998": "Montenegro",
    "99999": "Macedonia",
  };

  return groups[code] || "Unknown";
}
