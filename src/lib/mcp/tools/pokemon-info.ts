/**
 * MCP Tool: Pokemon Info
 * تكامل حقيقي مع PokeAPI (مجاني، بدون API key).
 * معلومات أي Pokémon بـ ID أو اسم.
 */
import type { MCPTool } from "../types";

export const pokemonInfoTool: MCPTool = {
  name: "pokemon_info",
  description: "معلومات أي Pokémon (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'pokemon' أو 'بوكيمون'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "اسم أو ID الـ Pokémon" },
    },
    required: ["name"],
  },
  async execute(params) {
    const name = String(params.name || "").toLowerCase().trim();
    if (!name) return { success: false, error: "name مطلوب" };

    try {
      // fetch pokemon + species in parallel
      const [pokemonRes, speciesRes] = await Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`, {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(name)}`, {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (pokemonRes.status === 404) {
        return { success: false, error: `Pokémon "${name}" مش موجود` };
      }
      if (!pokemonRes.ok) return { success: false, error: `PokeAPI error ${pokemonRes.status}` };

      const pokemon: any = await pokemonRes.json();
      const species: any = speciesRes.ok ? await speciesRes.json() : {};

      // find English flavor text
      let description = "";
      if (species.flavor_text_entries) {
        const entry = species.flavor_text_entries.find((e: any) => e.language?.name === "en");
        if (entry) {
          description = entry.flavor_text.replace(/[\n\r\f]/g, " ").replace(/\s+/g, " ").trim();
        }
      }

      // find genus
      let genus = "";
      if (species.genera) {
        const g = species.genera.find((e: any) => e.language?.name === "en");
        if (g) genus = g.genus;
      }

      return {
        success: true,
        data: {
          id: pokemon.id,
          name: pokemon.name,
          url: `https://www.pokemon.com/us/pokedex/${pokemon.name}`,
          sprites: {
            front_default: pokemon.sprites?.front_default || "",
            front_shiny: pokemon.sprites?.front_shiny || "",
            front_official: pokemon.sprites?.other?.["official-artwork"]?.front_default || "",
            dream_world: pokemon.sprites?.other?.dream_world?.front_default || "",
          },
          types: (pokemon.types || []).map((t: any) => t.type?.name).filter(Boolean),
          height: pokemon.height ? `${pokemon.height / 10} m` : "",
          weight: pokemon.weight ? `${pokemon.weight / 10} kg` : "",
          base_experience: pokemon.base_experience || 0,
          abilities: (pokemon.abilities || []).map((a: any) => ({
            name: a.ability?.name || "",
            is_hidden: a.is_hidden || false,
            slot: a.slot || 0,
          })),
          stats: (pokemon.stats || []).map((s: any) => ({
            name: s.stat?.name || "",
            base: s.base_stat || 0,
            effort: s.effort || 0,
          })),
          moves_count: (pokemon.moves || []).length,
          top_moves: (pokemon.moves || []).slice(0, 10).map((m: any) => m.move?.name).filter(Boolean),
          species: {
            genus,
            description,
            color: species.color?.name || "",
            shape: species.shape?.name || "",
            habitat: species.habitat?.name || "",
            generation: species.generation?.name || "",
            growth_rate: species.growth_rate?.name || "",
            is_legendary: species.is_legendary || false,
            is_mythical: species.is_mythical || false,
            is_baby: species.is_baby || false,
            capture_rate: species.capture_rate || 0,
            base_happiness: species.base_happiness || 0,
            hatch_counter: species.hatch_counter || 0,
            gender_rate: species.gender_rate ?? null,
            egg_groups: (species.egg_groups || []).map((e: any) => e.name),
          },
          cries: pokemon.cries ? {
            latest: pokemon.cries.latest || "",
            legacy: pokemon.cries.legacy || "",
          } : null,
          source: "pokeapi.co",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
