const assert = require("node:assert/strict");
const model = require("../poi-model.js");

const expected = {
  "湘菜": "food", "粤菜": "food", "云南菜": "food", "意大利菜": "food", "法国菜": "food",
  "江西菜": "food", "中式甜品": "food", "海南菜": "food", "川菜": "food", "咖啡": "food",
  "客家菜": "food", "潮州菜": "food", "浙江菜": "food", "上海菜": "food", "海鲜": "food",
  "吃的": "food", "喝的": "food", "gelato": "food", "寺庙": "culture", "书": "culture",
  "博物馆": "culture", "建筑": "culture", "公园": "outdoors", "观鸟": "outdoors",
  "酒店": "stay", "车站": "transport", "家": "life", "单位": "life"
};
for (const [name, group] of Object.entries(expected)) assert.equal(model.categoryGroup({ name }), group, name);
assert.equal(model.categoryGroup({ name: "新分类" }), "other");
assert.equal(model.categoryGroup({ name: "咖啡", groupId: "culture", detailType: "bookstore" }), "culture");
assert.equal(model.categoryDetailType({ name: "咖啡", groupId: "culture" }), "museum");
assert.equal(model.placeDetailType({ name: "黄鹤楼" }, { name: "寺庙" }), "architecture");
assert.equal(model.placeDetailType({ name: "宝通禅寺" }, { name: "寺庙" }), "temple");
assert.equal(model.placeDetailType({ name: "黄鹤楼", detailType: "temple" }, { name: "寺庙" }), "temple");

const legacy = model.normalizeEntries({ recommendation: { title: "烤鸭", photoFileId: "photo.jpg" } });
assert.equal(legacy[0].detailType, "dining");
assert.equal(legacy[0].photoFileId, "photo.jpg");
const bird = model.normalizeEntries({ recommendations: [{ title: "白鹭", detailType: "birding", photoFileId: "bird.jpg" }] });
assert.equal(bird[0].detailType, "birding");
assert.equal(bird[0].photoFileId, "bird.jpg");
assert.equal(model.normalizeEntries({ recommendations: Array.from({ length: 12 }, (_, i) => ({ title: String(i) })) }).length, 10);
assert.deepEqual(model.normalizeDetails({
  museum: { admission: "  预约入馆  ", duration: "2 小时", madeUp: "不要展示" },
  birding: { bestTime: "清晨", equipment: "望远镜" },
  unknown: { madeUp: "忽略" }
}), { museum: { admission: "预约入馆", duration: "2 小时" }, birding: { bestTime: "清晨", equipment: "望远镜" } });
console.log("POI model tests passed");
