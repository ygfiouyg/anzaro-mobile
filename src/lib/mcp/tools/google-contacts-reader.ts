/**
 * MCP Tool: Google Contacts Reader
 * ==================================
 * Searches the user's Google Contacts (People API) by name and returns
 * clean name/phone pairs.
 *
 * Endpoint: https://people.googleapis.com/v1/people:searchContacts
 * Scope:    https://www.googleapis.com/auth/contacts.readonly
 */

import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";

interface ContactPerson {
  resourceName?: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  phoneNumbers?: Array<{ value?: string; type?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
  birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
  biographies?: Array<{ value?: string }>;
  photos?: Array<{ url?: string }>;
}

interface SearchContactsResponse {
  results?: Array<{ person?: ContactPerson }>;
}

export const googleContactsReaderTool: MCPTool = {
  name: "google_contacts_reader",
  description:
    "ابحث في جهات اتصال Google (Contacts) بتاع المستخدم بالاسم وارجع الاسم + الهاتف + الإيميل + الوظيفة + الميلاد. " +
    "استخدمها لما المستخدم يقول «هاتلي رقم فلان» أو «ابحث عن إيميل فلان» أو «عند حد اسمه كذا؟». " +
    "بتشتغل بـ OAuth access_token (contacts.readonly scope).",

  parameters: {
    type: "object",
    properties: {
      search_name: {
        type: "string",
        description: "الاسم أو جزء منه للبحث عنه في جهات الاتصال (مثال: 'أحمد' أو 'John').",
      },
      max_results: {
        type: "number",
        description: "أقصى عدد نتائج ترجعها (افتراضي 10).",
        default: 10,
      },
      include_emails: {
        type: "boolean",
        description: "هل ترجع الإيميلات كمان؟ (افتراضي true).",
        default: true,
      },
      include_organizations: {
        type: "boolean",
        description: "هل ترجع الوظيفة/الشركة؟ (افتراضي false).",
        default: false,
      },
      include_birthdays: {
        type: "boolean",
        description: "هل ترجع تاريخ الميلاد؟ (افتراضي false).",
        default: false,
      },
    },
    required: ["search_name"],
  },

  async execute(params) {
    const query = String(params.search_name || "").trim();
    if (!query) {
      return { success: false, error: "لازم تدي search_name للبحث." };
    }

    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };

    // ── searchContacts requires a warm cache: Google docs say to call
    //    people:searchContacts first; if it returns nothing useful, fall
    //    back to listing connections. We do the direct search here.
    const max = Number(params.max_results) > 0 ? Math.min(Number(params.max_results), 50) : 10;
    const url = new URL("https://people.googleapis.com/v1/people:searchContacts");
    url.searchParams.set("query", query);
    const includeEmails = params.include_emails !== false;
    const includeOrgs = params.include_organizations === true;
    const includeBirthdays = params.include_birthdays === true;
    const readMask = ["names", "phoneNumbers"]
      .concat(includeEmails ? ["emailAddresses"] : [])
      .concat(includeOrgs ? ["organizations"] : [])
      .concat(includeBirthdays ? ["birthdays"] : [])
      .concat(["photos"])
      .join(",");
    url.searchParams.set("readMask", readMask);
    url.searchParams.set("pageSize", String(max));

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });

    if (!resp.ok) {
      return { success: false, error: await formatGoogleError(resp, "searchContacts") };
    }

    const data = (await resp.json()) as SearchContactsResponse;
    const results = data.results ?? [];

    // ── Flatten to clean name/phone pairs ────────────────────────────
    const contacts = results
      .map((r) => r.person)
      .filter((p): p is ContactPerson => !!p && (!!p.phoneNumbers?.length || (includeEmails && !!p.emailAddresses?.length)))
      .map((p) => {
        const name = p.names?.[0]?.displayName ?? "بدون اسم";
        const phones = (p.phoneNumbers ?? []).map((ph) => ph.value).filter((v): v is string => !!v);
        const entry: Record<string, unknown> = { name, phones, resource_name: p.resourceName ?? null };
        if (includeEmails) {
          entry.emails = (p.emailAddresses ?? []).map((e) => e.value).filter((v): v is string => !!v);
        }
        if (includeOrgs && p.organizations?.length) {
          entry.organization = p.organizations[0].name ?? null;
          entry.job_title = p.organizations[0].title ?? null;
        }
        if (includeBirthdays && p.birthdays?.length) {
          const bd = p.birthdays[0].date;
          entry.birthday = bd ? `${bd.year ?? ""}-${bd.month ?? ""}-${bd.day ?? ""}`.replace(/^--/, "") : null;
        }
        if (p.photos?.length && p.photos[0].url) {
          entry.photo = p.photos[0].url;
        }
        return entry;
      });

    if (contacts.length === 0) {
      return {
        success: true,
        data: {
          query,
          count: 0,
          contacts: [],
          note: `مفيش جهات اتصال مطابقة لـ "${query}" — أو إن جهات الاتصال ما عندهاش أرقام هاتف مسجلة.`,
          searched_by: auth.user?.email ?? null,
        },
      };
    }

    return {
      success: true,
      data: {
        query,
        count: contacts.length,
        contacts,
        searched_by: auth.user?.email ?? null,
      },
    };
  },
};

export default googleContactsReaderTool;
