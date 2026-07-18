import type { MCPTool } from "../types";
export const githubCreateLabelTool: MCPTool = {
  name: "github_create_label", description: "إنشاء label في repo (API حقيقي، محتاج token).",
  parameters: { type: "object", properties: { repo: { type: "string", description: "" }, name: { type: "string", description: "" }, color: { type: "string", description: "" }, description: { type: "string", description: "" } }, required: ["repo", "name"] },
  async execute(params) {
    const repo = String(params.repo||"").trim(); const name = String(params.name||"").trim(); const color = String(params.color||"ededed").replace("#","").trim(); const desc = String(params.description||"").trim();
    if(!repo||!name) return {success:false,error:"repo و name مطلوبين"};
    const token = process.env.GITHUB_TOKEN; if(!token) return {success:false,error:"GITHUB_TOKEN مطلوب"};
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/labels`,{method:"POST",headers:{Accept:"application/vnd.github+json","User-Agent":"DeltaAI-MCP/1.0",Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({name,color,description:desc}),signal:AbortSignal.timeout(10000)});
      if(!res.ok){const e=await res.text().catch(()=> "");return{success:false,error:`GitHub API error ${res.status}: ${e.slice(0,200)}`}}
      const data:any=await res.json(); return{success:true,data:{id:data.id,name:data.name,color:`#${data.color}`,description:data.description,url:data.url}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
