import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://plat.dianping.com/mapi/shoprank/musteatfirstscreen.bin";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "data", "dianping-must-eat.json");

const editions = [
  { year: 2024, sceneId: 189, rankId: 122 },
  { year: 2025, sceneId: 250, rankId: 125 },
  { year: 2026, sceneId: 325, rankId: 136 }
];

const cities = [
  { id: 2, name: "北京" },
  { id: 7, name: "深圳" }
];

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function request(params) {
  const url = new URL(API);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": "eatwithyu-award-data/1.0"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchEditionCity(edition, city) {
  const common = {
    platform: 1,
    cityId: city.id,
    originCityId: city.id,
    sceneId: edition.sceneId,
    isFirstScreen: false,
    pageType: 1
  };
  const first = await request(common);
  if (Number(first.rankId) !== edition.rankId || Number(first.sceneId) !== edition.sceneId) {
    throw new Error(`Unexpected edition response for ${edition.year} ${city.name}`);
  }

  const ids = (first.shopIds || []).map(String);
  const batches = chunks(ids, 10);
  const shopById = new Map();

  for (let index = 0; index < batches.length; index += 4) {
    const group = batches.slice(index, index + 4);
    const responses = await Promise.all(group.map((batch) => request({
      ...common,
      topShopIds: batch.join(",")
    })));

    responses.forEach((payload, offset) => {
      const expected = group[offset];
      const returned = (payload.shopList || []).slice(0, expected.length);
      returned.forEach((shop) => shopById.set(String(shop.shopId), shop));
    });
  }

  const shops = ids.map((id) => shopById.get(id)).filter(Boolean).map((shop) => ({
    shopId: String(shop.shopId),
    shopUuid: shop.shopUuid || shop.uuid || "",
    name: shop.shopName || "",
    region: shop.mainRegionName || "",
    category: shop.mainCategoryName || "",
    inRankYear: Number(shop.inRankYear) || null,
    inRankYearText: shop.inRankYearText || ""
  }));

  const unresolvedShopIds = ids.filter((id) => !shopById.has(id));
  if (unresolvedShopIds.length) {
    process.stderr.write(
      `  ${unresolvedShopIds.length} inactive shops have IDs but no public detail payload.\n`
    );
  }

  return {
    year: edition.year,
    city: city.name,
    cityId: city.id,
    rankId: edition.rankId,
    sceneId: edition.sceneId,
    publicSourceUrl: `https://plat.dianping.com/app/femember-musteat-web/musteat-rank?cityid=${city.id}&ranktype=3`,
    retrievedAt: new Date().toISOString(),
    count: ids.length,
    resolvedCount: shops.length,
    unresolvedShopIds,
    shops
  };
}

const lists = [];
for (const edition of editions) {
  for (const city of cities) {
    process.stderr.write(`Fetching ${edition.year} ${city.name}...\n`);
    lists.push(await fetchEditionCity(edition, city));
  }
}

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify({ lists }, null, 2)}\n`, "utf8");
process.stdout.write(`${OUTPUT}\n`);
