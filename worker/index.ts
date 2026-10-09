interface Env { DB: D1Database; ASSETS: Fetcher; ACCESS_AUD?: string; ACCESS_TEAM_DOMAIN?: string; ALLOWED_EMAIL?: string }
type Recipe = { id: string; title: string; description: string; image: string; category: string; prep_minutes: number; cook_minutes: number; servings: number; ingredients: unknown[]; steps: unknown[]; source_url: string; favorite: number; created_at?: string; updated_at?: string };
const fields = "id,title,description,image,category,prep_minutes,cook_minutes,servings,ingredients,steps,source_url,favorite,created_at,updated_at";
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function normalize(row: Record<string, unknown>) { return { ...row, ingredients: JSON.parse(String(row.ingredients || "[]")), steps: JSON.parse(String(row.steps || "[]")), favorite: Boolean(row.favorite) }; }
async function owner(request: Request, env: Env): Promise<boolean> {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN || !env.ALLOWED_EMAIL) return false;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  try {
    const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const jwks = await fetch("https://" + domain + "/cdn-cgi/access/certs").then(r => r.json()) as { keys: JsonWebKey[] };
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return false;
    const decode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
    const h = JSON.parse(new TextDecoder().decode(decode(header))) as { kid: string; alg: string };
    const p = JSON.parse(new TextDecoder().decode(decode(payload))) as { aud?: string[]; email?: string; iss?: string; exp?: number; nbf?: number };
    if (h.alg !== "RS256" || !p.aud?.includes(env.ACCESS_AUD) || p.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase() || p.iss !== "https://" + domain || !p.exp || p.exp <= Date.now() / 1000 || (p.nbf && p.nbf > Date.now() / 1000)) return false;
    const key = jwks.keys.find(k => (k as JsonWebKey & { kid?: string }).kid === h.kid);
    if (!key) return false;
    const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, decode(signature), new TextEncoder().encode(header + "." + payload));
  } catch { return false; }
}
function safeRecipe(body: any): Recipe {
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.length > 250) throw Error("A recipe title is required");
  return { id: typeof body.id === "string" ? body.id : crypto.randomUUID(), title: body.title.trim(), description: String(body.description || "").slice(0, 3000), image: String(body.image || "").slice(0, 2000), category: String(body.category || "Dinner").slice(0, 60), prep_minutes: Math.max(0, Number(body.prep_minutes) || 0), cook_minutes: Math.max(0, Number(body.cook_minutes) || 0), servings: Math.max(1, Number(body.servings) || 4), ingredients: Array.isArray(body.ingredients) ? body.ingredients.slice(0, 200) : [], steps: Array.isArray(body.steps) ? body.steps.slice(0, 100) : [], source_url: String(body.source_url || "").slice(0, 2000), favorite: body.favorite ? 1 : 0 };
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
  if (request.method === "GET" && url.pathname === "/api/recipes") {
    const rows = await env.DB.prepare("SELECT " + fields + " FROM recipes ORDER BY updated_at DESC").all();
    return json((rows.results || []).map(r => normalize(r as Record<string, unknown>)));
  }
  const match = url.pathname.match(/^\/api\/recipes\/([a-f0-9-]{36})$/);
  if (request.method === "GET" && match) {
    const row = await env.DB.prepare("SELECT " + fields + " FROM recipes WHERE id = ?").bind(match[1]).first();
    return row ? json(normalize(row as Record<string, unknown>)) : json({ error: "Not found" }, 404);
  }
  if (!url.pathname.startsWith("/api/admin/")) return json({ error: "Not found" }, 404);
  if (!(await owner(request, env))) return json({ error: "Unauthorized" }, 401);
  if (request.method === "GET" && url.pathname === "/api/admin/session") return json({ admin: true });
  if (request.method === "POST" && url.pathname === "/api/admin/recipes") {
    try {
      const recipe = safeRecipe(await request.json());
      recipe.id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO recipes (id,title,description,image,category,prep_minutes,cook_minutes,servings,ingredients,steps,source_url,favorite) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(recipe.id, recipe.title, recipe.description, recipe.image, recipe.category, recipe.prep_minutes, recipe.cook_minutes, recipe.servings, JSON.stringify(recipe.ingredients), JSON.stringify(recipe.steps), recipe.source_url, recipe.favorite).run();
      return json(recipe, 201);
    } catch (e) { return json({ error: String(e) }, 400); }
  }
  const adminMatch = url.pathname.match(/^\/api\/admin\/recipes\/([a-f0-9-]{36})$/);
  if (adminMatch && request.method === "PUT") {
    try {
      const recipe = safeRecipe(await request.json());
      const result = await env.DB.prepare("UPDATE recipes SET title=?,description=?,image=?,category=?,prep_minutes=?,cook_minutes=?,servings=?,ingredients=?,steps=?,source_url=?,favorite=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(recipe.title,recipe.description,recipe.image,recipe.category,recipe.prep_minutes,recipe.cook_minutes,recipe.servings,JSON.stringify(recipe.ingredients),JSON.stringify(recipe.steps),recipe.source_url,recipe.favorite,adminMatch[1]).run();
      return result.meta.changes ? json({ ...recipe, id: adminMatch[1] }) : json({ error: "Not found" }, 404);
    } catch (e) { return json({ error: String(e) }, 400); }
  }
  if (adminMatch && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM recipes WHERE id=?").bind(adminMatch[1]).run();
    return json({ success: true });
  }
  return json({ error: "Not found" }, 404);
} };
