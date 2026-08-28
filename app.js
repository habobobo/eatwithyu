const SHARED_MAP_FALLBACK_FILE = "./maps/beijing.json";
const DEFAULT_MAP_TITLE = "eatwithyu";
const MAP_AVATAR_ICON_ID = "__eatwithyu_map_avatar__";
const SEARCH_CITY_NAMES = new Set(`
  北京 上海 天津 重庆 香港 澳门 深圳 广州 东莞 佛山 珠海 汕头
  石家庄 太原 呼和浩特 沈阳 大连 长春 哈尔滨 南京 苏州 无锡
  杭州 宁波 温州 绍兴 嘉兴 金华 台州 合肥 福州 厦门 泉州
  南昌 济南 青岛 烟台 威海 潍坊 临沂 郑州 洛阳 开封 南阳
  武汉 宜昌 襄阳 荆州 长沙 岳阳 株洲 衡阳 常德 南宁 桂林
  柳州 北海 海口 三亚 成都 绵阳 乐山 宜宾 德阳 南充 自贡
  泸州 贵阳 遵义 昆明 大理 丽江 西双版纳 拉萨 西安 兰州
  西宁 银川 乌鲁木齐 唐山 保定 秦皇岛 廊坊
`.trim().split(/\s+/));
const sharedConfig = window.SHARED_MAP_CONFIG || {};
const requestedEditorToken = new URLSearchParams(window.location.hash.slice(1)).get("edit") || "";
let canEdit = false;
let mapTitle = DEFAULT_MAP_TITLE;

let map;
let placeSearch;
let markers = new Map();
let searchMarkers = [];
let activeSearchId = 0;
let pendingManualPlaceName = "";
let savedPlaces = [];
let pendingDeleteCategory = "";
let savedIcons = [];
let savedCategories = [];
let activeCategories = new Set();
let selectedCategoryIconId = "";
let editingCategoryId = "";
let categoryDialogReturnToPlace = false;
let categoryIntegrityChanged = false;
let recommendationPhotoData = "";
let recommendationPhotoFileId = "";
let selectedVisitMode = "solo";
let infoWindow;
let sharedVersion = null;
let saveTimer = null;
let saveInFlight = false;
let saveQueued = false;
let isHydrating = true;
let cloudbaseApp = null;
let sharedStatusText = "正在同步…";
let sharedStatusState = "saving";

const $ = (id) => document.getElementById(id);

function persistPlaces() {
  scheduleSharedSave();
}

function persistIconLibrary() {
  scheduleSharedSave();
}

function persistCategoryLibrary() {
  scheduleSharedSave();
}

function isConfiguredValue(value) {
  return Boolean(value && !String(value).includes("请替换"));
}

function sharedProvider() {
  if (
    sharedConfig.provider === "cloudbase" &&
    isConfiguredValue(sharedConfig.cloudbaseHttpEndpoint)
  ) {
    return "cloudbase-http";
  }

  if (
    sharedConfig.provider === "cloudbase" &&
    isConfiguredValue(sharedConfig.cloudbaseEnvId) &&
    isConfiguredValue(sharedConfig.cloudbaseAccessKey)
  ) {
    return "cloudbase";
  }

  return "static";
}

function hasSharedBackend() {
  return sharedProvider() !== "static";
}

function setSyncStatus(message, state = "") {
  sharedStatusText = message;
  sharedStatusState = state;
  const status = $("sharedStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function logSharedError(context, error) {
  const code = error?.code ? ` [${error.code}]` : "";
  const message = error?.message || String(error || "未知错误");
  console.error(`${context}${code}: ${message}`);
}

function normalizeMapTitle(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized.slice(0, 60) || DEFAULT_MAP_TITLE;
}

function applyMapIdentity() {
  mapTitle = normalizeMapTitle(mapTitle);
  document.title = mapTitle;
  if ($("categoryDialogKicker")) $("categoryDialogKicker").textContent = mapTitle;
  if ($("placeDialogKicker")) $("placeDialogKicker").textContent = `保存到“${mapTitle}”`;
}

function mapAvatarIcon() {
  return savedIcons.find((icon) => icon.id === MAP_AVATAR_ICON_ID) || null;
}

function categoryLibraryIcons() {
  return savedIcons.filter((icon) => icon.id !== MAP_AVATAR_ICON_ID);
}

function applySharedData(data = {}) {
  savedPlaces = Array.isArray(data.places) ? data.places : [];
  savedCategories = Array.isArray(data.categories) ? data.categories : [];
  savedIcons = Array.isArray(data.icons) ? data.icons : [];
  resolveAssetReferences();
}

function resolveAssetReferences() {
  const iconsById = new Map(savedIcons.map((icon) => [icon.id, icon]));

  savedCategories = savedCategories.map((category) => ({
    ...category,
    iconUrl: category.iconId
      ? iconsById.get(category.iconId)?.url || ""
      : category.iconUrl || ""
  }));

  savedPlaces = savedPlaces.map((place) => ({
    ...place,
    credits: normalizedRestaurantCredits(place.credits),
    iconUrl: place.iconId
      ? iconsById.get(place.iconId)?.url || ""
      : place.iconUrl || ""
  }));
}

async function loadFallbackMap() {
  const response = await fetch(SHARED_MAP_FALLBACK_FILE, { cache: "no-store" });
  if (!response.ok) throw new Error("地图文件读取失败");
  const data = await response.json();
  mapTitle = normalizeMapTitle(data.title);
  applyMapIdentity();
  applySharedData({ places: data.places || [], categories: [], icons: [] });
}

function normalizeCloudFunctionResult(response) {
  let result = response?.result;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      throw new Error("共享服务返回了无法识别的数据");
    }
  }

  if (!result || result.ok === false) {
    const error = new Error(result?.message || response?.message || "共享服务请求失败");
    error.code = result?.code || response?.code || "CLOUD_FUNCTION_ERROR";
    throw error;
  }

  return result;
}

function initializeCloudbase() {
  if (cloudbaseApp) return cloudbaseApp;
  if (!window.cloudbase) throw new Error("CloudBase SDK 加载失败");

  cloudbaseApp = window.cloudbase.init({
    env: sharedConfig.cloudbaseEnvId,
    accessKey: sharedConfig.cloudbaseAccessKey,
    region: sharedConfig.cloudbaseRegion || "ap-shanghai",
    timeout: 20000
  });

  return cloudbaseApp;
}

async function callCloudbase(action, data = {}) {
  if (sharedProvider() === "cloudbase-http") {
    const response = await fetch(sharedConfig.cloudbaseHttpEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        mapId: sharedConfig.mapId || "beijing",
        ...data
      })
    });
    const result = await response.json();
    return normalizeCloudFunctionResult({ result });
  }

  const app = initializeCloudbase();
  const response = await app.callFunction({
    name: sharedConfig.cloudbaseFunctionName || "eatwithyu-map",
    data: {
      action,
      mapId: sharedConfig.mapId || "beijing",
      ...data
    },
    parse: true
  });
  return normalizeCloudFunctionResult(response);
}

function applyEditMode() {
  document.body.classList.toggle("read-only", !canEdit);
  $("editorLinkAction")?.classList.toggle("hidden", !canEdit);
}

async function loadSharedMap() {
  if (!hasSharedBackend()) {
    await loadFallbackMap();
    canEdit = false;
    applyEditMode();
    setSyncStatus("等待连接共享数据", "offline");
    return;
  }

  const result = await callCloudbase("get", {
    editorToken: requestedEditorToken
  });

  mapTitle = normalizeMapTitle(result.title);
  applyMapIdentity();
  applySharedData(result.data || {});
  sharedVersion = Number(result.version || 0);
  canEdit = Boolean(requestedEditorToken && result.editable);
  applyEditMode();

  if (requestedEditorToken && !canEdit) {
    setSyncStatus("编辑链接无效 · 只读浏览", "error");
  } else {
    setSyncStatus(canEdit ? "可共同编辑" : "公开地图 · 无需登录", canEdit ? "editable" : "readonly");
  }
}

async function bootstrapSharedMap() {
  applyEditMode();
  setSyncStatus("正在同步…", "saving");

  try {
    await loadSharedMap();
  } catch (error) {
    logSharedError("共享地图加载失败", error);
    try {
      await loadFallbackMap();
    } catch (fallbackError) {
      logSharedError("本地备份加载失败", fallbackError);
      applySharedData();
    }
    canEdit = false;
    applyEditMode();
    setSyncStatus("共享数据暂时不可用", "error");
  } finally {
    isHydrating = false;
  }
}

function sharedPayload() {
  return {
    places: savedPlaces.map((place) => {
      const category = findCategory(place.category, place.categoryId);
      return {
        ...place,
        category: category?.name || place.category || "",
        categoryId: category?.id || "",
        // Logo 只属于分类。地点不再保存一份可独立修改的图标。
        iconId: "",
        iconUrl: "",
        credits: normalizedRestaurantCredits(place.credits),
        recommendation: place.recommendation
          ? {
              ...place.recommendation,
              photo: place.recommendation.photoFileId
                ? ""
                : place.recommendation.photo || ""
            }
          : null
      };
    }),
    categories: savedCategories.map((category) => ({
      ...category,
      iconUrl: category.iconId ? "" : category.iconUrl || ""
    })),
    icons: savedIcons.map((icon) => ({
      ...icon,
      url: icon.fileId ? "" : icon.url || ""
    }))
  };
}

function scheduleSharedSave() {
  if (isHydrating || !canEdit) return;
  if (!hasSharedBackend()) {
    setSyncStatus("尚未连接共享数据", "error");
    return;
  }

  window.clearTimeout(saveTimer);
  saveQueued = true;
  setSyncStatus("正在保存…", "saving");
  saveTimer = window.setTimeout(saveSharedMap, 250);
}

async function saveSharedMap() {
  if (saveInFlight) {
    saveQueued = true;
    return;
  }

  saveInFlight = true;
  saveQueued = false;
  try {
    const result = await callCloudbase("save", {
      editorToken: requestedEditorToken,
      title: mapTitle,
      data: sharedPayload(),
      expectedVersion: sharedVersion
    });

    if (result.version != null) sharedVersion = Number(result.version);
    if (result.title) {
      mapTitle = normalizeMapTitle(result.title);
      applyMapIdentity();
      renderMapPresets();
    }
    setSyncStatus("已保存 · 公开链接同步可见", "saved");
  } catch (error) {
    console.error(error);
    saveQueued = false;
    if (/CONFLICT|版本|version/i.test(`${error.code || ""} ${error.message || ""}`)) {
      alert("另一位编辑者刚刚更新了地图。请刷新页面读取最新内容后再编辑。");
    } else if (/EDITOR_TOKEN|密钥|token|permission|权限/i.test(`${error.code || ""} ${error.message || ""}`)) {
      alert("这条编辑链接无效或已失效。");
    }
    setSyncStatus("保存失败", "error");
  } finally {
    saveInFlight = false;
    if (saveQueued) {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveSharedMap, 0);
    }
  }
}

function newCategoryId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `category-${Date.now()}-${Math.random()}`;
}

function normalizeCategoryName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function categoryKey(value) {
  return normalizeCategoryName(value).toLocaleLowerCase("zh-CN");
}

function findCategory(name = "", id = "") {
  if (id) {
    const byId = savedCategories.find((category) => category.id === id);
    if (byId) return byId;
  }

  const key = categoryKey(name);
  return key
    ? savedCategories.find((category) => categoryKey(category.name) === key)
    : null;
}

function categoryIconForPlace(place) {
  return findCategory(place.category, place.categoryId)?.iconUrl || "";
}

function ensureCategoryIntegrity() {
  const iconsById = new Map(savedIcons.map((icon) => [icon.id, icon]));
  const iconsByUrl = new Map(savedIcons.map((icon) => [icon.url, icon]));
  const categoriesByKey = new Map();
  const categoryIdAliases = new Map();
  const nextCategories = [];
  let changed = false;

  savedCategories.forEach((source) => {
    const name = normalizeCategoryName(source.name);
    if (!name) {
      changed = true;
      return;
    }

    const key = categoryKey(name);
    const existing = categoriesByKey.get(key);
    const matchedIcon = source.iconId
      ? iconsById.get(source.iconId)
      : iconsByUrl.get(source.iconUrl);
    const resolvedIconId = source.iconId || matchedIcon?.id || "";
    const resolvedIconUrl = resolvedIconId
      ? iconsById.get(resolvedIconId)?.url || source.iconUrl || ""
      : source.iconUrl || "";

    if (existing) {
      if (source.id) categoryIdAliases.set(source.id, existing.id);
      if (!existing.iconId && !existing.iconUrl && (resolvedIconId || resolvedIconUrl)) {
        existing.iconId = resolvedIconId;
        existing.iconUrl = resolvedIconUrl;
      }
      changed = true;
      return;
    }

    const category = {
      ...source,
      id: source.id || newCategoryId(),
      name,
      iconId: resolvedIconId,
      iconUrl: resolvedIconUrl
    };
    if (
      !source.id ||
      source.name !== name ||
      source.iconId !== resolvedIconId ||
      source.iconUrl !== resolvedIconUrl
    ) changed = true;
    categoriesByKey.set(key, category);
    nextCategories.push(category);
  });

  savedPlaces.forEach((place) => {
    const normalizedName = normalizeCategoryName(place.category);
    const aliasedId = categoryIdAliases.get(place.categoryId) || place.categoryId || "";
    let category = aliasedId
      ? nextCategories.find((item) => item.id === aliasedId)
      : null;
    if (!category && normalizedName) category = categoriesByKey.get(categoryKey(normalizedName));

    if (!category && normalizedName) {
      category = {
        id: newCategoryId(),
        name: normalizedName,
        iconId: place.iconId || "",
        iconUrl: place.iconId
          ? iconsById.get(place.iconId)?.url || place.iconUrl || ""
          : place.iconUrl || "",
        createdAt: new Date().toISOString()
      };
      categoriesByKey.set(categoryKey(normalizedName), category);
      nextCategories.push(category);
      changed = true;
    }

    if (category && !category.iconId && !category.iconUrl && (place.iconId || place.iconUrl)) {
      category.iconId = place.iconId || "";
      category.iconUrl = place.iconId
        ? iconsById.get(place.iconId)?.url || place.iconUrl || ""
        : place.iconUrl || "";
      changed = true;
    }

    const nextName = category?.name || "";
    const nextId = category?.id || "";
    if (
      place.category !== nextName ||
      place.categoryId !== nextId ||
      Boolean(place.iconId) ||
      Boolean(place.iconUrl)
    ) {
      place.category = nextName;
      place.categoryId = nextId;
      place.iconId = "";
      place.iconUrl = "";
      changed = true;
    }
  });

  savedCategories = nextCategories;
  return changed;
}

function migrateIconsFromPlaces() {
  const knownUrls = new Set(savedIcons.map((icon) => icon.url));
  let changed = false;

  savedPlaces.forEach((place) => {
    if (
      place.iconUrl &&
      place.iconUrl.startsWith("data:") &&
      !knownUrls.has(place.iconUrl)
    ) {
      const icon = {
        id: crypto.randomUUID ? crypto.randomUUID() : `icon-${Date.now()}-${Math.random()}`,
        name: `旧图标 ${savedIcons.length + 1}`,
        url: place.iconUrl,
        createdAt: new Date().toISOString()
      };
      savedIcons.push(icon);
      place.iconId = icon.id;
      knownUrls.add(icon.url);
      changed = true;
    }
  });

  if (changed) persistIconLibrary();
}

function loadAmap() {
  const cfg = window.MAP_CONFIG || {};

  if (
    !cfg.key ||
    cfg.key.includes("请替换") ||
    !cfg.securityJsCode ||
    cfg.securityJsCode.includes("请替换")
  ) {
    $("loading").innerHTML = "请先在 <strong>config.js</strong> 中填写高德 Key 和安全密钥。";
    return;
  }

  window._AMapSecurityConfig = { securityJsCode: cfg.securityJsCode };

  const script = document.createElement("script");
  script.src =
    `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.key)}` +
    "&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.Scale,AMap.ToolBar";

  script.onload = initMap;
  script.onerror = () => {
    $("loading").textContent = "地图加载失败，请检查 Key、域名设置和网络。";
  };

  document.head.appendChild(script);
}

function initMap() {
  const cfg = window.MAP_CONFIG;

  map = new AMap.Map("map", {
    zoom: cfg.defaultZoom || 12,
    center: cfg.defaultCenter || [116.397428, 39.90923],
    viewMode: "2D",
    resizeEnable: true,
    doubleClickZoom: false,

    // 只保留地图背景、道路和建筑，隐藏高德默认 POI 点及其图标
  features: ["bg", "road", "building"]
  });

  map.addControl(new AMap.Scale());
  map.addControl(new AMap.ToolBar({
    position: { right: "20px", top: "20px" }
  }));

  placeSearch = new AMap.PlaceSearch({
    pageSize: 15,
    pageIndex: 1,
    extensions: "all",
    city: "全国",
    citylimit: false
  });

  infoWindow = new AMap.InfoWindow({
    offset: new AMap.Pixel(0, -20),
    isCustom: false
  });

  map.on("dblclick", (event) => {
    if (!canEdit) return;
    const placeName = pendingManualPlaceName || "地图上的地点";
    resetManualPlacement();
    openPlaceDialog({
      name: placeName,
      address: "",
      location: [event.lnglat.lng, event.lnglat.lat],
      poiId: ""
    });
  });

  migrateIconsFromPlaces();
  categoryIntegrityChanged = ensureCategoryIntegrity() || categoryIntegrityChanged;
  if (categoryIntegrityChanged && canEdit) scheduleSharedSave();
  $("loading").classList.add("hidden");
  renderAll();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function normalizedRestaurantCredits(value) {
  return window.RestaurantCredits?.normalize(value) || [];
}

function restaurantCreditsForCandidate(candidate) {
  return window.RestaurantCredits?.forCandidate(candidate || {}) || [];
}

function restaurantCreditLogosMarkup(credits, interactive = false) {
  const normalized = normalizedRestaurantCredits(credits);
  if (!normalized.length) return "";

  const logos = normalized.map((credit) => {
    const system = window.RestaurantCredits?.systems?.[credit.system];
    if (!system) return "";
    const image = `<img src="${escapeHtml(system.icon)}" alt="">`;
    if (!interactive) {
      return `<span class="restaurant-credit-logo restaurant-credit-logo-${escapeHtml(credit.system)}" aria-hidden="true">${image}</span>`;
    }

    return `
      <button
        class="restaurant-credit-logo restaurant-credit-logo-${escapeHtml(credit.system)} is-interactive"
        type="button"
        aria-label="${escapeHtml(credit.label)}"
        data-credit-tooltip="${escapeHtml(credit.label)}"
      >${image}</button>
    `;
  }).join("");

  if (!logos) return "";
  return `<span class="restaurant-credit-logos ${interactive ? "is-detail" : "is-search"}" aria-label="餐厅荣誉">${logos}</span>`;
}

function formatVisitDate(dateValue) {
  if (!dateValue) return "";

  const parts = String(dateValue).split("-");
  if (parts.length !== 3) return escapeHtml(dateValue);

  const [year, month, day] = parts;
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

function defaultMarkerContent() {
  const pin = document.createElement("div");
  pin.className = "default-map-pin";
  return pin;
}

function markerContent(place) {
  const iconUrl = categoryIconForPlace(place);
  if (!iconUrl) {
    return defaultMarkerContent();
  }

  const element = document.createElement("div");
  const markerToneClass = place.category === "家"
    ? "custom-marker-home"
    : place.category === "单位"
      ? "custom-marker-work"
      : "";
  element.className = `custom-marker ${markerToneClass}`;

  const image = document.createElement("img");
  image.src = iconUrl;
  image.alt = place.category || "地点";
  element.appendChild(image);

  return element;
}

function addMarker(place) {
  if (!map) return;
  if (activeCategories.size && !activeCategories.has(place.category)) return;

  const hasIcon = Boolean(categoryIconForPlace(place));
  const marker = new AMap.Marker({
    position: [place.longitude, place.latitude],
    content: markerContent(place),
    offset: new AMap.Pixel(hasIcon ? -12 : -10, hasIcon ? -12 : -28),
    anchor: "center",
    zIndex: 120
  });

  marker.on("click", () => {
    const recommendation = place.recommendation || {};
    const recommendationHtml = recommendation.title
      ? `
        <section class="info-recommendation" aria-label="推荐菜单">
          <div class="recommendation-list-label">推荐菜单</div>
          <div class="recommendation-list-item ${recommendation.photo ? "" : "no-photo"}">
            <div class="recommendation-copy">
              <strong>${escapeHtml(recommendation.title)}</strong>
              ${recommendation.description ? `<p>${escapeHtml(recommendation.description)}</p>` : ""}
            </div>
            ${recommendation.photo
              ? `<img class="recommendation-thumbnail" src="${recommendation.photo}" alt="${escapeHtml(recommendation.title)}">`
              : ""}
          </div>
        </section>
      `
      : "";

    const visit = place.visitRecord || {};
    const visitText = visit.date
      ? `${formatVisitDate(visit.date)} · ${visit.mode === "with" && visit.companions
          ? `和 ${escapeHtml(visit.companions)}`
          : "自己前往"}`
      : "";
    const visitHtml = visitText
      ? `
        <div class="visit-summary">
          <span class="visit-summary-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20"><path d="m7.8 13.6-3.4-3.4 1.4-1.4 2 2 6.4-6.4 1.4 1.4-7.8 7.8Z"/></svg>
          </span>
          <span class="visit-summary-text">${visitText}</span>
        </div>
      `
      : "";

    const detailCredits = restaurantCreditsForCandidate(place);
    const content = `
      <article class="info-card place-detail-card">
        <header class="place-detail-header">
          <div class="place-detail-title-row">
            <h3>${escapeHtml(place.name)}</h3>
            ${restaurantCreditLogosMarkup(detailCredits, true)}
          </div>
          <div class="place-detail-location">
            ${place.category ? `<span>${escapeHtml(place.category)}</span>` : ""}
            ${place.category && place.address ? `<span class="place-detail-separator">·</span>` : ""}
            ${place.address ? `<span>${escapeHtml(place.address)}</span>` : ""}
          </div>
        </header>
        ${visitHtml}
        ${recommendationHtml}
        ${place.note
          ? `<section class="place-note"><div class="place-note-label">备注</div><p>${escapeHtml(place.note)}</p></section>`
          : ""}
        ${canEdit
          ? `<div class="place-detail-actions">
              <button class="place-edit-button" type="button" onclick="window.editSavedPlace('${place.id}')">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 13.8V16h2.2l7.95-7.95-2.2-2.2L4 13.8Zm11.85-7.45a.6.6 0 0 0 0-.85l-1.35-1.35a.6.6 0 0 0-.85 0l-1.05 1.05 2.2 2.2 1.05-1.05Z"/></svg>
                <span>编辑地点</span>
              </button>
            </div>`
          : ""}
      </article>
    `;

    infoWindow.setContent(content);
    infoWindow.open(map, [place.longitude, place.latitude]);
  });

  marker.setMap(map);
  markers.set(place.id, marker);
}

function currentPlaces() {
  return savedPlaces;
}

function renderMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers.clear();
  currentPlaces()
    .filter((place) => place.isMarked !== false)
    .forEach(addMarker);
}

function groupedCategories() {
  const groups = new Map();

  savedCategories.forEach((category) => {
    groups.set(category.name, {
      id: category.id,
      count: 0,
      iconUrl: category.iconUrl || ""
    });
  });

  currentPlaces().filter((place) => place.isMarked !== false && place.category).forEach((place) => {
    if (!groups.has(place.category)) {
      groups.set(place.category, {
        id: place.categoryId || "",
        count: 0,
        iconUrl: categoryIconForPlace(place)
      });
    }
    groups.get(place.category).count += 1;
  });

  return groups;
}

function renderCategoryFilters() {
  const host = $("categoryFilters");
  const groups = groupedCategories();
  host.innerHTML = "";
  $("categorySummary").textContent = groups.size ? `${groups.size} 个分类` : "0 个分类";

  if (canEdit) {
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "new-category-entry";
    addButton.innerHTML = `
      <span class="new-category-plus">＋</span>
      <span>新建分类</span>
    `;
    addButton.onclick = () => openCategoryDialog();
    host.appendChild(addButton);
  }

  groups.forEach((data, category) => {
    const active = activeCategories.size === 0 || activeCategories.has(category);
    const wrap = document.createElement("div");
    wrap.className = "category-item-wrap";

    const item = document.createElement("button");
    item.type = "button";
    item.className = `category-item ${active ? "" : "inactive"}`;

    const initial = escapeHtml(category.trim().slice(0, 1) || "分");
    item.innerHTML = `
      <span class="category-label">${escapeHtml(category)}</span>
      <span class="category-count">${data.count}</span>
    `;

    item.onclick = () => {
      if (activeCategories.size === 0) {
        groups.forEach((_, itemCategory) => activeCategories.add(itemCategory));
      }

      activeCategories.has(category)
        ? activeCategories.delete(category)
        : activeCategories.add(category);

      if (activeCategories.size === groups.size) {
        activeCategories.clear();
      }

      renderCategoryFilters();
      renderMarkers();
    };

    wrap.appendChild(item);

    if (canEdit) {
      const iconButton = document.createElement("button");
      iconButton.type = "button";
      iconButton.className = "category-logo-button";
      iconButton.title = `更换“${category}”的 Logo`;
      iconButton.setAttribute("aria-label", `更换“${category}”的 Logo`);
      iconButton.innerHTML = `
        ${data.iconUrl
          ? `<img class="mini-icon" src="${data.iconUrl}" alt="">`
          : `<span class="category-icon-placeholder">${initial}</span>`}
        <span class="category-logo-edit-mark" aria-hidden="true">✎</span>
      `;
      iconButton.onclick = (event) => {
        event.stopPropagation();
        openCategoryDialog(data.id || category);
      };
      wrap.prepend(iconButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "category-delete-button";
      deleteButton.title = `删除分类“${category}”`;
      deleteButton.setAttribute("aria-label", `删除分类“${category}”`);
      deleteButton.textContent = "×";
      deleteButton.onclick = (event) => {
        event.stopPropagation();
        openDeleteCategoryDialog(category, data.count);
      };
      wrap.appendChild(deleteButton);
    } else {
      const icon = document.createElement("span");
      icon.className = "category-logo-static";
      icon.innerHTML = data.iconUrl
        ? `<img class="mini-icon" src="${data.iconUrl}" alt="">`
        : `<span class="category-icon-placeholder">${initial}</span>`;
      wrap.prepend(icon);
    }

    host.appendChild(wrap);
  });
}

function renderSavedPlaces() {
  const places = currentPlaces();
  $("placeCount").textContent = places.length;
  $("savedSectionTitle").textContent = "地图地点";
  $("categorySectionTitle").textContent = "分类";

  const host = $("savedPlaces");
  host.innerHTML = "";

  places.forEach((place) => {
    const item = document.createElement("div");
    const isUnmarked = place.isMarked === false;
    const categoryIconUrl = categoryIconForPlace(place);
    item.className = `saved-item ${isUnmarked ? "unmarked" : ""}`;
    item.innerHTML = `
      ${categoryIconUrl && !isUnmarked
        ? `<img class="mini-icon" src="${categoryIconUrl}" alt="">`
        : `<span class="saved-place-pin"></span>`}
      <div class="item-copy">
        <div class="item-title">
          ${escapeHtml(place.name)}
          ${isUnmarked ? '<span class="unmarked-badge">未标记</span>' : ""}
        </div>
        <div class="item-meta">
          ${escapeHtml(place.category || "未分类")}
          ${place.address ? " · " + escapeHtml(place.address) : ""}
        </div>
      </div>`;
    item.onclick = () => {
      map.setZoomAndCenter(17, [place.longitude, place.latitude]);
      if (isUnmarked && canEdit) {
        window.editSavedPlace(place.id);
      } else {
        markers.get(place.id)?.emit("click");
      }
    };
    host.appendChild(item);
  });

  if (!places.length) {
    host.innerHTML = `<div class="item-meta">“${escapeHtml(mapTitle)}”暂时还没有地点。</div>`;
  }
}

function renderAll() {
  renderMapPresets();
  renderMarkers();
  renderCategoryFilters();
  renderSavedPlaces();
}

function renderMapPresets() {
  const host = $("mapPresetList");
  applyMapIdentity();
  const mapInitial = escapeHtml(mapTitle.trim().slice(0, 1).toLocaleUpperCase() || "E");
  const avatar = mapAvatarIcon();
  const avatarMedia = avatar?.url
    ? `<span class="map-avatar-media"><img src="${escapeHtml(avatar.url)}" alt=""></span>`
    : `<span class="map-avatar-media map-avatar-initial">${mapInitial}</span>`;
  const avatarControl = canEdit
    ? `<button id="mapAvatarButton" class="map-preset-icon map-avatar-button" type="button" aria-label="更换地图头像" title="更换地图头像">
        ${avatarMedia}
        <span class="map-avatar-edit-mark" aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M4 13.8V16h2.2l7.95-7.95-2.2-2.2L4 13.8Zm11.85-7.45a.6.6 0 0 0 0-.85l-1.35-1.35a.6.6 0 0 0-.85 0l-1.05 1.05 2.2 2.2 1.05-1.05Z"/></svg>
        </span>
      </button>`
    : `<span class="map-preset-icon map-avatar-static" aria-label="${escapeHtml(mapTitle)} 地图头像">${avatarMedia}</span>`;
  host.innerHTML = `
    <div class="map-preset-button active shared-map-card">
    ${avatarControl}
    <span class="map-preset-copy">
      <span class="map-preset-title">${escapeHtml(mapTitle)}</span>
      <span id="sharedStatus" class="map-preset-meta" data-state="${escapeHtml(sharedStatusState)}">${escapeHtml(sharedStatusText)}</span>
    </span>
    <span class="map-preset-count">${savedPlaces.length}</span>
    </div>`;
  $("mapAvatarButton")?.addEventListener("click", () => $("mapAvatarFile").click());
  $("activeMapSummary").textContent = `${currentPlaces().length} 个地点`;
}

function clearSearchMarkers() {
  searchMarkers.forEach((marker) => marker.setMap(null));
  searchMarkers = [];
  infoWindow?.close();
}

function searchViewportPadding() {
  return window.innerWidth >= 760
    ? [72, 72, 72, 420]
    : [72, 44, 72, 44];
}

function focusSearchMarker(marker) {
  if (!map || !marker) return;
  map.setFitView([marker], false, searchViewportPadding(), 17);
}

function searchResultAddress(poi) {
  const region = [poi.cityname, poi.adname].filter(Boolean).join(" · ");
  return [region, poi.address].filter(Boolean).join(" · ") || poi.pname || "";
}

function normalizePlaceIdentityText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•・—\-_|｜/／,，。:：;；()（）\[\]【】'"“”‘’]+/g, "");
}

function placeLocation(value) {
  if (Array.isArray(value)) {
    const [lng, lat] = value.map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  if (value?.location) return locationArray(value.location);
  const lng = Number(value?.longitude);
  const lat = Number(value?.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function distanceInMeters(firstLocation, secondLocation) {
  if (!firstLocation || !secondLocation) return Infinity;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const [firstLng, firstLat] = firstLocation;
  const [secondLng, secondLat] = secondLocation;
  const latitudeDelta = toRadians(secondLat - firstLat);
  const longitudeDelta = toRadians(secondLng - firstLng);
  const firstLatitude = toRadians(firstLat);
  const secondLatitude = toRadians(secondLat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, haversine));
  return 6371000 * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

function findExistingPlace(candidate, excludeId = "") {
  const candidatePoiId = String(candidate.poiId || candidate.id || "").trim();
  const candidateName = normalizePlaceIdentityText(candidate.name);
  const candidateAddress = normalizePlaceIdentityText(
    candidate.address || searchResultAddress(candidate)
  );
  const candidateLocation = placeLocation(candidate);

  return savedPlaces.find((place) => {
    if (place.id === excludeId) return false;

    const savedPoiId = String(place.poiId || "").trim();
    if (candidatePoiId && savedPoiId && candidatePoiId === savedPoiId) return true;

    const savedLocation = placeLocation(place);
    const distance = distanceInMeters(candidateLocation, savedLocation);
    const savedName = normalizePlaceIdentityText(place.name);
    const sameName = Boolean(candidateName && savedName && candidateName === savedName);
    const similarName = Boolean(
      candidateName &&
      savedName &&
      Math.min(candidateName.length, savedName.length) >= 3 &&
      (candidateName.includes(savedName) || savedName.includes(candidateName))
    );
    const savedAddress = normalizePlaceIdentityText(place.address);
    if (sameName && candidateAddress && candidateAddress === savedAddress) return true;
    if (!Number.isFinite(distance)) return false;
    if (sameName && distance <= 120) return true;
    if (similarName && distance <= 35) return true;

    const sameAddress = Boolean(
      candidateAddress &&
      savedAddress &&
      (candidateAddress === savedAddress ||
        candidateAddress.includes(savedAddress) ||
        savedAddress.includes(candidateAddress))
    );
    return sameAddress && similarName && distance <= 80;
  }) || null;
}

function savedSearchHighlight(place) {
  const position = placeLocation(place);
  if (!position) return null;

  const content = document.createElement("div");
  content.className = "saved-search-map-highlight";
  content.setAttribute("aria-label", "已收藏");
  const iconUrl = categoryIconForPlace(place);
  const initial = escapeHtml((place.category || "已").trim().slice(0, 1));
  content.innerHTML = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="">`
    : `<span class="category-icon-placeholder">${initial}</span>`;

  const marker = new AMap.Marker({
    position,
    content,
    offset: new AMap.Pixel(-20, -20),
    anchor: "center",
    title: `${place.name} · 已收藏`,
    zIndex: 190
  });
  marker.setMap(map);
  searchMarkers.push(marker);
  return marker;
}

function openSavedSearchResult(place, highlightMarker) {
  const position = placeLocation(place);
  if (!position) return;
  if (highlightMarker) focusSearchMarker(highlightMarker);

  if (place.isMarked === false && canEdit) {
    window.editSavedPlace(place.id);
    return;
  }

  const savedMarker = markers.get(place.id);
  if (savedMarker) {
    savedMarker.emit("click");
    return;
  }

  infoWindow.setContent(`
    <div class="info-card search-preview-card">
      <h3>${escapeHtml(place.name)}</h3>
      <p>${escapeHtml(place.address || "暂无地址")}</p>
      <p class="search-preview-hint">这个地点已经收藏在地图中。</p>
    </div>
  `);
  infoWindow.open(map, position);
}

function splitSearchInput(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  const tokens = normalized.split(" ").filter(Boolean);
  let city = "";

  const looksLikeCity = (token) => {
    const normalizedToken = token.replace(/市$/, "");
    return token.endsWith("市") || SEARCH_CITY_NAMES.has(normalizedToken);
  };
  if (tokens.length > 1 && looksLikeCity(tokens[tokens.length - 1])) {
    city = tokens.pop().replace(/市$/, "");
  } else if (tokens.length > 1 && looksLikeCity(tokens[0])) {
    city = tokens.shift().replace(/市$/, "");
  }

  return {
    city,
    keyword: tokens.join(" ") || normalized
  };
}

function searchAttempts(rawKeyword) {
  const parsed = splitSearchInput(rawKeyword);
  const punctuationNormalized = parsed.keyword
    .replace(/[·•・—\-_|｜/／,，。:：;；()（）\[\]【】]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = punctuationNormalized.replace(/\s+/g, "");
  const latin = (parsed.keyword.match(/[a-z0-9]+/gi) || []).join(" ");
  const chinese = (parsed.keyword.match(/[\u3400-\u9fff]+/g) || []).join(" ");
  const chineseSegments = punctuationNormalized
    .split(" ")
    .filter((segment) => /^[\u3400-\u9fff]{2,}$/.test(segment));
  const chineseCharacters = (parsed.keyword.match(/[\u3400-\u9fff]+/g) || []).join("");
  const fuzzyChinese = [];

  if (chineseCharacters.length >= 4) {
    fuzzyChinese.push(chineseCharacters.slice(0, Math.min(4, chineseCharacters.length)));
    fuzzyChinese.push(chineseCharacters.slice(-Math.min(6, chineseCharacters.length)));
  }
  if (chineseCharacters.length >= 6) {
    fuzzyChinese.push(chineseCharacters.slice(2));
    fuzzyChinese.push(chineseCharacters.slice(0, -2));
  }

  const variants = [
    parsed.keyword,
    punctuationNormalized,
    compact,
    latin,
    chinese,
    ...chineseSegments,
    ...fuzzyChinese
  ].filter(Boolean);
  const attempts = [];
  const seen = new Set();

  variants.forEach((query) => {
    const normalizedQuery = query.trim();
    const key = normalizedQuery.toLocaleLowerCase();
    if (!normalizedQuery || seen.has(key)) return;
    seen.add(key);
    attempts.push({
      query: normalizedQuery,
      city: parsed.city || "全国",
      citylimit: Boolean(parsed.city)
    });
  });

  return { attempts, parsed };
}

function runPlaceSearch(attempt) {
  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    const finish = (pois) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(pois);
    };
    timeout = window.setTimeout(() => finish([]), 10000);
    const searcher = new AMap.PlaceSearch({
      pageSize: 15,
      pageIndex: 1,
      extensions: "all",
      city: attempt.city,
      citylimit: attempt.citylimit
    });

    searcher.search(attempt.query, (status, result) => {
      finish(status === "complete" && result?.poiList?.pois
        ? result.poiList.pois.filter((poi) => poi.location)
        : []);
    });
  });
}

function mergeSearchResults(resultGroups, limit = 15) {
  const merged = [];
  const seen = new Set();
  const longestGroup = Math.max(0, ...resultGroups.map((group) => group.length));

  for (let index = 0; index < longestGroup && merged.length < limit; index += 1) {
    resultGroups.forEach((group) => {
      const poi = group[index];
      if (!poi || merged.length >= limit) return;
      const key = poi.id || `${poi.name}-${poi.location.lng}-${poi.location.lat}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(poi);
    });
  }

  return merged;
}

function resetManualPlacement() {
  pendingManualPlaceName = "";
  if ($("bottomHint")) $("bottomHint").textContent = "双击地图可手动添加地点";
}

function startManualPlacement(rawKeyword, city) {
  if (!canEdit) return;
  pendingManualPlaceName = splitSearchInput(rawKeyword).keyword || rawKeyword;
  activeSearchId += 1;
  clearSearchMarkers();
  $("searchResultsSection").classList.add("hidden");
  $("mainPanel").classList.add("collapsed");
  $("openPanelBtn").classList.remove("hidden");
  $("bottomHint").textContent = `双击餐厅所在位置，添加“${pendingManualPlaceName}”`;
  if (city) map.setCity(city);
}

function locationArray(location) {
  if (!location) return null;
  const lng = typeof location.getLng === "function" ? location.getLng() : location.lng;
  const lat = typeof location.getLat === "function" ? location.getLat() : location.lat;
  return Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))
    ? [Number(lng), Number(lat)]
    : null;
}

function runAddressGeocode(address, city) {
  return new Promise((resolve) => {
    if (!window.AMap?.Geocoder) {
      resolve([]);
      return;
    }

    let settled = false;
    const finish = (results) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(results);
    };
    const timeout = window.setTimeout(() => finish([]), 10000);
    const geocoder = new AMap.Geocoder({ city: city || "全国" });

    geocoder.getLocation(address, (status, result) => {
      if (status !== "complete" || result?.info !== "OK" || !result?.geocodes) {
        finish([]);
        return;
      }

      finish(result.geocodes.map((geocode) => ({
        name: geocode.formattedAddress || address,
        address: geocode.formattedAddress || address,
        location: locationArray(geocode.location),
        source: "address"
      })).filter((candidate) => candidate.location));
    });
  });
}

async function findAddressCandidates(address, city) {
  const addressCity = splitSearchInput(address).city;
  const resolvedCity = city || addressCity;
  const [geocodes, pois] = await Promise.all([
    runAddressGeocode(address, resolvedCity),
    runPlaceSearch({
      query: address,
      city: resolvedCity || "全国",
      citylimit: Boolean(resolvedCity)
    })
  ]);
  const candidates = [
    ...geocodes,
    ...pois.map((poi) => ({
      name: poi.name,
      address: searchResultAddress(poi) || address,
      location: locationArray(poi.location),
      source: "poi"
    }))
  ];
  const seen = new Set();

  return candidates.filter((candidate) => {
    if (!candidate.location) return false;
    const key = `${candidate.location[0].toFixed(5)}-${candidate.location[1].toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function chooseAddressCandidate(candidate, placeName) {
  resetManualPlacement();
  clearSearchMarkers();

  const marker = new AMap.Marker({
    position: candidate.location,
    content: defaultMarkerContent(),
    offset: new AMap.Pixel(-10, -28),
    anchor: "center",
    title: placeName,
    zIndex: 170
  });
  marker.setMap(map);
  searchMarkers.push(marker);
  focusSearchMarker(marker);

  openPlaceDialog({
    name: placeName,
    address: candidate.address,
    location: candidate.location,
    poiId: ""
  });
}

function renderAddressCandidates(host, candidates, placeName) {
  host.innerHTML = "";

  if (!candidates.length) {
    host.innerHTML = '<div class="manual-address-status error">没有定位到这个地址，请补充城市、区、道路或商场名称后重试。</div>';
    return;
  }

  const heading = document.createElement("div");
  heading.className = "manual-address-status";
  heading.textContent = "请选择正确的位置：";
  host.appendChild(heading);

  candidates.forEach((candidate) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "manual-address-result";
    button.innerHTML = `
      <span class="manual-address-result-title">${escapeHtml(candidate.name)}</span>
      <span class="manual-address-result-meta">${escapeHtml(candidate.address)}</span>
    `;
    button.onclick = () => chooseAddressCandidate(candidate, placeName);
    host.appendChild(button);
  });
}

async function searchManualAddress(rawKeyword, city, input, resultsHost, submitButton) {
  const address = input.value.trim();
  if (!address) {
    input.focus();
    return;
  }

  const placeName = splitSearchInput(rawKeyword).keyword || rawKeyword;
  submitButton.disabled = true;
  submitButton.textContent = "定位中…";
  resultsHost.innerHTML = '<div class="manual-address-status">正在查找地址…</div>';

  try {
    const candidates = await findAddressCandidates(address, city);
    renderAddressCandidates(resultsHost, candidates, placeName);
  } catch (error) {
    console.error("地址定位失败:", error);
    resultsHost.innerHTML = '<div class="manual-address-status error">地址定位暂时失败，请稍后重试。</div>';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "查找地址";
  }
}

function appendManualSearchAction(host, rawKeyword, city, isEmpty = false) {
  if (!canEdit) return;

  const action = document.createElement("div");
  action.className = `search-manual-action ${isEmpty ? "empty" : ""}`;
  action.innerHTML = `
    <div class="search-manual-copy">
      <strong>${isEmpty ? "高德可能还没有收录这家店" : "没有你要找的地点？"}</strong>
      <span>输入街道地址、商场或建筑名称，定位后再确认收藏。</span>
    </div>
  `;

  const addressForm = document.createElement("form");
  addressForm.className = "manual-address-form";

  const addressInput = document.createElement("input");
  addressInput.type = "search";
  addressInput.className = "manual-address-input";
  addressInput.placeholder = city
    ? `例如：${city}罗湖万象城`
    : "例如：深圳市罗湖区宝安南路1881号";
  addressInput.autocomplete = "off";
  addressInput.setAttribute("aria-label", "输入详细地址或建筑名称");

  const addressButton = document.createElement("button");
  addressButton.type = "submit";
  addressButton.className = "manual-search-button";
  addressButton.textContent = "查找地址";

  const addressResults = document.createElement("div");
  addressResults.className = "manual-address-results";

  addressForm.append(addressInput, addressButton);
  addressForm.onsubmit = (event) => {
    event.preventDefault();
    searchManualAddress(rawKeyword, city, addressInput, addressResults, addressButton);
  };
  action.append(addressForm, addressResults);

  const mapButton = document.createElement("button");
  mapButton.type = "button";
  mapButton.className = "manual-map-pick-button";
  mapButton.textContent = "地址仍不确定？在地图上选择位置";
  mapButton.onclick = () => startManualPlacement(rawKeyword, city);
  action.appendChild(mapButton);
  host.appendChild(action);
}

function openSearchResult(poi, location, marker) {
  focusSearchMarker(marker);

  if (canEdit) {
    openPlaceDialog({
      name: poi.name,
      address: searchResultAddress(poi),
      location,
      poiId: poi.id || ""
    });
    return;
  }

  infoWindow.setContent(`
    <div class="info-card search-preview-card">
      <h3>${escapeHtml(poi.name)}</h3>
      <p>${escapeHtml(searchResultAddress(poi) || "暂无地址")}</p>
      <p class="search-preview-hint">这是搜索结果，使用编辑链接可添加到地图。</p>
    </div>
  `);
  infoWindow.open(map, location);
}

async function searchPoi() {
  const keyword = $("poiKeyword").value.trim();
  if (!keyword || !placeSearch) return;

  const searchId = ++activeSearchId;
  resetManualPlacement();
  clearSearchMarkers();
  $("searchResultsSection").classList.remove("hidden");
  const { attempts, parsed } = searchAttempts(keyword);
  $("searchResults").innerHTML = `<div class="item-meta">正在${parsed.city ? `${escapeHtml(parsed.city)}范围内` : "全国范围内"}搜索…</div>`;

  const resultGroups = await Promise.all(attempts.map(runPlaceSearch));
  if (searchId !== activeSearchId) return;

  const visiblePois = mergeSearchResults(resultGroups);
  const host = $("searchResults");
  host.innerHTML = canEdit
    ? ""
    : '<div class="search-readonly-notice">当前是公开浏览链接：可以查看搜索位置，但收藏地点需要使用编辑链接。</div>';

  if (!visiblePois.length) {
    const empty = document.createElement("div");
    empty.className = "item-meta search-empty-state";
    empty.textContent = `${parsed.city ? `${parsed.city}范围内` : "全国范围内"}没有找到对应 POI。`;
    host.appendChild(empty);
    appendManualSearchAction(host, keyword, parsed.city, true);
    return;
  }

  visiblePois.forEach((poi) => {
      const location = [poi.location.lng, poi.location.lat];
      const existingPlace = findExistingPlace({
        id: poi.id || "",
        name: poi.name,
        address: searchResultAddress(poi),
        location
      });
      const resultCredits = restaurantCreditsForCandidate(existingPlace || {
        ...poi,
        poiId: poi.id || "",
        address: searchResultAddress(poi),
        location
      });
      const resultCreditLogos = restaurantCreditLogosMarkup(resultCredits);
      const marker = existingPlace
        ? savedSearchHighlight(existingPlace)
        : new AMap.Marker({
            position: location,
            content: defaultMarkerContent(),
            offset: new AMap.Pixel(-10, -28),
            anchor: "center",
            title: poi.name,
            zIndex: 160
          });
      if (!existingPlace) {
        marker.setMap(map);
        searchMarkers.push(marker);
      }

      const item = document.createElement("div");
      item.className = `result-item ${existingPlace ? "saved-result" : ""}`;
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      if (existingPlace) {
        const savedIconUrl = categoryIconForPlace(existingPlace);
        const initial = escapeHtml((existingPlace.category || "已").trim().slice(0, 1));
        const savedStateText = existingPlace.isMarked === false ? "待恢复" : "已收藏";
        item.innerHTML = `
          <span class="result-saved-marker">
            ${savedIconUrl
              ? `<img src="${escapeHtml(savedIconUrl)}" alt="">`
              : `<span class="category-icon-placeholder">${initial}</span>`}
            <span class="result-saved-check" aria-hidden="true">✓</span>
          </span>
          <div class="item-copy">
            <div class="item-title restaurant-title-line">
              <span class="restaurant-title-text">${escapeHtml(poi.name)}</span>
              ${resultCreditLogos}
              <span class="saved-result-badge">${savedStateText}</span>
            </div>
            <div class="item-meta">${escapeHtml(searchResultAddress(poi))}</div>
          </div>
          <span class="search-result-action saved-action">${existingPlace.isMarked === false && canEdit ? "恢复收藏" : "查看收藏"}</span>
        `;
      } else {
        item.innerHTML = `
        <div class="item-copy">
          <div class="item-title restaurant-title-line">
            <span class="restaurant-title-text">${escapeHtml(poi.name)}</span>
            ${resultCreditLogos}
          </div>
          <div class="item-meta">${escapeHtml(searchResultAddress(poi))}</div>
        </div>
        <span class="search-result-action">${canEdit ? "收藏到地图" : "查看位置"}</span>
        `;
      }

      const selectResult = () => existingPlace
        ? openSavedSearchResult(existingPlace, marker)
        : openSearchResult(poi, location, marker);
      item.onclick = selectResult;
      item.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectResult();
        }
      };
      if (!existingPlace) marker.on("click", selectResult);

      host.appendChild(item);
  });

  appendManualSearchAction(host, keyword, parsed.city);
  if (searchMarkers.length) {
    map.setFitView(searchMarkers, false, searchViewportPadding(), 16);
  }
}

function getCategories() {
  return savedCategories
    .map((category) => category.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function renderCategorySelect(currentCategory = "") {
  const select = $("categorySelect");
  const categories = getCategories();
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = categories.length ? "请选择分类" : "尚未创建分类";
  placeholder.disabled = true;
  placeholder.selected = !currentCategory;
  select.appendChild(placeholder);

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === currentCategory;
    select.appendChild(option);
  });

  if (currentCategory && !categories.includes(currentCategory)) {
    const option = document.createElement("option");
    option.value = currentCategory;
    option.textContent = currentCategory;
    option.selected = true;
    select.appendChild(option);
  }
}

function openDeleteCategoryDialog(category, count) {
  pendingDeleteCategory = category;
  $("deleteCategoryMessage").innerHTML =
    `确定删除分类 <strong>“${escapeHtml(category)}”</strong> 吗？` +
    (count ? ` 该分类下目前有 <strong>${count}</strong> 家餐厅。` : "");
  $("deleteCategoryDialog").showModal();
}

function closeDeleteCategoryDialog() {
  pendingDeleteCategory = "";
  $("deleteCategoryDialog").close();
}

function confirmDeleteCategory(event) {
  event.preventDefault();
  const category = pendingDeleteCategory;
  if (!category || !canEdit) {
    closeDeleteCategoryDialog();
    return;
  }

  savedCategories = savedCategories.filter((item) => item.name !== category);

  savedPlaces = savedPlaces.map((place) => {
    if (place.category !== category) return place;

    return {
      ...place,
      category: "",
      categoryId: "",
      iconId: "",
      iconUrl: "",
      isMarked: false,
      updatedAt: new Date().toISOString()
    };
  });

  activeCategories.delete(category);
  persistCategoryLibrary();
  persistPlaces();
  closeDeleteCategoryDialog();
  renderAll();
}

function renderCategoryIconLibrary() {
  const host = $("categoryIconLibrary");
  host.innerHTML = "";
  const availableIcons = categoryLibraryIcons();

  if (!availableIcons.length) {
    host.innerHTML = `
      <div class="icon-library-empty">
        还没有可用的 Logo。请先上传一个图片。
      </div>
    `;
    return;
  }

  availableIcons.forEach((icon) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `saved-icon-option ${selectedCategoryIconId === icon.id ? "selected" : ""}`;
    button.title = icon.name || "自定义图标";
    button.innerHTML = `<img src="${icon.url}" alt="${escapeHtml(icon.name || "自定义图标")}">`;
    button.onclick = () => {
      selectedCategoryIconId = icon.id;
      renderCategoryIconLibrary();
    };
    host.appendChild(button);
  });
}

function openCategoryDialog(categoryReference = "", returnToPlace = false) {
  if (!canEdit) return;
  const category = typeof categoryReference === "string"
    ? findCategory(categoryReference, categoryReference)
    : null;

  editingCategoryId = category?.id || "";
  categoryDialogReturnToPlace = Boolean(returnToPlace && !category);
  $("standaloneCategoryName").value = category?.name || "";
  $("standaloneCategoryName").readOnly = Boolean(category);
  $("standaloneCategoryName").classList.toggle("readonly-field", Boolean(category));
  selectedCategoryIconId = category?.iconId ||
    savedIcons.find((icon) => icon.url === category?.iconUrl)?.id || "";
  $("categoryDialogTitle").textContent = category ? "更换分类 Logo" : "新建分类";
  $("categoryIconHelp").textContent = category
    ? `“${category.name}”下的所有地点都会同步使用新的 Logo。`
    : "一个分类固定使用一个 Logo；地点会自动沿用，无需重复选择。";
  $("saveCategoryBtn").textContent = category ? "保存 Logo" : "创建分类";
  renderCategoryIconLibrary();
  $("categoryDialog").showModal();
  setTimeout(() => {
    if (category) {
      $("categoryIconLibrary").querySelector("button")?.focus();
    } else {
      $("standaloneCategoryName").focus();
    }
  }, 0);
}

function closeCategoryEditorDialog() {
  editingCategoryId = "";
  categoryDialogReturnToPlace = false;
  $("categoryDialog").close();
}

function selectedCategoryIconUrl() {
  return savedIcons.find((icon) => icon.id === selectedCategoryIconId)?.url || "";
}

function saveStandaloneCategory(event) {
  event.preventDefault();
  if (!canEdit) return;

  const name = normalizeCategoryName($("standaloneCategoryName").value);
  if (!name) return;

  if (!selectedCategoryIconId) {
    alert("请选择或上传一个分类 Logo。");
    return;
  }

  let category = editingCategoryId
    ? savedCategories.find((item) => item.id === editingCategoryId)
    : null;

  if (!category) {
    const exists = savedCategories.some(
      (item) => categoryKey(item.name) === categoryKey(name)
    );

    if (exists) {
      alert("这个分类已经存在，不能创建两个同名分类。");
      $("standaloneCategoryName").focus();
      return;
    }

    category = {
      id: newCategoryId(),
      name,
      iconId: selectedCategoryIconId,
      iconUrl: selectedCategoryIconUrl(),
      createdAt: new Date().toISOString()
    };
    savedCategories.push(category);
  } else {
    category.iconId = selectedCategoryIconId;
    category.iconUrl = selectedCategoryIconUrl();
    category.updatedAt = new Date().toISOString();
  }

  ensureCategoryIntegrity();
  persistCategoryLibrary();
  persistPlaces();
  $("categoryDialog").close();
  if (categoryDialogReturnToPlace) renderCategorySelect(category.name);
  editingCategoryId = "";
  categoryDialogReturnToPlace = false;
  renderAll();
}

function setRecommendationPhoto(dataUrl, fileId = "") {
  recommendationPhotoData = dataUrl || "";
  recommendationPhotoFileId = fileId || "";
  $("recommendationPhotoPreview").classList.toggle("hidden", !recommendationPhotoData);

  if (recommendationPhotoData) {
    $("recommendationPhotoImage").src = recommendationPhotoData;
  } else {
    $("recommendationPhotoImage").removeAttribute("src");
    $("recommendationPhotoFile").value = "";
  }
}

function setVisitMode(mode) {
  selectedVisitMode = mode === "with" ? "with" : "solo";

  $("visitSoloBtn").classList.toggle("selected", selectedVisitMode === "solo");
  $("visitWithBtn").classList.toggle("selected", selectedVisitMode === "with");
  $("visitCompanionsField").classList.toggle("hidden", selectedVisitMode !== "with");

  if (selectedVisitMode === "solo") {
    $("visitCompanions").value = "";
  }
}

function openPlaceDialog(data, editingId = "") {
  if (!canEdit) return;
  $("placeId").value = editingId;
  $("poiId").value = data.poiId || "";
  $("longitude").value = data.location[0];
  $("latitude").value = data.location[1];
  $("placeName").value = data.name || "";
  $("placeAddress").value = data.address || "";
  $("placeNote").value = data.note || "";

  renderCategorySelect(data.category || "");

  const recommendation = data.recommendation || {};
  $("recommendationTitle").value = recommendation.title || "";
  $("recommendationDescription").value = recommendation.description || "";
  setRecommendationPhoto(recommendation.photo || "", recommendation.photoFileId || "");

  const visitRecord = data.visitRecord || {};
  $("visitDate").value = visitRecord.date || "";
  $("visitCompanions").value = visitRecord.companions || "";
  setVisitMode(visitRecord.mode || "solo");

  $("deletePlaceBtn").classList.toggle("hidden", !editingId);
  $("dialogTitle").textContent = editingId ? "编辑地点" : "添加地点";

  $("placeDialog").showModal();
  window.requestAnimationFrame(() => {
    $("placeName").focus({ preventScroll: true });
  });
}

window.editSavedPlace = function (id) {
  if (!canEdit) return;
  infoWindow?.close();

  const place = savedPlaces.find((item) => item.id === id);
  if (!place) return;

  openPlaceDialog({
    name: place.name,
    address: place.address,
    category: place.category,
    note: place.note,
    recommendation: place.recommendation || {},
    visitRecord: place.visitRecord || {},
    location: [place.longitude, place.latitude],
    poiId: place.poiId || ""
  }, id);
};

function resolvedCategory() {
  return findCategory($("categorySelect").value);
}

function validateRecommendation() {
  const title = $("recommendationTitle").value.trim();
  const description = $("recommendationDescription").value.trim();

  if ((description || recommendationPhotoData) && !title) {
    alert("上传推荐照片或填写描述后，请同时填写推荐标题。");
    $("recommendationTitle").focus();
    return false;
  }

  return true;
}

function savePlace(event) {
  event.preventDefault();
  if (!canEdit) return;

  const category = resolvedCategory();
  if (!category) {
    alert("请选择分类，或先新建一个分类。");
    return;
  }

  if (!validateRecommendation()) return;

  if (
    $("visitDate").value &&
    selectedVisitMode === "with" &&
    !$("visitCompanions").value.trim()
  ) {
    alert("选择“和别人一起”后，请填写同行人的名字。");
    $("visitCompanions").focus();
    return;
  }

  const editingId = $("placeId").value;
  const existingPlace = editingId
    ? savedPlaces.find((item) => item.id === editingId)
    : null;
  const recommendationTitle = $("recommendationTitle").value.trim();

  const place = {
    id: editingId || (
      crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    ),
    poiId: $("poiId").value,
    name: $("placeName").value.trim(),
    address: $("placeAddress").value.trim(),
    category: category.name,
    categoryId: category.id,
    note: $("placeNote").value.trim(),
    longitude: Number($("longitude").value),
    latitude: Number($("latitude").value),
    iconId: "",
    iconUrl: "",
    credits: restaurantCreditsForCandidate({
      ...(existingPlace || {}),
      poiId: $("poiId").value,
      name: $("placeName").value.trim(),
      address: $("placeAddress").value.trim(),
      longitude: Number($("longitude").value),
      latitude: Number($("latitude").value)
    }),
    isMarked: true,
    recommendation: recommendationTitle
      ? {
          title: recommendationTitle,
          description: $("recommendationDescription").value.trim(),
          photo: recommendationPhotoData,
          photoFileId: recommendationPhotoFileId
        }
      : null,
    visitRecord: $("visitDate").value
      ? {
          date: $("visitDate").value,
          mode: selectedVisitMode,
          companions: selectedVisitMode === "with"
            ? $("visitCompanions").value.trim()
            : ""
        }
      : null,
    updatedAt: new Date().toISOString()
  };

  if (!place.name || !Number.isFinite(place.longitude)) return;

  const duplicatePlace = findExistingPlace(place, editingId);
  if (duplicatePlace) {
    alert(duplicatePlace.isMarked === false
      ? "这个地点已经存在于地图资料中，请直接恢复并编辑原地点。"
      : "这个地点已经收藏过了，不能重复添加。即将为你打开原地点。");
    $("placeDialog").close();
    clearSearchMarkers();
    renderAll();

    if (duplicatePlace.isMarked === false && canEdit) {
      window.editSavedPlace(duplicatePlace.id);
    } else {
      const duplicateLocation = placeLocation(duplicatePlace);
      if (duplicateLocation) map.setZoomAndCenter(17, duplicateLocation);
      markers.get(duplicatePlace.id)?.emit("click");
    }
    return;
  }

  if (editingId) {
    savedPlaces = savedPlaces.map((item) => item.id === editingId ? place : item);
  } else {
    savedPlaces.push(place);
  }

  persistPlaces();
  $("placeDialog").close();
  $("searchResultsSection").classList.add("hidden");
  activeSearchId += 1;
  clearSearchMarkers();
  renderAll();
}

function deleteCurrentPlace() {
  if (!canEdit) return;
  const id = $("placeId").value;
  if (!id || !confirm("确定删除这个地点吗？")) return;

  savedPlaces = savedPlaces.filter((item) => item.id !== id);
  persistPlaces();
  $("placeDialog").close();
  renderAll();
}

function openRenameMapDialog() {
  if (!canEdit) return;
  $("mapTitleInput").value = mapTitle;
  $("renameMapDialog").showModal();
  window.setTimeout(() => {
    $("mapTitleInput").focus();
    $("mapTitleInput").select();
  }, 0);
}

function closeRenameMapDialog() {
  $("renameMapDialog").close();
}

function saveMapTitle(event) {
  event.preventDefault();
  if (!canEdit) return;

  const requestedTitle = $("mapTitleInput").value.trim();
  if (!requestedTitle) {
    $("mapTitleInput").focus();
    return;
  }

  const nextTitle = normalizeMapTitle(requestedTitle);
  closeRenameMapDialog();
  if (nextTitle === mapTitle) return;

  mapTitle = nextTitle;
  applyMapIdentity();
  renderAll();
  scheduleSharedSave();
}

function exportData() {
  const data = sharedPayload();
  const payload = JSON.stringify({
    version: 2,
    id: "beijing",
    title: mapTitle,
    description: "共同编辑的北京美食地点",
    updatedAt: new Date().toISOString(),
    map: {
      center: window.MAP_CONFIG?.defaultCenter || [116.397428, 39.90923],
      zoom: window.MAP_CONFIG?.defaultZoom || 11
    },
    places: data.places,
    categories: data.categories,
    icons: data.icons
  }, null, 2);

  const blob = new Blob([payload], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `eatwithyu-beijing-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function optimizedImageDataUrl(file, kind) {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("原图过大，请选择 12 MB 以内的图片。");
  }

  if (file.type === "image/svg+xml") {
    if (kind !== "icon") throw new Error("推荐照片请使用 PNG、JPG 或 WebP。");
    if (file.size > 300 * 1024) throw new Error("SVG 图标请控制在 300 KB 以内。");
    return readFileAsDataUrl(file);
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("无法读取这张图片"));
      element.src = sourceUrl;
    });

    const maxDimension = kind === "icon" ? 256 : 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", kind === "icon" ? 0.88 : 0.82);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function uploadSharedAsset(file, kind) {
  const dataUrl = await optimizedImageDataUrl(file, kind);
  if (sharedProvider() === "static") {
    return { url: dataUrl, fileId: "" };
  }

  setSyncStatus(kind === "icon" ? "正在上传图标…" : "正在上传照片…", "saving");
  const result = await callCloudbase("uploadAsset", {
    editorToken: requestedEditorToken,
    kind,
    fileName: file.name,
    dataUrl
  });
  setSyncStatus("可共同编辑", "editable");
  return { url: result.url, fileId: result.fileId };
}

async function addIconFromFile(file) {
  const asset = await uploadSharedAsset(file, "icon");
  const icon = {
    id: crypto.randomUUID ? crypto.randomUUID() : `icon-${Date.now()}`,
    name: file.name.replace(/\.[^.]+$/, ""),
    url: asset.url,
    fileId: asset.fileId,
    createdAt: new Date().toISOString()
  };

  savedIcons.unshift(icon);
  selectedCategoryIconId = icon.id;
  renderCategoryIconLibrary();
  persistIconLibrary();
}

async function updateMapAvatarFromFile(file) {
  const asset = await uploadSharedAsset(file, "icon");
  const existing = mapAvatarIcon();
  const nextAvatar = {
    id: MAP_AVATAR_ICON_ID,
    name: "地图头像",
    url: asset.url,
    fileId: asset.fileId,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  savedIcons = [nextAvatar, ...savedIcons.filter((icon) => icon.id !== MAP_AVATAR_ICON_ID)];
  renderMapPresets();
  persistIconLibrary();
}

$("searchBtn").onclick = searchPoi;

$("poiKeyword").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPoi();
});

$("poiKeyword").addEventListener("input", (event) => {
  $("clearKeywordBtn").classList.toggle("hidden", !event.target.value);
});

$("clearKeywordBtn").onclick = () => {
  $("poiKeyword").value = "";
  $("clearKeywordBtn").classList.add("hidden");
  $("poiKeyword").focus();
};

$("clearResultsBtn").onclick = () => {
  $("searchResultsSection").classList.add("hidden");
  activeSearchId += 1;
  clearSearchMarkers();
};

$("newCategoryBtn").onclick = () => openCategoryDialog("", true);

$("placeForm").addEventListener("submit", savePlace);
$("deletePlaceBtn").onclick = deleteCurrentPlace;
$("closeDialogBtn").onclick = () => $("placeDialog").close();
$("cancelBtn").onclick = () => $("placeDialog").close();

$("visitSoloBtn").onclick = () => setVisitMode("solo");
$("visitWithBtn").onclick = () => setVisitMode("with");

$("recommendationPhotoFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const asset = await uploadSharedAsset(file, "photo");
    setRecommendationPhoto(asset.url, asset.fileId);
  } catch (error) {
    console.error(error);
    alert(error.message || "照片上传失败");
    setSyncStatus("照片上传失败", "error");
  } finally {
    event.target.value = "";
  }
};

$("removeRecommendationPhotoBtn").onclick = () => {
  setRecommendationPhoto("");
};

$("deleteCategoryForm").addEventListener("submit", confirmDeleteCategory);
$("closeDeleteCategoryDialogBtn").onclick = closeDeleteCategoryDialog;
$("cancelDeleteCategoryBtn").onclick = closeDeleteCategoryDialog;

$("categoryForm").addEventListener("submit", saveStandaloneCategory);
$("closeCategoryDialogBtn").onclick = closeCategoryEditorDialog;
$("cancelCategoryBtn").onclick = closeCategoryEditorDialog;

$("renameMapBtn").onclick = openRenameMapDialog;
$("renameMapForm").addEventListener("submit", saveMapTitle);
$("closeRenameMapDialogBtn").onclick = closeRenameMapDialog;
$("cancelRenameMapBtn").onclick = closeRenameMapDialog;

$("categoryIconFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    await addIconFromFile(file);
  } catch (error) {
    console.error(error);
    alert(error.message || "图标上传失败");
    setSyncStatus("图标上传失败", "error");
  } finally {
    event.target.value = "";
  }
};

$("mapAvatarFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file || !canEdit) return;

  const avatarButton = $("mapAvatarButton");
  avatarButton?.classList.add("uploading");
  avatarButton?.setAttribute("aria-busy", "true");

  try {
    await updateMapAvatarFromFile(file);
  } catch (error) {
    console.error(error);
    alert(error.message || "地图头像上传失败");
    setSyncStatus("头像上传失败", "error");
  } finally {
    event.target.value = "";
    avatarButton?.classList.remove("uploading");
    avatarButton?.removeAttribute("aria-busy");
  }
};

$("menuBtn").onclick = () => {
  $("mainPanel").classList.add("collapsed");
  $("openPanelBtn").classList.remove("hidden");
};

$("openPanelBtn").onclick = () => {
  $("mainPanel").classList.remove("collapsed");
  $("openPanelBtn").classList.add("hidden");
};

async function copyLink(button, url, successText, promptText) {
  try {
    await navigator.clipboard.writeText(url);
    const originalTooltip = button.dataset.tooltip || button.getAttribute("aria-label") || "";
    button.dataset.tooltip = successText;
    button.setAttribute("aria-label", successText);
    button.classList.add("copied");
    window.setTimeout(() => {
      button.dataset.tooltip = originalTooltip;
      button.setAttribute("aria-label", originalTooltip);
      button.classList.remove("copied");
    }, 1800);
  } catch {
    window.prompt(promptText, url);
  }
}

$("copyPublicLinkBtn").onclick = () => {
  const publicUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  copyLink($("copyPublicLinkBtn"), publicUrl, "公开链接已复制", "复制下面的公开链接");
};

$("copyEditorLinkBtn").onclick = () => {
  if (!canEdit) return;
  copyLink($("copyEditorLinkBtn"), window.location.href, "编辑链接已复制", "复制下面的编辑链接");
};

$("exportBackupBtn").onclick = exportData;

document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.(".restaurant-credit-logo.is-interactive");
  document.querySelectorAll(".restaurant-credit-logo.tooltip-visible").forEach((logo) => {
    if (logo !== trigger) logo.classList.remove("tooltip-visible");
  });

  if (!trigger) return;
  event.preventDefault();
  event.stopPropagation();
  trigger.classList.toggle("tooltip-visible");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".restaurant-credit-logo.tooltip-visible").forEach((logo) => {
    logo.classList.remove("tooltip-visible");
  });
});

bootstrapSharedMap().then(loadAmap);
