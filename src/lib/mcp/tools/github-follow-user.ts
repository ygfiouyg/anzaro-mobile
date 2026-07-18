import type { MCPTool } from "../types";
export const githubFollowUserTool: MCPTool = {
  name: "github_follow_user", description: "متابعة user على GitHub (API حقيقي، محتاج token).",
  parameters: { type: "object", properties: { username: { type: "string", description: "" }, unfollow: { type: "boolean", description: "", default: false } }, required: ["username"] },
  async execute(params) {
    const username=String(params.username||"").trim(); const unfollow=Boolean(params.unfollow);
    if(!username) return{success:false,error:"username مطلوب"};
    const token=process.env.GITHUB_TOKEN; if(!token) return{success:false,error:"GITHUB_TOKEN مطلوب"};
    try {
      const method=unfollow?"DELETE":"PUT";
      const res=await fetch(`https://api.github.com/user/following/${encodeURIComponent(username)}`,{method,headers:{Accept:"application/vnd.github+json","User-Agent":"DeltaAI-MCP/1.0",Authorization:`Bearer ${token}`,"Content-Length":"0"},signal:AbortSignal.timeout(10000)});
      if(res.status===204) return{success:true,data:{username,action:unfollow?"unfollowed":"followed",message:unfollow?`تم إلغاء متابعة ${username}`:`تم متابعة ${username}`}};
      if(!res.ok) return{success:false,error:`GitHub API error ${res.status}`};
      return{success:true,data:{username,action:unfollow?"unfollowed":"followed"}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
