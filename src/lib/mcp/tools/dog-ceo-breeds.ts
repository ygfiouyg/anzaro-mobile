import type { MCPTool } from "../types";
export const dogCeoBreedsTool: MCPTool = {
  name: "dog_ceo_breeds", description: "قائمة كل سلالات الكلاب مع sub-breeds (API حقيقي، مجاني).",
  parameters: { type: "object", properties: {}, required: [] },
  async execute() {
    try {
      const res=await fetch("https://dog.ceo/api/breeds/list/all",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
      if(!res.ok) return{success:false,error:`Dog API error ${res.status}`};
      const data:any=await res.json();
      const breeds=Object.entries(data.message||{}).map(([breed,subs]:any)=>({breed,sub_breeds:subs as string[],has_sub_breeds:(subs as string[]).length>0,sub_breeds_count:(subs as string[]).length}));
      return{success:true,data:{total_breeds:breeds.length,breeds_with_sub:breeds.filter(b=>b.has_sub_breeds).length,total_sub_breeds:breeds.reduce((s,b)=>s+b.sub_breeds_count,0),breeds,source:"dog.ceo"}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
