import type { MCPTool } from "../types";
export const githubCheckStarredTool: MCPTool = {
  name: "github_check_starred", description: "تحقق إذا كنت عملت star لـ repo (API حقيقي، محتاج token).",
  parameters: { type: "object", properties: { repo: { type: "string", description: "" } }, required: ["repo"] },
  async execute(params) {
    const repo=String(params.repo||"").trim();
    if(!repo) return{success:false,error:"repo مطلوب"};
    const token=process.env.GITHUB_TOKEN; if(!token) return{success:false,error:"GITHUB_TOKEN مطلوب"};
    try {
      const res=await fetch(`https://api.github.com/user/starred/${repo}`,{headers:{Accept:"application/vnd.github+json","User-Agent":"DeltaAI-MCP/1.0",Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      if(res.status===204) return{success:true,data:{repo,starred:true,message:`أنت عملت star لـ ${repo}`}};
      if(res.status===404) return{success:true,data:{repo,starred:false,message:`أنت مش عملت star لـ ${repo}`}};
      if(!res.ok) return{success:false,error:`GitHub API error ${res.status}`};
      return{success:true,data:{repo,starred:false}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
