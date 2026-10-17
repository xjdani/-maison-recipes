interface Env { DB: D1Database; ASSETS: Fetcher; ACCESS_AUD?: string; ACCESS_TEAM_DOMAIN?: string; ALLOWED_EMAIL?: string }
type Recipe = { id: string; title: string; description: string; image: string; category: string; subcategory: string; image_credit?: string; prep_minutes: number; cook_minutes: number; servings: number; ingredients: unknown[]; steps: unknown[]; source_url: string; favorite: number; created_at?: string; updated_at?: string };
const fields = "id,title,description,image,image_credit,category,subcategory,prep_minutes,cook_minutes,servings,ingredients,steps,source_url,favorite,created_at,updated_at";
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
const FOOD_CATEGORIES = ["Desi Food", "Fast Food", "Foreign Food"] as const;
function classifyFood(title: string, category = ""): string {
  const text = (title + " " + category).toLowerCase();
  if (/\b(biryani|pulao|karahi|korma|qorma|nihari|haleem|daal|dal|saag|paratha|roti|chapati|tikka|seekh|chapli|pakora|samosa|chana|halwa|kheer|aloo|bhindi|palak|keema|qeema|kofta|handi|desi|pakistani|indian|lahori)\b/.test(text)) return "Desi Food";
  if (/\b(burger|pizza|fries|french fries|hot dog|sandwich|wrap|shawarma|nuggets|fried chicken|wings|taco|nachos|submarine|fast food|street food)\b/.test(text)) return "Fast Food";
  return "Foreign Food";
}
function validatedCategory(input: unknown): string {
  if (typeof input !== "string" || !FOOD_CATEGORIES.includes(input as typeof FOOD_CATEGORIES[number])) throw Error("Choose Desi Food, Fast Food, or Foreign Food.");
  return input;
}
const SUBCATEGORIES: Record<string,readonly string[]> = {
  "Desi Food":["Rice","Meat","Vegetables","BBQ","Desserts"],
  "Fast Food":["Burgers","Pizza","Wraps & Shawarma","Sandwiches","Sides & Snacks"],
  "Foreign Food":["Pasta","Baked Dishes","Rice & Noodles","Seafood","Breakfast & Brunch"]
};
function classifySubcategory(category:string,title:string):string {
 const t=title.toLowerCase();
 if(category==="Desi Food"){if(/biryani|pulao|rice|chawal/.test(t))return "Rice";if(/tikka|kebab|seekh|bbq|grill/.test(t))return "BBQ";if(/halwa|kheer|firni|dessert|mithai|shahi tuk/.test(t))return "Desserts";if(/daal|dal|aloo|palak|saag|bhindi|vegetable|paratha/.test(t))return "Vegetables";return "Meat";}
 if(category==="Fast Food"){if(/pizza/.test(t))return "Pizza";if(/shawarma|wrap|roll/.test(t))return "Wraps & Shawarma";if(/sandwich|club|sub/.test(t))return "Sandwiches";if(/fries|nugget|wings|snack/.test(t))return "Sides & Snacks";return "Burgers";}
 if(/pasta|spaghetti|alfredo|bolognese/.test(t))return "Pasta";if(/lasagna|bake|casserole/.test(t))return "Baked Dishes";if(/rice|noodle|ramen/.test(t))return "Rice & Noodles";if(/shrimp|prawn|fish|salmon|seafood/.test(t))return "Seafood";return "Breakfast & Brunch";
}
function safeRecipe(body: any): Recipe {
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.length > 250) throw Error("A recipe title is required");
  const foodCategory=validatedCategory(body.category);
  const subcategory=body.subcategory || classifySubcategory(foodCategory,body.title);
  if(!SUBCATEGORIES[foodCategory].includes(subcategory)) throw Error("Choose a valid subcategory.");
  return { id: typeof body.id === "string" ? body.id : crypto.randomUUID(), title: body.title.trim(), description: String(body.description || "").slice(0, 3000), image: String(body.image || "").slice(0, 2000), category: foodCategory, subcategory, prep_minutes: Math.max(0, Number(body.prep_minutes) || 0), cook_minutes: Math.max(0, Number(body.cook_minutes) || 0), servings: Math.max(1, Number(body.servings) || 4), ingredients: Array.isArray(body.ingredients) ? body.ingredients.slice(0, 200) : [], steps: Array.isArray(body.steps) ? body.steps.slice(0, 100) : [], source_url: String(body.source_url || "").slice(0, 2000), favorite: body.favorite ? 1 : 0 };
}

function recipeFromSchema(raw: unknown) {
  const candidates: any[] = [];
  function visit(value: any): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value["@type"] === "Recipe" || (Array.isArray(value["@type"]) && value["@type"].includes("Recipe"))) candidates.push(value);
    if (value["@graph"]) visit(value["@graph"]);
  }
  visit(raw);
  const r = candidates[0];
  if (!r || !r.name) throw Error("No valid Recipe schema found");
  const instructions: string[] = [];
  function steps(v: any): void {
    if (typeof v === "string") instructions.push(v);
    else if (Array.isArray(v)) v.forEach(steps);
    else if (v && typeof v === "object") { if (v.text) instructions.push(String(v.text)); else if (v.itemListElement) steps(v.itemListElement); }
  }
  steps(r.recipeInstructions);
  const img = Array.isArray(r.image) ? r.image[0] : r.image;
  return safeRecipe({title:r.name,description:r.description||"",image:typeof img==="string"?img:img?.url||"",category:classifyFood(String(r.name),String(Array.isArray(r.recipeCategory)?r.recipeCategory[0]:r.recipeCategory||"")),servings:parseInt(String(Array.isArray(r.recipeYield)?r.recipeYield[0]:r.recipeYield||4),10)||4,ingredients:(r.recipeIngredient||[]).map((v:string)=>({amount:0,unit:"",name:String(v)})),steps:instructions});
}


function cleanText(v: unknown): string {
  return String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|nbsp|lt|gt|#39);/g, x => ({"&amp;":"&","&quot;":'"',"&apos;":"'","&nbsp;":" ","&lt;":"<","&gt;":">","&#39;":"'"} as Record<string,string>)[x] || x).replace(/\s+/g," ").trim();
}
function parseRecipePage(html: string, source: string): Recipe {
  const scripts = [...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  let found: Recipe | null = null;
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]);
      const candidate = recipeFromSchema(parsed);
      if (candidate.ingredients.length && candidate.steps.length) {
        found = candidate;
        break;
      }
    } catch {}
  }
  if (!found) throw Error("This page does not expose a complete readable recipe. Try a different recipe website.");
  found.source_url = source;
  const normalized = (value: string) => { try { const url = new URL(value,source); return url.protocol === "https:" || url.protocol === "http:" ? url.href : ""; } catch { return ""; } };
  found.image = normalized(found.image);
  found.title = cleanText(found.title);
  found.description = cleanText(found.description);
  found.steps = (found.steps as string[]).map(cleanText).filter(Boolean);
  found.ingredients = (found.ingredients as Array<{amount:number;unit:string;name:string}>).map(i => ({amount: i.amount,unit:i.unit,name:cleanText(i.name)})).filter(i=>i.name);
  return found;
}
function checkedUrl(input: string): URL {
  if (typeof input !== "string" || input.length > 2048) throw Error("Paste a valid recipe website link.");
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw Error("Paste a complete HTTPS website URL."); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") || host.endsWith(".test") || host.endsWith(".invalid") || host.endsWith(".example") || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) throw Error("Only public HTTPS recipe websites are supported.");
  return u;
}
async function scanRecipe(link: string): Promise<Recipe> {
  const target = checkedUrl(link);
  const response = await fetch(target.toString(), { redirect: "manual", headers: { "Accept": "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(12000) });
  if (response.status >= 300 && response.status < 400) throw Error("The recipe site redirected this request. Paste the final recipe page URL.");
  if (!response.ok) throw Error("This website blocked access or the page is unavailable.");
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) throw Error("This link is not an HTML recipe page.");
  const limit = 1500000;
  if (Number(response.headers.get("content-length") || 0) > limit) throw Error("Recipe page is too large to scan.");
  const reader = response.body?.getReader();
  if (!reader) throw Error("Could not read recipe page.");
  let count = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    count += next.value.byteLength;
    if (count > limit) { await reader.cancel(); throw Error("Recipe page is too large to scan."); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(count);
  let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return parseRecipePage(new TextDecoder().decode(bytes),target.toString());
}


type CommonsCredit = { author: string; license: string; source: string; licenseUrl: string };
function stripMarkup(s:string):string { return s.replace(/<[^>]*>/g," ").replace(/&(?:amp|quot|lt|gt|nbsp|#39);/g,m=>({"&amp;":"&","&quot;":'"',"&lt;":"<","&gt;":">","&nbsp;":" ","&#39;":"'"} as Record<string,string>)[m]||m).replace(/\s+/g," ").trim().slice(0,250); }
async function discoverCommonsPhoto(title:string,diagnostics?:string[]):Promise<{image:string;credit:string}|null> {
  const searchTitle=title.replace(/\b(homemade|classic|pakistani|desi|dry|spicy|crispy|creamy)\b/gi,"").trim();
  const url=new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action","query");
  url.searchParams.set("generator","search");
  url.searchParams.set("gsrsearch",searchTitle+" filetype:bitmap");
  url.searchParams.set("gsrnamespace","6");
  url.searchParams.set("gsrlimit","12");
  url.searchParams.set("prop","imageinfo");
  url.searchParams.set("iiprop","url|extmetadata|size|mime");
  url.searchParams.set("iiurlwidth","900");
  url.searchParams.set("format","json");
  const response=await fetch(url.toString(),{headers:{"Accept":"application/json","User-Agent":"CookWithDaniel/1.0 (https://food.hasooleilm.org)"},signal:AbortSignal.timeout(9000)}); diagnostics?.push("Commons HTTP "+response.status);
  if(!response.ok)return null;
  const data=await response.json() as {query?:{pages?:Record<string,any>}};
  const pages=Object.values(data.query?.pages||{}); diagnostics?.push("Candidates "+pages.length);
  const terms=searchTitle.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(x=>x.length>=4&&!["with","and","recipe","style"].includes(x));
  for (const page of pages) {
    const info=page.imageinfo?.[0];
    if(!info||!info.thumburl||!info.url||!info.mime?.startsWith("image/")||info.width<500)continue;
    if(!new URL(info.thumburl).hostname.endsWith(".wikimedia.org"))continue;
    const fileTitle=String(page.title||"").toLowerCase().replace(/[_-]/g," ");
    if(!terms.length||!terms.some(w=>fileTitle.includes(w)))continue; diagnostics?.push("Title match "+fileTitle);
    const meta=info.extmetadata||{};
    const license=stripMarkup(meta.LicenseShortName?.value||"");
    if(!/^(cc by(?:-sa)?(?: [0-9.]+)?|cc0|public domain)/i.test(license))continue; diagnostics?.push("License "+license);
    const credit:CommonsCredit={author:stripMarkup(meta.Artist?.value||"Wikimedia Commons contributor"),license,source:String(info.descriptionurl||"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page.title)),licenseUrl:String(meta.LicenseUrl?.value||"")};
    return {image:String(info.thumburl),credit:JSON.stringify(credit)};
  }
  return null;
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

  if(request.method==="GET"&&url.pathname==="/api/maintenance/photo-backfill"){
    const token=url.searchParams.get("key")||"";
    if(token.length!==43)return json({error:"Forbidden"},403);
    const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
    const digest=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
    const grant=await env.DB.prepare("SELECT token_digest FROM photo_backfill_authorization WHERE id=1").first<{token_digest:string}>();
    if(!grant||grant.token_digest!==digest)return json({error:"Forbidden"},403);
    const rows=await env.DB.prepare("SELECT id,title FROM recipes WHERE (image='' OR image IS NULL) AND image_backfill_attempted=0 ORDER BY id LIMIT 12").all<{id:string;title:string}>();
    const results=await Promise.all((rows.results||[]).map(async row=>{
      try {
        const photo=await discoverCommonsPhoto(row.title);
        if(photo){
          await env.DB.prepare("UPDATE recipes SET image=?,image_credit=?,image_backfill_attempted=1 WHERE id=? AND (image='' OR image IS NULL)").bind(photo.image,photo.credit,row.id).run();
          return {id:row.id,title:row.title,found:true};
        }
        await env.DB.prepare("UPDATE recipes SET image_backfill_attempted=1 WHERE id=?").bind(row.id).run();
        return {id:row.id,title:row.title,found:false};
      }catch(e){return {id:row.id,title:row.title,error:String(e).slice(0,100)};}
    }));
    const remaining=await env.DB.prepare("SELECT COUNT(*) AS n FROM recipes WHERE (image='' OR image IS NULL) AND image_backfill_attempted=0").first<{n:number}>();
    return json({checked:results.length,added:results.filter(x=>x.found).length,remaining:remaining?.n||0,results});
  }
  const photoMatch=url.pathname.match(/^\/api\/recipe-photo\/([a-f0-9-]{36})$/);
  if(request.method==="GET"&&photoMatch){
    const id=photoMatch[1];
    const row=await env.DB.prepare("SELECT title,image,image_credit FROM recipes WHERE id=?").bind(id).first<{title:string;image:string;image_credit:string}>();
    if(!row)return json({error:"Not found"},404);
    if(row.image)return json({image:row.image,credit:row.image_credit||""});
    try {
      const diagnostics:string[]=[]; const photo=await discoverCommonsPhoto(row.title,diagnostics);
      if(!photo)return new Response(JSON.stringify({image:"",credit:"",...(url.searchParams.get("debug")==="1"?{diagnostics}:{})}),{headers:{"content-type":"application/json","cache-control":"public,max-age=86400"}});
      await env.DB.prepare("UPDATE recipes SET image=?,image_credit=? WHERE id=? AND (image='' OR image IS NULL)").bind(photo.image,photo.credit,id).run();
      return json(photo);
    }catch(e){return json({image:"",credit:"",...(url.searchParams.get("debug")==="1"?{error:String(e)}:{})});}
  }
  if (!url.pathname.startsWith("/api/admin/")) return json({ error: "Not found" }, 404);
  if (!(await owner(request, env))) return json({ error: "Unauthorized" }, 401);
  if (request.method === "GET" && url.pathname === "/api/admin/session") return url.searchParams.has("login") ? Response.redirect(new URL("/",request.url).toString(),302) : json({ admin: true });
  if (request.method === "POST" && url.pathname === "/api/admin/import-url") {
    try {
      const body = await request.json() as { url?: string };
      const recipe = await scanRecipe(body.url || "");
      recipe.id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO recipes (id,title,description,image,category,subcategory,prep_minutes,cook_minutes,servings,ingredients,steps,source_url,favorite) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(recipe.id,recipe.title,recipe.description,recipe.image,recipe.category,recipe.subcategory,recipe.prep_minutes,recipe.cook_minutes,recipe.servings,JSON.stringify(recipe.ingredients),JSON.stringify(recipe.steps),recipe.source_url,recipe.favorite).run();
      return json({ ...recipe, favorite: false },201);
    } catch (e) { return json({error: e instanceof Error ? e.message : "Recipe could not be imported."},400); }
  }
  if (request.method === "POST" && url.pathname === "/api/admin/import-schema") { try { const raw = await request.text(); if(raw.length>200000) return json({error:"Recipe data too large"},413); return json(recipeFromSchema(JSON.parse(raw))); } catch(e) { return json({error:String(e)},400); } }
  if (request.method === "POST" && url.pathname === "/api/admin/recipes") {
    try {
      const recipe = safeRecipe(await request.json());
      recipe.id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO recipes (id,title,description,image,category,subcategory,prep_minutes,cook_minutes,servings,ingredients,steps,source_url,favorite) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(recipe.id, recipe.title, recipe.description, recipe.image, recipe.category, recipe.subcategory, recipe.prep_minutes, recipe.cook_minutes, recipe.servings, JSON.stringify(recipe.ingredients), JSON.stringify(recipe.steps), recipe.source_url, recipe.favorite).run();
      return json(recipe, 201);
    } catch (e) { return json({ error: String(e) }, 400); }
  }
  const adminMatch = url.pathname.match(/^\/api\/admin\/recipes\/([a-f0-9-]{36})$/);
  if (adminMatch && request.method === "PUT") {
    try {
      const recipe = safeRecipe(await request.json());
      const result = await env.DB.prepare("UPDATE recipes SET title=?,description=?,image=?,category=?,subcategory=?,prep_minutes=?,cook_minutes=?,servings=?,ingredients=?,steps=?,source_url=?,favorite=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(recipe.title,recipe.description,recipe.image,recipe.category,recipe.subcategory,recipe.prep_minutes,recipe.cook_minutes,recipe.servings,JSON.stringify(recipe.ingredients),JSON.stringify(recipe.steps),recipe.source_url,recipe.favorite,adminMatch[1]).run();
      return result.meta.changes ? json({ ...recipe, id: adminMatch[1] }) : json({ error: "Not found" }, 404);
    } catch (e) { return json({ error: String(e) }, 400); }
  }
  if (adminMatch && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM recipes WHERE id=?").bind(adminMatch[1]).run();
    return json({ success: true });
  }
  return json({ error: "Not found" }, 404);
} };
