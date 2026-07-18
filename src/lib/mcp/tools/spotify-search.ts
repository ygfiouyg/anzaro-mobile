/**
 * MCP Tool: Spotify Search (via Spotify Web API)
 * تكامل حقيقي مع Spotify Web API.
 * محتاج SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.
 */
import type { MCPTool } from "../types";

export const spotifySearchTool: MCPTool = {
  name: "spotify_search",
  description: "بحث في Spotify (API حقيقي، محتاج credentials). استخدمها لما المستخدم يقول 'spotify' أو 'أغنية'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      type: { type: "string", description: "track, artist, album, playlist (افتراضي: track)", default: "track" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 20)", default: 5 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const type = String(params.type || "track").toLowerCase();
    const count = Math.min(20, Math.max(1, Number(params.count) || 5));

    if (!query) return { success: false, error: "query مطلوبة" };

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false, error: "SPOTIFY_CLIENT_ID و SPOTIFY_CLIENT_SECRET مطلوبين" };
    }

    try {
      // 1) Get access token
      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials" }),
        signal: AbortSignal.timeout(10000),
      });

      if (!tokenRes.ok) return { success: false, error: `Spotify auth error ${tokenRes.status}` };

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // 2) Search
      const validTypes = ["track", "artist", "album", "playlist"];
      const selType = validTypes.includes(type) ? type : "track";

      const params2 = new URLSearchParams({
        q: query,
        type: selType,
        limit: String(count),
      });

      const searchRes = await fetch(`https://api.spotify.com/v1/search?${params2.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!searchRes.ok) return { success: false, error: `Spotify search error ${searchRes.status}` };

      const searchData: any = await searchRes.json();
      const key = `${selType}s`;
      const items = searchData[key]?.items || [];

      const results = items.map((item: any) => {
        const base: any = {
          id: item.id,
          name: item.name || "",
          url: item.external_urls?.spotify || "",
          popularity: item.popularity || 0,
        };

        if (selType === "track") {
          base.artists = (item.artists || []).map((a: any) => a.name);
          base.album = item.album?.name || "";
          base.duration_ms = item.duration_ms || 0;
          base.duration_min = Math.round((item.duration_ms / 60000) * 100) / 100;
          base.preview_url = item.preview_url || null;
          base.cover = item.album?.images?.[0]?.url || null;
          base.release_date = item.album?.release_date || "";
        } else if (selType === "artist") {
          base.genres = item.genres || [];
          base.followers = item.followers?.total || 0;
          base.image = item.images?.[0]?.url || null;
        } else if (selType === "album") {
          base.artists = (item.artists || []).map((a: any) => a.name);
          base.release_date = item.release_date || "";
          base.total_tracks = item.total_tracks || 0;
          base.cover = item.images?.[0]?.url || null;
        } else if (selType === "playlist") {
          base.owner = item.owner?.display_name || "";
          base.tracks_count = item.tracks?.total || 0;
          base.description = item.description || "";
          base.cover = item.images?.[0]?.url || null;
        }

        return base;
      });

      return {
        success: true,
        data: {
          query,
          type: selType,
          total: searchData[key]?.total || 0,
          shown: results.length,
          results,
          source: "spotify.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
