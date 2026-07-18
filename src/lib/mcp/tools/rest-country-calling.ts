import type { MCPTool } from "../types";
export const restCountryCallingTool: MCPTool = {
  name: "rest_country_calling", description: "دول بكود اتصال (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'كود اتصال' أو 'calling code'.",
  parameters: { type: "object", properties: { code: { type: "string", description: "كود الاتصال (مثلاً: 20, 1, 44)" } }, required: ["code"] },
  async execute(params) {
    const code=String(params.code||"").trim().replace(/^\+/,"");
    if(!code) return{success:false,error:"code مطلوب"};
    try {
      const res=await fetch(`https://restcountries.com/v3.1/callingcode/${code}?fields=name,cca2,flag,capital,region,idd`,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
      if(res.status===404) return{success:false,error:`مفيش دول بكود +${code}`};
      if(!res.ok) return{success:false,error:`API error ${res.status}`};
      const data:any[]=await res.json();
      const countries=data.map((c:any)=>({name:c.name?.common||"",code:c.cca2||"",flag:c.flag||"",capital:c.capital?.[0]||"",region:c.region||"",calling_code:`+${code}`}));
      return{success:true,data:{calling_code:`+${code}`,total_countries:countries.length,countries,source:"restcountries.com"}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
