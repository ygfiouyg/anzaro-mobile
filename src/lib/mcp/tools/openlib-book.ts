import type { MCPTool } from "../types";
export const openlibBookTool: MCPTool = {
  name: "openlib_book", description: "تفاصيل كتاب كاملة بـ OL ID (API حقيقي، مجاني).",
  parameters: { type: "object", properties: { olId: { type: "string", description: "Open Library ID (مثلاً: OL27448W)" } }, required: ["olId"] },
  async execute(params) {
    const olId=String(params.olId||"").trim();
    if(!olId) return{success:false,error:"olId مطلوب"};
    try {
      const res=await fetch(`https://openlibrary.org/works/${olId}.json`,{headers:{Accept:"application/json","User-Agent":"DeltaAI-MCP/1.0"},signal:AbortSignal.timeout(15000)});
      if(res.status===404) return{success:false,error:`الكتاب "${olId}" مش موجود`};
      if(!res.ok) return{success:false,error:`Open Library error ${res.status}`};
      const data:any=await res.json();
      return{success:true,data:{title:data.title||"",description:(data.description||"").slice(0,500),subjects:data.subjects||[],authors:(data.authors||[]).map((a:any)=>({name:a.author?.key||"",url:a.author?.key||""})),covers:data.covers||[],links:(data.links||[]).map((l:any)=>({url:l.url,title:l.title})),created:data.created||"",last_modified:data.last_modified||"",url:`https://openlibrary.org/works/${olId}`,source:"openlibrary.org"}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
