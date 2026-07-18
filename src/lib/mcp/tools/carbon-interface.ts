/**
 * MCP Tool: Carbon Interface
 * تكامل حقيقي مع Carbon Interface API (مجاني مع key).
 * بيحسب البصمة الكربونية للأنشطة.
 */
import type { MCPTool } from "../types";

export const carbonInterfaceTool: MCPTool = {
  name: "carbon_interface",
  description: "حساب البصمة الكربونية (API حقيقي). استخدمها لما المستخدم يقول 'carbon' أو 'بصمة كربونية' أو 'CO2'.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "نوع النشاط: electricity, flight, vehicle, shipping",
      },
      // electricity
      electricityValue: { type: "number", description: "كهرباء: قيمة الاستهلاك" },
      electricityUnit: { type: "string", description: "كهرباء: mwh, kwh (افتراضي: mwh)", default: "mwh" },
      country: { type: "string", description: "كهرباء: كود الدولة (مثلاً: us, eg)" },
      // vehicle
      distanceValue: { type: "number", description: "مركبة/رحلة: المسافة" },
      distanceUnit: { type: "string", description: "مركبة/رحلة: km, mi (افتراضي: km)", default: "km" },
      vehicleMake: { type: "string", description: "مركبة: الماركة (مثلاً: Toyota)" },
      vehicleModel: { type: "string", description: "مركبة: الموديل (مثلاً: Corolla)" },
    },
    required: ["type"],
  },
  async execute(params) {
    const type = String(params.type || "").toLowerCase();
    const apiKey = process.env.CARBON_INTERFACE_API_KEY;

    if (!apiKey) {
      return { success: false, error: "CARBON_INTERFACE_API_KEY مطلوب. احصل عليه من carboninterface.com" };
    }

    try {
      let body: any = {};

      if (type === "electricity") {
        body = {
          type: "electricity",
          electricity_value: Number(params.electricityValue) || 1,
          electricity_unit: String(params.electricityUnit || "mwh"),
          country: String(params.country || "us"),
        };
      } else if (type === "vehicle") {
        body = {
          type: "vehicle",
          distance_value: Number(params.distanceValue) || 100,
          distance_unit: String(params.distanceUnit || "km"),
          vehicle_model_id: await getVehicleModelId(apiKey, String(params.vehicleMake || "Toyota"), String(params.vehicleModel || "Corolla")),
        };
      } else if (type === "flight") {
        body = {
          type: "flight",
          distance_value: Number(params.distanceValue) || 1000,
          distance_unit: String(params.distanceUnit || "km"),
        };
      } else if (type === "shipping") {
        body = {
          type: "shipping",
          distance_value: Number(params.distanceValue) || 100,
          distance_unit: String(params.distanceUnit || "km"),
          weight_value: 1,
          weight_unit: "kg",
          transport_method: "truck",
        };
      } else {
        return { success: false, error: "type لازم: electricity, flight, vehicle, shipping" };
      }

      const res = await fetch("https://www.carboninterface.com/api/v1/estimates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `Carbon Interface error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();
      const attrs = data.data?.attributes || {};

      return {
        success: true,
        data: {
          id: data.data?.id || "",
          type: attrs.type || type,
          estimated_at: attrs.estimated_at || "",
          carbon_g: attrs.carbon_g || 0,
          carbon_kg: attrs.carbon_kg || 0,
          carbon_lb: attrs.carbon_lb || 0,
          carbon_mt: attrs.carbon_mt || 0,
          formatted: `${Math.round((attrs.carbon_kg || 0) * 100) / 100} kg CO2`,
          input: body,
          source: "carboninterface.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

async function getVehicleModelId(apiKey: string, make: string, model: string): Promise<string> {
  try {
    const res = await fetch("https://www.carboninterface.com/api/v1/vehicle_makes", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return "";

    const data: any = await res.json();
    const found = (data.data || []).find((m: any) => {
      const name = m.attributes?.name || "";
      return name.toLowerCase().includes(make.toLowerCase());
    });

    if (found) {
      // get models for this make
      const modelsRes = await fetch(`https://www.carboninterface.com/api/v1/vehicle_makes/${found.id}/vehicle_models`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (modelsRes.ok) {
        const modelsData: any = await modelsRes.json();
        const modelFound = (modelsData.data || []).find((m: any) => {
          const name = m.attributes?.name || "";
          return name.toLowerCase().includes(model.toLowerCase());
        });
        return modelFound?.id || "";
      }
    }
    return "";
  } catch {
    return "";
  }
}
