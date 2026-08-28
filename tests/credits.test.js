const assert = require("assert");

require("../credits.js");

const credits = globalThis.RestaurantCredits;

assert.ok(credits, "RestaurantCredits should be available");

const normalized = credits.normalize([
  { system: "blackpearl", year: 2025, distinction: "1-diamond" },
  { system: "米其林", year: 2025, distinction: "bib-gourmand" },
  { system: "michelin", year: 2024, distinction: "selected" },
  { system: "unknown", year: 2025 }
]);

assert.deepEqual(normalized.map((item) => item.system), ["michelin", "black-pearl"]);
assert.equal(normalized[0].label, "2025年米其林必比登入选");
assert.equal(normalized[1].label, "2025年黑珍珠一钻餐厅");

const beijingMatch = credits.forCandidate({
  name: "CAPARESH開府莱舍（国贸银泰店）",
  cityname: "北京市",
  address: "朝阳区银泰中心B1"
});
assert.deepEqual(beijingMatch.map((item) => item.system), [
  "michelin",
  "dianping-must-eat"
]);

const shenzhenNonMatch = credits.forCandidate({
  name: "CAPARESH開府莱舍（国贸银泰店）",
  cityname: "深圳市",
  address: "南山区"
});
assert.equal(shenzhenNonMatch.length, 0);

const savedShenzhenMatch = credits.forCandidate({
  name: "马旺子川小馆",
  address: "深圳市 · 南山区 · 科苑南路深圳湾万象城"
});
assert.equal(savedShenzhenMatch[0].label, "2021年大众点评必吃榜");

const directCredit = credits.forCandidate({
  name: "测试餐厅",
  address: "上海市",
  credits: [{ system: "black-pearl", year: 2026, distinction: "2-diamond" }]
});
assert.equal(directCredit[0].label, "2026年黑珍珠二钻餐厅");

console.log("Restaurant credits tests passed");
