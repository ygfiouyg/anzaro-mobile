import type { MCPTool } from "../types";
export const githubRepoContentsTool: MCPTool = {
  name: "github_repo_contents", description: "محتويات repo (file tree) (API حقيقي).",
  parameters: { type: "object", properties: { repo: { type: "string", description: "" }, path: { type: "string", description: "", default: "" }, ref: { type: "string", description: "", default: "" } }, required: ["repo"] },
  async execute(params) {
    const repo=String(params.repo||"").trim(); const path=String(params.path||"").trim(); const ref=String(params.ref||"").trim();
    if(!repo) return{success:false,error:"repo مطلوب"};
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo)) return{success:false,error:"repo بصيغة owner/name"};
    try {
      const token=process.env.GITHUB_TOKEN||""; const headers:Record<string,string>={Accept:"application/vnd.github+json","User-Agent":"DeltaAI-MCP/1.0",...(token?{Authorization:`Bearer ${token}`}:{})};
      let url=`https://api.github.com/repos/${repo}/contents/${path}`;
      if(ref) url+=`?ref=${encodeURIComponent(ref)}`;
      const res=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
      if(res.status===404) return{success:false,error:"المسار مش موجود"};
      if(!res.ok) return{success:false,error:`GitHub API error ${res.status}`};
      const data:any=await res.json();
      if(Array.isArray(data)) {
        const contents=data.map((f:any)=>({name:f.name,path:f.path,type:f.type,size:f.size,sha:f.sha?.slice(0,7),url:f.html_url||""}));
        return{success:true,data:{repo,path: path||"/",total:contents.length,contents,rate_limit_remaining:res.headers.get("x-ratelimit-remaining")||"?"}};
      } else {
        return{success:true,data:{repo,path:data.path,type:data.type,size:data.size,encoding:data.encoding,content:(data.content||"").slice(0,2000),truncated:!!data.content&&(data.content.length>2000),sha:data.sha?.slice(0,7),url:data.html_url||""}};
      }
    } catch(e:any){return{success:false,error:e.message}}
  },
};
