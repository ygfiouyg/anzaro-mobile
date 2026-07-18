/**
 * MCP Tool: Moon Phase
 * حساب طور القمر لأي تاريخ (محلي، حسابي).
 */
import type { MCPTool } from "../types";

export const moonPhaseTool: MCPTool = {
  name: "moon_phase",
  description: "طور القمر لأي تاريخ (محلي). استخدمها لما المستخدم يقول 'قمر' أو 'moon phase' أو 'هلال'.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "التاريخ بصيغة YYYY-MM-DD (افتراضي: اليوم)" },
    },
    required: [],
  },
  async execute(params) {
    const dateStr = String(params.date || "").trim();
    let date: Date;
    if (dateStr) {
      date = new Date(dateStr);
      if (isNaN(date.getTime())) return { success: false, error: "صيغة تاريخ غير صحيحة" };
    } else {
      date = new Date();
    }

    try {
      const phase = calculateMoonPhase(date);
      const nextFullMoon = findNextPhase(date, "full");
      const nextNewMoon = findNextPhase(date, "new");

      return {
        success: true,
        data: {
          date: date.toISOString().split("T")[0],
          phase_name: phase.name,
          phase_name_ar: phase.nameAr,
          phase_number: phase.phase,
          illumination: phase.illumination,
          emoji: phase.emoji,
          age_days: phase.age,
          distance_km: phase.distance,
          angular_diameter: phase.angularDiameter,
          next_full_moon: nextFullMoon.toISOString().split("T")[0],
          next_new_moon: nextNewMoon.toISOString().split("T")[0],
          days_to_full: Math.round((nextFullMoon.getTime() - date.getTime()) / 86400000),
          days_to_new: Math.round((nextNewMoon.getTime() - date.getTime()) / 86400000),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function calculateMoonPhase(date: Date) {
  // Known new moon: 2000-01-06 18:14 UTC
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  const lunarCycle = 29.53058867; // days
  
  const diff = (date.getTime() - knownNewMoon) / 86400000; // days
  const age = ((diff % lunarCycle) + lunarCycle) % lunarCycle;
  const phase = age / lunarCycle; // 0-1

  let name: string, nameAr: string, emoji: string;
  
  if (phase < 0.03 || phase > 0.97) {
    name = "New Moon"; nameAr = "محاق"; emoji = "🌑";
  } else if (phase < 0.22) {
    name = "Waxing Crescent"; nameAr = "هلال متزايد"; emoji = "🌒";
  } else if (phase < 0.28) {
    name = "First Quarter"; nameAr = "تربيع أول"; emoji = "🌓";
  } else if (phase < 0.47) {
    name = "Waxing Gibbous"; nameAr = "أحدب متزايد"; emoji = "🌔";
  } else if (phase < 0.53) {
    name = "Full Moon"; nameAr = "بدر"; emoji = "🌕";
  } else if (phase < 0.72) {
    name = "Waning Gibbous"; nameAr = "أحدب متناقص"; emoji = "🌖";
  } else if (phase < 0.78) {
    name = "Last Quarter"; nameAr = "تربيع آخر"; emoji = "🌗";
  } else {
    name = "Waning Crescent"; nameAr = "هلال متناقص"; emoji = "🌘";
  }

  // illumination (0-1)
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * phase)) / 2 * 1000) / 10;

  // approximate distance (varies 363,300 - 405,500 km)
  const perigee = 363300;
  const apogee = 405500;
  const mean = (perigee + apogee) / 2;
  const variation = (apogee - perigee) / 2;
  // anomalistic period ~27.55 days
  const knownPerigee = new Date("2000-01-06T18:14:00Z").getTime();
  const anomCycle = 27.55454988;
  const anomAge = ((date.getTime() - knownPerigee) / 86400000 % anomCycle + anomCycle) % anomCycle;
  const distance = Math.round(mean - variation * Math.cos(2 * Math.PI * anomAge / anomCycle));

  const angularDiameter = Math.round((1737.4 * 2 / distance * 206265) * 100) / 100; // arcseconds

  return { name, nameAr, emoji, phase: Math.round(phase * 1000) / 1000, illumination, age: Math.round(age * 10) / 10, distance, angularDiameter };
}

function findNextPhase(date: Date, type: "full" | "new"): Date {
  const lunarCycle = 29.53058867;
  const knownNewMoon = new Date("2000-01-06T18:14:00Z").getTime();
  
  const targetPhase = type === "full" ? 0.5 : 0;
  
  for (let i = 0; i < 35; i++) {
    const testDate = new Date(date.getTime() + i * 86400000);
    const diff = (testDate.getTime() - knownNewMoon) / 86400000;
    const age = ((diff % lunarCycle) + lunarCycle) % lunarCycle;
    const phase = age / lunarCycle;
    
    const targetAge = targetPhase * lunarCycle;
    if (Math.abs(age - targetAge) < 0.5 || Math.abs(age - targetAge - lunarCycle) < 0.5) {
      return testDate;
    }
  }
  return new Date(date.getTime() + 30 * 86400000);
}
