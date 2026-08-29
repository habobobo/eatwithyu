const assert = require("assert");

require("../credits-data.js");

const data = globalThis.RestaurantCreditCatalogData;
assert.ok(data, "generated credit catalog should be available");
assert.ok(data.catalog.length > 600, "catalog should contain the six city/year lists");
assert.ok(data.catalog.every((entry) => entry.city && entry.names.length && entry.credits.length));

const expectedAudits = {
  "dianping-must-eat|2024|北京": [134, 137],
  "dianping-must-eat|2024|深圳": [79, 79],
  "dianping-must-eat|2025|北京": [141, 142],
  "dianping-must-eat|2025|深圳": [84, 84],
  "dianping-must-eat|2026|北京": [146, 146],
  "dianping-must-eat|2026|深圳": [85, 85],
  "michelin|2024|北京": [105, 105],
  "michelin|2024|深圳": [0, 0],
  "michelin|2025|北京": [101, 101],
  "michelin|2025|深圳": [0, 0],
  "michelin|2026|北京": [99, 99],
  "michelin|2026|深圳": [59, 59]
};

for (const audit of data.audits) {
  const key = `${audit.system}|${audit.year}|${audit.city}`;
  assert.deepEqual(
    [audit.importedCount, audit.publishedCount],
    expectedAudits[key],
    `unexpected audit count for ${key}`
  );
  delete expectedAudits[key];
}
assert.deepEqual(expectedAudits, {}, "every requested city/year audit should exist");

console.log("Restaurant credit data tests passed");
