import type { MCPTool } from "../types";
export const restCountrySubregionTool: MCPTool = {
  name: "rest_country_subregion", description: "دول بمنطقة فرعية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'subregion' أو 'شمال أفريقيا'.",
  parameters: { type: "object", properties: { subregion: { type: "string", description: "المنطقة الفرعية (مثلاً: Northern Africa, Western Europe, South-Eastern Asia)" } }, required: ["subregion"] },
  async execute(params) {
    const subregion=String(params.subregion||"").trim();
    if(!subregion) return{success:false,error:"subregion مطلوب"};
    try {
      const res=await fetch(`https://restcountries.com/v3.1/subregion/${encodeURIComponent(subregion)}?fields=name,cca2,flag,capital,population,area,region,subregion,latlng,maps`,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
      if(res.status===404) return{success:false,error:`المنطقة الفرعية "${subregion}" مش موجودة`};
      if(!res.ok) return{success:false,error:`API error ${res.status}`};
      const data:any[]=await res.json();
      const countries=data.map((c:any)=>({name:c.name?.common||"",code:c.cca2||"",flag:c.flag||"",capital:c.capital?.[0]||"",population:c.population||0,area_km2:c.area||0,density:c.area>0?Math.round((c.population/c.area)*10)/10:0,map:c.maps?.googleMaps||""})).sort((a,b)=>b.population-a.population);
      const totalPop=countries.reduce((s,c)=>s+c.population,0);
      return{success:true,data:{subregion,total_countries:countries.length,total_population:totalPop,countries,source:"restcountries.com"}};
    } catch(e:any){return{success:false,error:e.message}}
  },
};
