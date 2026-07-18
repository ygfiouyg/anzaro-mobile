import type { MCPTool } from "../types";
export const githubRepoTreeTool: MCPTool = {
  name: "github_repo_tree", description: "شجرة ملفات repo كاملة (API حقيقي). استخدمها لما المستخدم يقول 'file tree' أو 'شجرة ملفات'.",
  parameters: { type: "object", properties: { repo: { type: "string", description: "" }, branch: { type: "string", description: "", default: "" }, recursive: { type: "boolean", description: "", default: true } }, required: ["repo"] },
  async execute(params) {
    const repo=String(params.repo||"").trim(); const branch=String(params.branch||"").trim(); const recursive=Boolean(params.recursive);
    if(!repo) return{success:false,error:"repo مطلوب"};
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo)) return{success:false,error:"repo بصيغة owner/name"};
    try {
      const token=process.env.GITHUB_TOKEN||""; const headers:Record<string,string>={Accept:"application/vnd.github+json","User-Agent":"DeltaAI-MCP/1.0",...(token?{Authorization:`Bearer ${token}`}:{})};
      let branchName=branch;
      if(!branchName) { const repoRes=await fetch(`https://api.github.com/repos/${repo}`,{headers,signal:AbortSignal.timeout(10000)}); if(repoRes.ok){const rd:any=await repoRes.json();branchName=rd.default_branch||"main";} else {branchName="main";} }
      const res=await fetch(`https://api.github.com/repos/${repo}/git/trees/${branchName}?recursive=${recursive?"1":"0"}`,{headers,signal:AbortSignal.timeout(15000)});
      if(res.status===404) return{success:false,error:`الـ branch "${branchName}" مش موجود`};
      if(!res.ok) return{success:false,error:`GitHub API error ${res.status}`};
      const data:any=await res.json();
      const tree=(data.tree||[]).map((t:any)=>({path:t.path,type:t.type,size:t.size||0,sha:t.sha?.slice(0,7)||""}));
      const stats={files:tree.filter((t:any)=>t.type==="blob").length,directories:tree.filter((t:any)=>t.type==="tree").length,symlinks:tree.filter((t:any)=>t.type==="commit").length,total:tree.length};
      const fileExtensions:Record<string,number>={}; tree.filter((t:any)=>t.type==="blob").forEach(t=>{const ext=t.path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()||"no-ext";fileExtensions[ext]=(fileExtensions[ext]||0)+1;});
      const topExtensions=Object.entries(fileExtensions).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([ext,count])=>({extension:ext,count}));
      return{success:true,data:{repo,branch:branchName,recursive,truncated:data.truncated||false,stats,top_file_types:topExtensions,tree:tree.slice(0,200),total_tree_items:tree.length,rate_limit_remaining:res.headers.get("x-ratelimit-remaining")||"?"}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
