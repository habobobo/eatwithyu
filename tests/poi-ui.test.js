// Run against a local preview. All cloud writes and map services are mocked.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const model = require("../poi-model.js");
const fixture = process.argv[2] ? require(process.argv[2]) : {
  title: "eatwithyu", version: 1, data: {
    categories: ["云南菜", "博物馆", "寺庙", "观鸟", "酒店", "车站", "家", "公园"].map((name, i) => ({ id: `category-${i}`, name, iconId: "icon-1" })),
    places: ["白老虎屯", "湖北省博物馆", "黄鹤楼", "沙湖公园", "亚朵酒店", "武汉站", "家", "解放公园"].map((name, i) => ({
      id: `place-${i}`, name, categoryId: `category-${i}`, longitude: 114.3 + i * .01, latitude: 30.5,
      ...(i === 0 ? { recommendations: [{ title: "旧推荐菜", photoFileId: "old-photo.jpg", photo: "https://assets.test/old-photo.jpg" }] } : {})
    })),
    icons: [{ id: "icon-1", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='12' fill='%239bc9ff'/%3E%3C/svg%3E" }]
  }
};

let testBrowser;
async function run() {
  const browser = testBrowser = await chromium.launch({ headless: true, ...(process.env.POI_TEST_BROWSER_PATH ? { executablePath: process.env.POI_TEST_BROWSER_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let stored = structuredClone(fixture.data);
  let version = fixture.version;
  let saves = 0;
  const errors = [];
  await context.addInitScript(() => {
    class Base {
      constructor(options) { this.options = options || {}; this.handlers = {}; }
      on(name, callback) { this.handlers[name] = callback; }
      emit(name, event) { this.handlers[name]?.(event); }
      setMap() {}
      getPosition() { return this.options.position; }
    }
    class FakeMap extends Base {
      constructor(id, options) { super(options); this.container = document.getElementById(id); }
      getZoom() { return this.options.zoom; }
      getContainer() { return this.container; }
      getCenter() { return { lng: 114.3, lat: 30.5 }; }
      setFeatures() {}
      addControl() {}
      setZoomAndCenter() {}
      setFitView() {}
      add() {}
      remove() {}
      resize() {}
    }
    class InfoWindow {
      setContent(content) { this.content = content; }
      open() {
        this.close();
        const host = document.createElement("div");
        host.id = "testInfoWindow";
        host.style.cssText = "position:fixed;right:30px;top:60px;z-index:80;background:white;border-radius:18px;box-shadow:0 8px 32px #0002;max-height:80vh;overflow:auto";
        host.innerHTML = this.content;
        document.body.appendChild(host);
      }
      close() { document.getElementById("testInfoWindow")?.remove(); }
    }
    window.AMap = { Map: FakeMap, Marker: Base, Pixel: Base, InfoWindow, PlaceSearch: Base, Scale: Base, ToolBar: Base };
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/config.js")) return route.fulfill({ contentType: "application/javascript", body: 'window.MAP_CONFIG={key:"test",securityJsCode:"test",defaultZoom:12,defaultCenter:[114.3,30.5]};window.SHARED_MAP_CONFIG={provider:"cloudbase",cloudbaseHttpEndpoint:"https://map.test/api",mapId:"beijing"};' });
    if (url === "https://map.test/api") {
      const body = route.request().postDataJSON();
      if (body.action === "save") {
        stored = structuredClone(body.data);
        version += 1;
        saves += 1;
      }
      const data = structuredClone(stored);
      data.places.forEach((place) => place.recommendations?.forEach((entry) => {
        if (entry.photoFileId) entry.photo = `https://assets.test/${entry.photoFileId}`;
      }));
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, title: fixture.title, data, version, editable: Boolean(body.editorToken) }) });
    }
    if (url.startsWith("https://webapi.amap.com") || url.startsWith("https://static.cloudbase.net")) return route.fulfill({ contentType: "application/javascript", body: "" });
    if (url.startsWith("http://127.0.0.1:8765")) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  page.on("dialog", (dialog) => dialog.accept());
  const url = "http://127.0.0.1:8765/?v=poi-test#edit=test-editor-token";
  await page.goto(url);
  await page.waitForSelector("#loading.hidden", { state: "attached", timeout: 10000 }).catch(async (error) => { console.error(await page.locator("#loading").innerText()); throw error; });
  const originalCount = fixture.data.places.length;
  assert.equal(await page.locator(".category-item").count(), fixture.data.categories.length);
  await page.locator(".category-group-tab").filter({ hasText: "文化" }).click();
  assert.ok(await page.locator("#savedPlaces .saved-item").count() < originalCount);
  assert.equal(await page.evaluate(() => markers.size), fixture.data.places.filter((p) => p.isMarked !== false && model.categoryGroup(fixture.data.categories.find((c) => c.id === p.categoryId) || { name: p.category }) === "culture").length);
  const cultureCount = await page.locator("#savedPlaces .saved-item").count();
  const museumCount = fixture.data.places.filter((p) => p.categoryId === fixture.data.categories.find((c) => c.name === "博物馆").id).length;
  await page.locator(".category-item").filter({ hasText: "博物馆" }).click();
  assert.equal(await page.locator("#savedPlaces .saved-item").count(), cultureCount - museumCount);
  await page.locator(".category-item").filter({ hasText: "博物馆" }).click();
  assert.equal(await page.locator("#savedPlaces .saved-item").count(), cultureCount);
  // Above browser callback uses the public model and hydrated categories.
  function findPlace(categoryName) {
    const c = fixture.data.categories.find((c) => c.name === categoryName);
    return fixture.data.places.find((p) => p.categoryId === c.id || p.category === categoryName);
  }
  const museum = findPlace("博物馆");
  await page.evaluate((id) => window.editSavedPlace(id), museum.id);
  assert.equal(await page.locator("#placeEntriesTitle").textContent(), "值得看的展览与藏品");
  await page.locator('[data-detail-field="admission"]').fill("提前预约，免费入馆");
  await page.locator('[data-detail-field="duration"]').fill("2–3 小时");
  await page.locator('[data-field="title"]').fill("曾侯乙编钟");
  await page.locator('[data-field="description"]').fill("先看常设展");
  await page.locator("#visitDate").fill("2026-10-02");
  await page.locator("#visitWithBtn").click();
  await page.locator("#visitCompanions").fill("朋友");
  await page.locator("#placeDetailTypeSelect").selectOption("birding");
  await page.locator('[data-detail-field="bestTime"]').fill("清晨");
  await page.locator('[data-field="title"]').fill("白鹭");
  await page.locator("#placeDetailTypeSelect").selectOption("");
  assert.equal(await page.locator('[data-detail-field="admission"]').inputValue(), "提前预约，免费入馆");
  assert.equal(await page.locator('[data-field="title"]').inputValue(), "曾侯乙编钟");
  await page.locator('#placeForm button[type="submit"]').click();
  await page.waitForFunction(() => document.getElementById("sharedStatus")?.dataset.state === "saved");
  assert.equal(stored.places.length, originalCount);
  const savedMuseum = stored.places.find((p) => p.id === museum.id);
  assert.equal(savedMuseum.detailsByType.museum.admission, "提前预约，免费入馆");
  assert.equal(savedMuseum.detailsByType.birding.bestTime, "清晨");
  assert.deepEqual(savedMuseum.recommendations.map((entry) => entry.detailType), ["museum", "birding"]);
  assert.equal(savedMuseum.visitRecord.companions, "朋友");
  await page.reload();
  await page.waitForSelector("#loading.hidden", { state: "attached" });
  await page.evaluate((id) => markers.get(id).emit("click"), museum.id);
  assert.ok((await page.locator("#testInfoWindow").innerText()).includes("提前预约，免费入馆"));
  assert.ok((await page.locator("#testInfoWindow").innerText()).includes("曾侯乙编钟"));
  assert.ok((await page.locator("#testInfoWindow").innerText()).includes("朋友"));
  assert.ok(!(await page.locator("#testInfoWindow").innerText()).includes("推荐菜"));
  await page.screenshot({ path: "/private/tmp/eatwithyu-poi-desktop.png" });

  const dining = fixture.data.places.find((p) => model.categoryGroup(fixture.data.categories.find((c) => c.id === p.categoryId) || { name: p.category }) === "food" && p.recommendations?.length);
  if (dining) {
    await page.evaluate((id) => window.editSavedPlace(id), dining.id);
    const oldTitle = dining.recommendations[0].title;
    assert.equal(await page.locator('[data-field="title"]').first().inputValue(), oldTitle);
    await page.locator("#placeDetailTypeSelect").selectOption("museum");
    await page.locator('[data-field="title"]').fill("临时看点");
    await page.locator("#placeDetailTypeSelect").selectOption("");
    assert.equal(await page.locator('[data-field="title"]').first().inputValue(), oldTitle);
    await page.locator("#cancelBtn").click();
  }

  const templeCategory = fixture.data.categories.find((c) => c.name === "寺庙");
  await page.evaluate((id) => openCategoryDialog(id), templeCategory.id);
  assert.equal(await page.locator("#categoryGroupSelect").inputValue(), "culture");
  await page.locator("#categoryDetailTypeSelect").selectOption("architecture");
  await page.locator("#saveCategoryBtn").click();
  await page.waitForFunction(() => document.getElementById("sharedStatus")?.dataset.state === "saved");
  assert.equal(stored.categories.find((c) => c.id === templeCategory.id).detailType, "architecture");
  assert.equal(stored.categories.length, fixture.data.categories.length);

  for (const profile of model.profiles) {
    await page.evaluate((id) => openPlaceDialog({ name: "模板预览", detailType: id, location: [114.3, 30.5] }), profile.id);
    assert.equal(await page.locator("#placeEntriesTitle").textContent(), profile.title);
    assert.equal(await page.locator("#placePracticalFields [data-detail-field]").count(), profile.fields.length);
    await page.locator("#cancelBtn").click();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => setMobileSheetState("full"));
  await page.locator(".category-group-tab").filter({ hasText: "文化" }).click();
  await page.locator(".category-section").scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "/private/tmp/eatwithyu-poi-mobile.png" });
  await page.evaluate((id) => window.editSavedPlace(id), museum.id);
  await page.screenshot({ path: "/private/tmp/eatwithyu-poi-mobile-form.png" });
  assert.equal(await page.evaluate(() => document.getElementById("placeDialog").scrollWidth > document.getElementById("placeDialog").clientWidth), false);
  await page.locator("#cancelBtn").click();
  assert.deepEqual(errors, []);
  const saveCountBeforeReadonly = saves;
  const readonlyPage = await context.newPage();
  await readonlyPage.goto("http://127.0.0.1:8765/");
  await readonlyPage.waitForSelector("#loading.hidden", { state: "attached" });
  assert.equal(await readonlyPage.locator(".new-category-entry").count(), 0);
  assert.equal(saves, saveCountBeforeReadonly);
  assert.equal(stored.places.length, originalCount);
  await browser.close();
  console.log(`POI UI tests passed with ${originalCount} places; all saves were intercepted locally.`);
}

run().catch(async (error) => { console.error(error); await testBrowser?.close(); process.exitCode = 1; });
