/**
 * MCP Tool: Random User Generator
 * تكامل حقيقي مع RandomUser API (مجاني، بدون API key).
 * بيولّد بيانات مستخدم وهمية للاختبار.
 */
import type { MCPTool } from "../types";

export const randomUserTool: MCPTool = {
  name: "random_user",
  description: "ولّد بيانات مستخدم وهمية للاختبار (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'random user' أو 'بيانات وهمية'.",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "عدد المستخدمين (افتراضي: 1، أقصى: 100)", default: 1 },
      gender: { type: "string", description: "male, female (اختياري)" },
      nationality: { type: "string", description: "كود الدولة (اختياري: us, gb, fr, de...)" },
      password: { type: "string", description: "أحرف كلمة المرور (مثلاً: upper,lower,special)" },
    },
    required: [],
  },
  async execute(params) {
    const count = Math.min(100, Math.max(1, Number(params.count) || 1));
    const gender = String(params.gender || "").toLowerCase().trim();
    const nationality = String(params.nationality || "").toLowerCase().trim();

    try {
      const params2 = new URLSearchParams({ results: String(count) });
      if (gender) params2.set("gender", gender);
      if (nationality) params2.set("nat", nationality);
      params2.set("inc", "gender,name,location,email,login,dob,registered,phone,cell,picture,nat");

      const res = await fetch(`https://randomuser.me/api/?${params2.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `RandomUser API error ${res.status}` };

      const data: any = await res.json();
      const users = (data.results || []).map((u: any) => ({
        gender: u.gender || "",
        name: {
          title: u.name?.title || "",
          first: u.name?.first || "",
          last: u.name?.last || "",
          full: `${u.name?.first || ""} ${u.name?.last || ""}`.trim(),
        },
        location: {
          street: u.location?.street ? `${u.location.street.number} ${u.location.street.name}` : "",
          city: u.location?.city || "",
          state: u.location?.state || "",
          country: u.location?.country || "",
          postcode: u.location?.postcode || "",
          coordinates: {
            latitude: u.location?.coordinates?.latitude || "",
            longitude: u.location?.coordinates?.longitude || "",
          },
          timezone: {
            offset: u.location?.timezone?.offset || "",
            description: u.location?.timezone?.description || "",
          },
        },
        email: u.email || "",
        login: {
          uuid: u.login?.uuid || "",
          username: u.login?.username || "",
          password: u.login?.password || "",
          salt: u.login?.salt || "",
          md5: u.login?.md5 || "",
          sha1: u.login?.sha1 || "",
          sha256: u.login?.sha256 || "",
        },
        dob: {
          date: u.dob?.date || "",
          age: u.dob?.age || 0,
        },
        registered: {
          date: u.registered?.date || "",
          age: u.registered?.age || 0,
        },
        phone: u.phone || "",
        cell: u.cell || "",
        id: {
          name: u.id?.name || "",
          value: u.id?.value || "",
        },
        picture: {
          large: u.picture?.large || "",
          medium: u.picture?.medium || "",
          thumbnail: u.picture?.thumbnail || "",
        },
        nationality: u.nat || "",
      }));

      return {
        success: true,
        data: {
          count: users.length,
          filters: {
            gender: gender || null,
            nationality: nationality || null,
          },
          seed: data.info?.seed || "",
          version: data.info?.version || "",
          users,
          source: "randomuser.me",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
