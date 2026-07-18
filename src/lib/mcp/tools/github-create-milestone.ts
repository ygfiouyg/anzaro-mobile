import type { MCPTool } from "../types";
export const githubCreateMilestoneTool: MCPTool = {
  name: "github_create_milestone", description: "إنشاء milestone في repo (API حقيقي، محتاج token).",
  parameters: { type: "object", properties: { repo: { type: "string", description: "" }, title: { type: "string", description: "" }, description: { type: "string", description: "" }, dueOn: { type: "string", description: "" } }, required: ["repo", "title"] },
  async execute(params) {
    const repo=String(params.repo||"").trim(); const title=String(params.title||"").trim(); const desc=String(params.description||"").trim(); const due=String(params.dueOn||"").trim();
    if(!repo||!title) return{success:false,error:"repo و title مطلوبين"};
    const token=process.env.GITHUB_TOKEN; if(!token) return{success:false,error:"GITHUB_TOKEN مطلوب"};
    try {
      const body:any={title,description:desc}; if(due)body.due_on=due;
      const res=await fetch(`https://api.github.com/repos/${repo}/milestones`,{method:"POST",headers:{Accept:"application/vnd.github+json","User-Agent":"DeltaAI-MCP/1.0",Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      if(!res.ok){const e=await res.text().catch(()=> "");return{success:false,error:`GitHub API error ${res.status}: ${e.slice(0,200)}`}}
      const data:any=await res.json(); return{success:true,data:{number:data.number,title:data.name,description:data.description,state:data.state,url:data.html_url,created_at:data.created_at}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
