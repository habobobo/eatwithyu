const SHARED_MAP_FALLBACK_FILE = "./maps/beijing.json";
const DEFAULT_MAP_TITLE = "eatwithyu";
const MAP_AVATAR_ICON_ID = "__eatwithyu_map_avatar__";
const MAX_RECOMMENDATIONS = 10;
const DETAILED_POI_MIN_ZOOM = 14;
const CLEAN_BASE_MAP_FEATURES = ["bg", "road", "building"];
const DETAILED_BASE_MAP_FEATURES = [...CLEAN_BASE_MAP_FEATURES, "point"];
const CURRENT_LOCATION_ROUTE_ID = "__current_location__";
const poiModel = window.POIModel;
const ROUTE_MODES = [
  {
    id: "driving",
    label: "驾车",
    service: "Driving",
    icon: '<path d="M5.2 7.2 6.5 4h11l1.3 3.2A3 3 0 0 1 21 10v7h-2v2h-2v-2H7v2H5v-2H3v-7a3 3 0 0 1 2.2-2.8ZM7.8 6 7 8h10l-.8-2H7.8ZM6 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm12 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>'
  },
  {
    id: "transit",
    label: "公交",
    service: "Transfer",
    icon: '<path d="M6 3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-2 2.83V20h-2v-2H7v2H5v-2.17A3 3 0 0 1 3 15V6a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v4h14V6a1 1 0 0 0-1-1H6Zm0 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm12 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/>'
  },
  {
    id: "walking",
    label: "步行",
    service: "Walking",
    icon: '<path d="M13 4.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm-1.2 2.1 2.4 1.2 1.5 2.5 1.7-1 1 1.7-3.4 2-1.6-2.3-.7 3.3 2.3 2.1-1.3 4.4-1.9-.6 1-3.4-2.8-2.4-1.2 6-2 .1.9-4.6 1.3-4.8-1.6-.7-2.4 3.5-1.7-1 3.3-5 3.6-1.1Z"/>'
  },
  {
    id: "riding",
    label: "骑行",
    service: "Riding",
    icon: '<path d="M5.5 11a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm13-2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM11 5h3l1 2h-3.2l1.5 3H16l1 2h-5l-2-4H8.2l-1 2H5l2.2-4H11V5Z"/>'
  }
];
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
let activeBaseMapFeatures = "";
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
let activeCategoryGroup = "";
let categoryFilterActive = false;
let selectedCategoryIconId = "";
let editingCategoryId = "";
let categoryDialogReturnToPlace = false;
let categoryIntegrityChanged = false;
let recommendationDrafts = [];
let editingDetailType = "general";
let detailFieldDrafts = {};
let categoryGroupManuallyChosen = false;
const uploadingEntryIds = new Set();
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
let mobileSheetState = "peek";
let routeOriginId = "";
let routeDestinationId = "";
let routeQueryId = 0;
let routeResults = new Map();
let routeOverlays = [];
let activeRouteMode = "driving";
let activeRoutePlanIndex = 0;
let currentRouteLocation = null;
let currentRouteLocatedAt = 0;
let currentRouteLocationPromise = null;
let routeLocationRequestId = 0;

const $ = (id) => document.getElementById(id);

function isMobileSheetViewport() {
  return window.matchMedia("(max-width: 680px)").matches;
}

function mobileSheetStateIndex(state = mobileSheetState) {
  return ["peek", "half", "full"].indexOf(state);
}

function updateMobileSheetAccessibility() {
  const grip = $("mobileSheetGrip");
  if (!grip) return;
  const isExpanded = mobileSheetState !== "peek";
  grip.setAttribute("aria-expanded", String(isExpanded));
  grip.setAttribute(
    "aria-label",
    mobileSheetState === "peek"
      ? "展开地点列表"
      : mobileSheetState === "full"
        ? "缩小地点列表"
        : "展开或收起地点列表"
  );
}

function setMobileSheetState(state, options = {}) {
  if (!isMobileSheetViewport()) return;
  const nextState = ["peek", "half", "full"].includes(state) ? state : "peek";
  mobileSheetState = nextState;
  const panel = $("mainPanel");
  const content = $("panelContent");
  panel.dataset.mobileSheet = nextState;
  panel.classList.remove("collapsed");
  panel.removeAttribute("data-mobile-sheet-dragging");
  content.style.removeProperty("--mobile-sheet-drag-height");
  if (nextState === "peek") content.scrollTop = 0;
  $("openPanelBtn").classList.add("hidden");
  updateMobileSheetAccessibility();
  if (!options.immediate) {
    window.setTimeout(() => map?.resize(), 300);
  }
}

function stepMobileSheet(direction) {
  const states = ["peek", "half", "full"];
  const currentIndex = Math.max(0, mobileSheetStateIndex());
  const nextIndex = Math.max(0, Math.min(states.length - 1, currentIndex + direction));
  setMobileSheetState(states[nextIndex]);
}

function updateMobileSheetMeta() {
  if ($("mobileSheetTitle")) $("mobileSheetTitle").textContent = mapTitle;
  if ($("mobileSheetSummary")) {
    $("mobileSheetSummary").textContent = `${currentPlaces().length} 个地点`;
  }
}

function initializeMobileSheet() {
  const grip = $("mobileSheetGrip");
  const panel = $("mainPanel");
  const content = $("panelContent");
  if (!grip || !panel || !content) return;

  let dragStartY = 0;
  let dragStartHeight = 0;
  let dragMoved = false;
  let suppressClick = false;

  grip.addEventListener("click", () => {
    if (!isMobileSheetViewport() || suppressClick) {
      suppressClick = false;
      return;
    }
    if (mobileSheetState === "full") stepMobileSheet(-1);
    else stepMobileSheet(1);
  });

  grip.addEventListener("pointerdown", (event) => {
    if (!isMobileSheetViewport()) return;
    dragStartY = event.clientY;
    dragStartHeight = content.getBoundingClientRect().height;
    dragMoved = false;
    grip.setPointerCapture?.(event.pointerId);
    panel.setAttribute("data-mobile-sheet-dragging", "true");
    content.style.setProperty("--mobile-sheet-drag-height", `${dragStartHeight}px`);
  });

  grip.addEventListener("pointermove", (event) => {
    if (!panel.hasAttribute("data-mobile-sheet-dragging")) return;
    const delta = dragStartY - event.clientY;
    if (Math.abs(delta) > 6) dragMoved = true;
    const minHeight = 76;
    const maxHeight = Math.max(320, window.innerHeight - 80);
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, dragStartHeight + delta));
    content.style.setProperty("--mobile-sheet-drag-height", `${nextHeight}px`);
  });

  const finishDrag = (event) => {
    if (!panel.hasAttribute("data-mobile-sheet-dragging")) return;
    const delta = dragStartY - event.clientY;
    panel.removeAttribute("data-mobile-sheet-dragging");
    content.style.removeProperty("--mobile-sheet-drag-height");
    if (dragMoved) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 350);
      if (event.type === "pointercancel") setMobileSheetState(mobileSheetState);
      else if (delta > 44) stepMobileSheet(1);
      else if (delta < -44) stepMobileSheet(-1);
      else setMobileSheetState(mobileSheetState);
    }
  };

  grip.addEventListener("pointerup", finishDrag);
  grip.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    if (isMobileSheetViewport()) {
      setMobileSheetState(mobileSheetState, { immediate: true });
    } else {
      panel.removeAttribute("data-mobile-sheet-dragging");
      content.style.removeProperty("--mobile-sheet-drag-height");
    }
  });

  setMobileSheetState("peek", { immediate: true });
}

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

function normalizedRecommendations(place = {}) {
  return poiModel.normalizeEntries(place);
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
  const categoriesById = new Map(savedCategories.map((category) => [category.id, category]));

  savedPlaces = savedPlaces.map((place) => {
    const recommendations = normalizedRecommendations(place);
    return {
      ...place,
      category: place.category || categoriesById.get(place.categoryId)?.name || "",
      credits: normalizedRestaurantCredits(place.credits),
      iconUrl: place.iconId
        ? iconsById.get(place.iconId)?.url || ""
        : place.iconUrl || "",
      recommendations,
      // 暂时保留第一道菜的旧字段，兼容仍在使用旧缓存的页面。
      recommendation: recommendations[0] || null
    };
  });
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
      const recommendations = normalizedRecommendations(place).map((item) => ({
        ...item,
        photo: item.photoFileId ? "" : item.photo || ""
      }));
      const compactPlace = {
        ...place,
        categoryId: category?.id || "",
        credits: normalizedRestaurantCredits(place.credits),
        detailsByType: poiModel.normalizeDetails(place.detailsByType),
        recommendations
      };

      // 分类名称、地点 Logo 和旧版单道推荐菜都能从其他字段重建。
      // 不再在每次保存时重复上传，避免超过 CloudBase HTTP 的请求体上限。
      if (compactPlace.categoryId) delete compactPlace.category;
      delete compactPlace.iconId;
      delete compactPlace.iconUrl;
      delete compactPlace.recommendation;
      if (!compactPlace.credits.length) delete compactPlace.credits;
      if (!compactPlace.recommendations.length) delete compactPlace.recommendations;
      if (!Object.keys(compactPlace.detailsByType).length) delete compactPlace.detailsByType;
      if (compactPlace.isMarked === true) delete compactPlace.isMarked;
      Object.keys(compactPlace).forEach((key) => {
        if (compactPlace[key] === "" || compactPlace[key] == null) delete compactPlace[key];
      });
      return compactPlace;
    }),
    categories: savedCategories.map((category) => {
      const compactCategory = {
        ...category,
        groupId: poiModel.categoryGroup(category),
        detailType: poiModel.categoryDetailType(category)
      };
      if (compactCategory.iconId) delete compactCategory.iconUrl;
      Object.keys(compactCategory).forEach((key) => {
        if (compactCategory[key] === "" || compactCategory[key] == null) delete compactCategory[key];
      });
      return compactCategory;
    }),
    icons: savedIcons.map((icon) => {
      const compactIcon = { ...icon };
      if (compactIcon.fileId) delete compactIcon.url;
      Object.keys(compactIcon).forEach((key) => {
        if (compactIcon[key] === "" || compactIcon[key] == null) delete compactIcon[key];
      });
      return compactIcon;
    })
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
    } else if (/EXCEED_MAX_PAYLOAD_SIZE|payload size|请求体.*(过大|上限)/i.test(`${error.code || ""} ${error.message || ""}`)) {
      alert("地图数据超过云端单次保存上限。请刷新页面后重试；如果仍然失败，请联系管理员迁移旧图标数据。");
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
    "&plugin=AMap.PlaceSearch,AMap.Geocoder,AMap.Scale,AMap.ToolBar," +
    "AMap.Driving,AMap.Transfer,AMap.Walking,AMap.Riding,AMap.Geolocation";

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

    // 城市概览隐藏密集的默认 POI；放大到街区后再显示地铁站等信息。
    features: CLEAN_BASE_MAP_FEATURES
  });

  const updateBaseMapDensity = () => {
    const showDetailedPois = Number(map.getZoom()) >= DETAILED_POI_MIN_ZOOM;
    const nextFeatures = showDetailedPois
      ? DETAILED_BASE_MAP_FEATURES
      : CLEAN_BASE_MAP_FEATURES;
    const nextKey = nextFeatures.join(",");
    if (nextKey === activeBaseMapFeatures) return;
    activeBaseMapFeatures = nextKey;
    map.setFeatures(nextFeatures);
  };

  updateBaseMapDensity();
  map.on("zoomend", updateBaseMapDensity);

  map.addControl(new AMap.Scale());
  map.addControl(new AMap.ToolBar({
    position: window.matchMedia("(max-width: 680px)").matches
      ? { right: "12px", bottom: "86px" }
      : { right: "20px", top: "20px" }
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

  const openManualPlaceAt = (lnglat) => {
    if (!canEdit) return;
    const placeName = pendingManualPlaceName || "地图上的地点";
    resetManualPlacement();
    openPlaceDialog({
      name: placeName,
      address: "",
      location: [lnglat.lng, lnglat.lat],
      poiId: ""
    });
  };

  map.on("dblclick", (event) => openManualPlaceAt(event.lnglat));

  // 手机上没有可靠的“双击地图”手势，长按约 0.65 秒即可手动落点。
  const mapContainer = map.getContainer();
  let longPressTimer = 0;
  let longPressStart = null;
  const cancelLongPress = () => {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
    longPressStart = null;
  };

  mapContainer.addEventListener("pointerdown", (event) => {
    if (!canEdit || event.pointerType !== "touch") return;
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest(".amap-controls, .amap-info-window")) return;
    longPressStart = { x: event.clientX, y: event.clientY };
    longPressTimer = window.setTimeout(() => {
      if (!longPressStart) return;
      const rect = mapContainer.getBoundingClientRect();
      const pixel = new AMap.Pixel(
        longPressStart.x - rect.left,
        longPressStart.y - rect.top
      );
      openManualPlaceAt(map.containerToLngLat(pixel));
      if (navigator.vibrate) navigator.vibrate(20);
      cancelLongPress();
    }, 650);
  }, { passive: true });

  mapContainer.addEventListener("pointermove", (event) => {
    if (!longPressStart) return;
    const movement = Math.hypot(
      event.clientX - longPressStart.x,
      event.clientY - longPressStart.y
    );
    if (movement > 10) cancelLongPress();
  }, { passive: true });
  mapContainer.addEventListener("pointerup", cancelLongPress, { passive: true });
  mapContainer.addEventListener("pointercancel", cancelLongPress, { passive: true });

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

function routePlaceById(placeId) {
  if (placeId === CURRENT_LOCATION_ROUTE_ID) return currentRouteLocation;
  return savedPlaces.find((place) => place.id === placeId) || null;
}

function amapPositionCoordinates(position) {
  const longitude = Number(typeof position?.getLng === "function" ? position.getLng() : position?.lng);
  const latitude = Number(typeof position?.getLat === "function" ? position.getLat() : position?.lat);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function currentLocationErrorMessage(result) {
  const details = `${result?.message || ""} ${result?.info || ""}`.toLowerCase();
  if (/denied|permission|拒绝|权限/.test(details)) {
    return "无法使用当前位置，请在浏览器设置中允许此网站访问位置。";
  }
  if (/timeout|超时/.test(details)) {
    return "定位超时，请到开阔处或确认系统定位服务已开启后重试。";
  }
  return "暂时无法获取当前位置，请检查系统定位服务和网络后重试。";
}

function locateCurrentRoutePlace(force = false) {
  const isFresh = currentRouteLocation && Date.now() - currentRouteLocatedAt < 30000;
  if (!force && isFresh) return Promise.resolve(currentRouteLocation);
  if (currentRouteLocationPromise) return currentRouteLocationPromise;

  currentRouteLocationPromise = new Promise((resolve, reject) => {
    const begin = () => {
      if (typeof window.AMap?.Geolocation !== "function") {
        reject(new Error("当前浏览器暂不支持定位。"));
        return;
      }

      const geolocation = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
        convert: true,
        needAddress: true,
        extensions: "all",
        showButton: false,
        showMarker: false,
        showCircle: false,
        panToLocation: false,
        zoomToAccuracy: false
      });
      geolocation.getCurrentPosition((status, result) => {
        const coordinates = status === "complete" ? amapPositionCoordinates(result?.position) : null;
        if (!coordinates) {
          reject(new Error(currentLocationErrorMessage(result)));
          return;
        }

        const addressComponent = result?.addressComponent || {};
        const city = Array.isArray(addressComponent.city)
          ? addressComponent.province || ""
          : addressComponent.city || addressComponent.province || "";
        currentRouteLocation = {
          id: CURRENT_LOCATION_ROUTE_ID,
          name: "当前位置",
          category: "",
          address: result?.formattedAddress || "GPS 定位",
          cityname: city,
          city,
          longitude: coordinates[0],
          latitude: coordinates[1],
          accuracy: Number(result?.accuracy || 0)
        };
        currentRouteLocatedAt = Date.now();
        resolve(currentRouteLocation);
      });
    };

    if (typeof window.AMap?.plugin === "function") AMap.plugin("AMap.Geolocation", begin);
    else begin();
  }).finally(() => {
    currentRouteLocationPromise = null;
  });

  return currentRouteLocationPromise;
}

function routePoint(place) {
  const longitude = Number(place?.longitude);
  const latitude = Number(place?.latitude);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function routeCityName(place) {
  const text = `${place?.cityname || ""} ${place?.city || ""} ${place?.address || ""}`;
  for (const city of SEARCH_CITY_NAMES) {
    if (text.includes(city)) return `${city}市`;
  }
  return "";
}

function formatRouteDuration(seconds) {
  const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

function formatRouteDistance(meters) {
  const distance = Math.max(0, Number(meters || 0));
  if (distance < 1000) return `${Math.max(1, Math.round(distance / 10) * 10)} 米`;
  const kilometers = distance / 1000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} 公里`;
}

function routeOptionLabel(place) {
  const suffix = place.category ? ` · ${place.category}` : "";
  return `${place.name}${suffix}`;
}

function updateRoutePlaceSelectors() {
  const originSelect = $("routeOriginSelect");
  const destinationSelect = $("routeDestinationSelect");
  if (!originSelect || !destinationSelect) return;

  const places = savedPlaces
    .filter((place) => place.isMarked !== false && routePoint(place))
    .sort((first, second) => first.name.localeCompare(second.name, "zh-CN"));
  const options = places.map((place) => (
    `<option value="${escapeHtml(place.id)}">${escapeHtml(routeOptionLabel(place))}</option>`
  )).join("");
  const currentLocationOption = `<option value="${CURRENT_LOCATION_ROUTE_ID}">当前位置</option>`;
  const savedPlaceOptions = options
    ? `<optgroup label="已标记地点">${options}</optgroup>`
    : "";

  originSelect.innerHTML = `<option value="">选择出发地</option>${currentLocationOption}${savedPlaceOptions}`;
  destinationSelect.innerHTML = `<option value="">选择目的地</option>${currentLocationOption}${savedPlaceOptions}`;

  if (routeOriginId !== CURRENT_LOCATION_ROUTE_ID && !routePlaceById(routeOriginId)) routeOriginId = "";
  if (routeDestinationId !== CURRENT_LOCATION_ROUTE_ID && !routePlaceById(routeDestinationId)) routeDestinationId = "";
  originSelect.value = routeOriginId;
  destinationSelect.value = routeDestinationId;
}

function clearRouteOverlays() {
  if (map && routeOverlays.length) map.remove(routeOverlays);
  routeOverlays = [];
}

function routeEndpointOverlay(place, type) {
  const content = document.createElement("div");
  content.className = `route-map-endpoint route-map-endpoint-${type}`;
  content.textContent = type === "start" ? "起" : "终";
  return new AMap.Marker({
    position: routePoint(place),
    content,
    anchor: "center",
    zIndex: 520
  });
}

function routeLine(path, color, dashed = false) {
  return new AMap.Polyline({
    path,
    isOutline: true,
    outlineColor: "rgba(255,255,255,.96)",
    borderWeight: 2,
    strokeWeight: 6,
    strokeColor: color,
    strokeOpacity: .92,
    strokeStyle: dashed ? "dashed" : "solid",
    lineJoin: "round",
    lineCap: "round",
    zIndex: 310
  });
}

function routePathFromSteps(steps = []) {
  return steps.flatMap((step) => Array.isArray(step?.path) ? step.path : []);
}

function routeLinesForResult(option) {
  const route = option?.route;
  if (!route) return [];

  if (option.mode === "transit") {
    return (route.segments || []).flatMap((segment) => {
      const path = segment?.transit?.path;
      if (!Array.isArray(path) || path.length < 2) return [];
      const walking = segment.transit_mode === "WALK";
      return [routeLine(path, walking ? "#8a8f98" : "#1a73e8", walking)];
    });
  }

  const steps = option.mode === "riding" ? route.rides : route.steps;
  const path = routePathFromSteps(steps);
  if (path.length < 2) return [];
  const color = option.mode === "walking"
    ? "#188038"
    : option.mode === "riding"
      ? "#7b61d1"
      : "#1a73e8";
  return [routeLine(path, color, option.mode === "walking")];
}

function drawRouteResult(modeId, planIndex = 0) {
  const result = routeResults.get(modeId);
  const origin = routePlaceById(routeOriginId);
  const destination = routePlaceById(routeDestinationId);
  const option = result?.options?.[planIndex];
  if (!map || !option || !origin || !destination) return;

  clearRouteOverlays();
  activeRouteMode = modeId;
  activeRoutePlanIndex = planIndex;
  const startMarker = routeEndpointOverlay(origin, "start");
  const endMarker = routeEndpointOverlay(destination, "end");
  const lines = routeLinesForResult(option);
  routeOverlays = [startMarker, endMarker, ...lines];
  map.add(routeOverlays);
  infoWindow?.close();

  const padding = isMobileSheetViewport()
    ? [92, 34, mobileSheetState === "peek" ? 130 : 250, 34]
    : [80, 80, 90, 430];
  map.setFitView(routeOverlays, false, padding, 16);

  $("routePlanList")?.querySelectorAll(".route-plan-card").forEach((card) => {
    card.classList.toggle("selected", Number(card.dataset.routePlanIndex) === planIndex);
  });
}

function transitLineNames(route) {
  const names = (route?.segments || []).flatMap((segment) => {
    const transit = segment?.transit || {};
    const lines = [
      ...(Array.isArray(transit.lines) ? transit.lines : []),
      ...(Array.isArray(transit.buslines) ? transit.buslines : [])
    ];
    return lines.map((line) => String(line?.name || "").split("(")[0].trim()).filter(Boolean);
  });
  return [...new Set(names)].slice(0, 4);
}

function routeOptionTitle(mode, route, index) {
  if (mode.id === "transit") {
    const lines = transitLineNames(route);
    return lines.length ? lines.join(" → ") : `公交方案 ${index + 1}`;
  }
  if (mode.id === "driving") {
    const policy = String(route?.policy || "").trim();
    return policy && !/^\d+$/.test(policy) ? policy : (index === 0 ? "推荐路线" : `备选路线 ${index + 1}`);
  }
  return `${mode.label}方案${index ? ` ${index + 1}` : ""}`;
}

function routeOptionMeta(mode, route, rawResult) {
  const parts = [];
  const distance = Number(route?.distance || 0);
  if (distance) parts.push(formatRouteDistance(distance));

  if (mode.id === "driving") {
    const tolls = Number(route?.tolls || 0);
    if (tolls > 0) parts.push(`收费约 ¥${Math.round(tolls)}`);
    const lights = Number(route?.traffic_lights || 0);
    if (lights > 0) parts.push(`${lights} 个红绿灯`);
  } else if (mode.id === "transit") {
    const walkingDistance = Number(route?.walking_distance || 0);
    if (walkingDistance > 0) parts.push(`步行 ${formatRouteDistance(walkingDistance)}`);
    const cost = Number(route?.cost || 0);
    if (cost > 0) parts.push(`¥${cost.toFixed(cost % 1 ? 1 : 0)}`);
  }

  if (mode.id === "driving" && Number(rawResult?.taxi_cost) > 0) {
    parts.push(`打车约 ¥${Math.round(Number(rawResult.taxi_cost))}`);
  }
  return parts;
}

function routeResultOptions(mode, rawResult) {
  const routes = mode.id === "transit" ? rawResult?.plans : rawResult?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.map((route, index) => {
    const duration = Number(route?.time ?? route?.duration ?? 0);
    if (!duration) return null;
    return {
      mode: mode.id,
      route,
      rawResult,
      duration,
      distance: Number(route?.distance || 0),
      index,
      title: routeOptionTitle(mode, route, index),
      meta: routeOptionMeta(mode, route, rawResult)
    };
  }).filter(Boolean);
}

function searchRouteMode(mode, origin, destination) {
  return new Promise((resolve) => {
    const originCity = routeCityName(origin);
    const destinationCity = routeCityName(destination);
    if (mode.id === "transit" && originCity && destinationCity && originCity !== destinationCity) {
      resolve({ mode: mode.id, available: false, message: "仅支持同城公交" });
      return;
    }

    try {
      const options = { extensions: "all" };
      if (mode.id === "driving") {
        options.policy = AMap.DrivingPolicy?.LEAST_TIME ?? 0;
      } else if (mode.id === "transit") {
        options.city = originCity || destinationCity || undefined;
        options.cityd = destinationCity || originCity || undefined;
        options.nightflag = true;
        options.policy = AMap.TransferPolicy?.LEAST_TIME ?? 0;
      } else if (mode.id === "riding") {
        options.policy = 1;
      }

      const service = new AMap[mode.service](options);
      const start = new AMap.LngLat(...routePoint(origin));
      const end = new AMap.LngLat(...routePoint(destination));
      const callback = (status, result) => {
        const options = status === "complete" ? routeResultOptions(mode, result) : [];
        resolve(options.length
          ? { mode: mode.id, available: true, rawResult: result, options }
          : {
              mode: mode.id,
              available: false,
              options: [],
              message: status === "no_data" ? "暂未找到可用方案" : "路线计算失败，请稍后重试"
            });
      };

      if (mode.id === "driving") {
        service.search(start, end, { waypoints: [] }, callback);
      } else {
        service.search(start, end, callback);
      }
    } catch (error) {
      console.warn(`Route search failed for ${mode.id}`, error);
      resolve({ mode: mode.id, available: false, message: "计算失败" });
    }
  });
}

function renderRouteModeTabs() {
  const host = $("routeModeTabs");
  if (!host) return;
  host.innerHTML = ROUTE_MODES.map((mode) => `
    <button
      class="route-mode-tab ${activeRouteMode === mode.id ? "selected" : ""}"
      type="button"
      role="tab"
      aria-selected="${activeRouteMode === mode.id}"
      data-route-mode="${mode.id}"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">${mode.icon}</svg>
      <span>${escapeHtml(mode.label)}</span>
    </button>
  `).join("");
}

function routePlanMarkup(option) {
  const meta = option.meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  return `
    <button
      class="route-plan-card ${activeRoutePlanIndex === option.index ? "selected" : ""}"
      type="button"
      data-route-plan-index="${option.index}"
      aria-label="${escapeHtml(option.title)}，${escapeHtml(formatRouteDuration(option.duration))}"
    >
      <span class="route-plan-duration">${escapeHtml(formatRouteDuration(option.duration))}</span>
      <span class="route-plan-title">${escapeHtml(option.title)}</span>
      ${meta ? `<span class="route-plan-meta">${meta}</span>` : ""}
      ${option.mode === "driving" ? '<span class="route-live-badge"><i></i>实时路况</span>' : ""}
    </button>
  `;
}

function renderRoutePlanList(result = null, loading = false) {
  const host = $("routePlanList");
  if (!host) return;
  if (loading) {
    host.innerHTML = `
      <div class="route-plan-loading" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    `;
    return;
  }
  if (!result?.available) {
    host.innerHTML = result?.message ? `<div class="route-plan-empty">${escapeHtml(result.message)}</div>` : "";
    return;
  }
  host.innerHTML = result.options.map(routePlanMarkup).join("");
}

function resetRouteResults() {
  routeQueryId += 1;
  routeResults = new Map();
  activeRoutePlanIndex = 0;
  clearRouteOverlays();
}

async function selectRouteEndpoint(endpoint, placeId) {
  const requestId = ++routeLocationRequestId;
  if (endpoint === "destination") routeDestinationId = placeId;
  else routeOriginId = placeId;
  resetRouteResults();

  if (placeId !== CURRENT_LOCATION_ROUTE_ID) {
    calculateActiveRoute();
    return;
  }

  $("routeStatus").textContent = "正在获取当前位置，请允许浏览器访问定位…";
  renderRoutePlanList(null, true);
  try {
    await locateCurrentRoutePlace(true);
    if (requestId !== routeLocationRequestId) return;
    updateRoutePlaceSelectors();
    $("routeStatus").textContent = "已获取当前位置，正在规划路线…";
    calculateActiveRoute();
  } catch (error) {
    if (requestId !== routeLocationRequestId) return;
    if (endpoint === "destination" && routeDestinationId === CURRENT_LOCATION_ROUTE_ID) routeDestinationId = "";
    if (endpoint !== "destination" && routeOriginId === CURRENT_LOCATION_ROUTE_ID) routeOriginId = "";
    updateRoutePlaceSelectors();
    const message = error?.message || "暂时无法获取当前位置。";
    $("routeStatus").textContent = message;
    renderRoutePlanList({ message });
  }
}

async function calculateActiveRoute(force = false) {
  const origin = routePlaceById(routeOriginId);
  const destination = routePlaceById(routeDestinationId);
  routeQueryId += 1;
  const queryId = routeQueryId;
  clearRouteOverlays();
  renderRouteModeTabs();

  if (!origin || !destination) {
    $("routeStatus").textContent = "选择出发地和目的地后查看路线。";
    renderRoutePlanList();
    return;
  }
  if (origin.id === destination.id) {
    $("routeStatus").textContent = "出发地和目的地不能是同一个地点。";
    renderRoutePlanList({ message: "请选择另一个目的地。" });
    return;
  }

  const mode = ROUTE_MODES.find((item) => item.id === activeRouteMode) || ROUTE_MODES[0];
  const cached = !force ? routeResults.get(mode.id) : null;
  if (cached) {
    renderRoutePlanList(cached);
    $("routeStatus").textContent = cached.available
      ? (mode.id === "driving" ? "已按实时路况更新 · 高德地图" : "路线和时间由高德地图实时返回")
      : cached.message;
    if (cached.available) drawRouteResult(mode.id, Math.min(activeRoutePlanIndex, cached.options.length - 1));
    return;
  }

  $("routeStatus").textContent = `正在规划${mode.label}路线…`;
  renderRoutePlanList(null, true);
  const result = await searchRouteMode(mode, origin, destination);
  if (queryId !== routeQueryId) return;

  routeResults.set(mode.id, result);
  activeRoutePlanIndex = 0;
  renderRoutePlanList(result);
  $("routeStatus").textContent = result.available
    ? (mode.id === "driving" ? "已按实时路况更新 · 高德地图" : "路线和时间由高德地图实时返回")
    : result.message;
  if (result.available) drawRouteResult(mode.id, 0);
}

function openRoutePlanner(placeId = "", endpoint = "") {
  const section = $("routePlannerSection");
  section.classList.remove("hidden");
  $("routePlannerBtn")?.classList.add("active");
  if (placeId && routePlaceById(placeId)) {
    const previousOriginId = routeOriginId;
    const previousDestinationId = routeDestinationId;
    if (endpoint === "destination") routeDestinationId = placeId;
    else routeOriginId = placeId;
    if (previousOriginId !== routeOriginId || previousDestinationId !== routeDestinationId) {
      resetRouteResults();
    }
  }
  updateRoutePlaceSelectors();
  renderRouteModeTabs();
  calculateActiveRoute();
  infoWindow?.close();

  if (isMobileSheetViewport()) {
    setMobileSheetState(routeOriginId && routeDestinationId ? "half" : "full");
  }
  window.setTimeout(() => {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 30);
}

function closeRoutePlanner() {
  routeQueryId += 1;
  $("routePlannerSection").classList.add("hidden");
  $("routePlannerBtn")?.classList.remove("active");
  clearRouteOverlays();
  if (isMobileSheetViewport()) setMobileSheetState("peek");
}

window.setRouteEndpoint = function (placeId, endpoint) {
  openRoutePlanner(placeId, endpoint);
};

function detailProfileForPlace(place) {
  const category = findCategory(place.category, place.categoryId) || { name: place.category };
  return poiModel.profile(poiModel.placeDetailType(place, category));
}

function placeMatchesCategoryFilter(place) {
  const category = findCategory(place.category, place.categoryId) || { name: place.category };
  if (activeCategoryGroup && poiModel.categoryGroup(category) !== activeCategoryGroup) return false;
  return !categoryFilterActive || activeCategories.has(place.category);
}

function placeEntriesMarkup(place, profile) {
  const entriesByType = new Map();
  normalizedRecommendations(place).forEach((entry) => {
    if (!entriesByType.has(entry.detailType)) entriesByType.set(entry.detailType, []);
    entriesByType.get(entry.detailType).push(entry);
  });
  // 当前模板优先；其他类型的历史内容保留其原来的含义。
  const orderedTypes = [profile.id, ...entriesByType.keys()].filter((id, index, all) => all.indexOf(id) === index);
  return orderedTypes.map((type) => {
    const entries = entriesByType.get(type) || [];
    if (!entries.length) return "";
    const entryProfile = poiModel.profile(type);
    return `<section class="info-recommendation" aria-label="${escapeHtml(entryProfile.title)}">
      <div class="recommendation-list-label"><span>${escapeHtml(entryProfile.title)}</span><span>${entries.length} ${entryProfile.unit}</span></div>
      <div class="recommendation-display-list ${entries.length > 3 ? "is-scrollable" : ""}">
        ${entries.map((entry) => `<div class="recommendation-list-item ${entry.photo ? "" : "no-photo"}">
          <div class="recommendation-copy"><strong>${escapeHtml(entry.title)}</strong>${entry.description ? `<p>${escapeHtml(entry.description)}</p>` : ""}</div>
          ${entry.photo ? `<img class="recommendation-thumbnail" src="${escapeHtml(entry.photo)}" alt="${escapeHtml(entry.title)}" loading="lazy">` : ""}
        </div>`).join("")}
      </div>
    </section>`;
  }).join("");
}

function placePracticalMarkup(place, profile) {
  const values = poiModel.normalizeDetails(place.detailsByType)[profile.id] || {};
  const rows = profile.fields.filter((field) => values[field.id]);
  if (!rows.length) return "";
  return `<section class="place-practical-summary" aria-label="实用信息"><dl>${rows.map((field) =>
    `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(values[field.id])}</dd></div>`
  ).join("")}</dl></section>`;
}

function addMarker(place) {
  if (!map) return;
  if (!placeMatchesCategoryFilter(place)) return;

  const hasIcon = Boolean(categoryIconForPlace(place));
  const marker = new AMap.Marker({
    position: [place.longitude, place.latitude],
    content: markerContent(place),
    offset: new AMap.Pixel(hasIcon ? -12 : -10, hasIcon ? -12 : -28),
    anchor: "center",
    zIndex: 120
  });

  marker.on("click", () => openPlaceDetails(place));
  marker.setMap(map);
  markers.set(place.id, marker);
}

function openPlaceDetails(place) {
    setMobileSheetState("peek");
    const profile = detailProfileForPlace(place);

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

    const detailCredits = profile.groupId === "food" ? restaurantCreditsForCandidate(place) : [];
    const content = `
      <article class="info-card place-detail-card">
        <header class="place-detail-header">
          <div class="place-detail-title-row">
            <h3>${escapeHtml(place.name)}</h3>
            ${restaurantCreditLogosMarkup(detailCredits, true)}
          </div>
          <div class="place-detail-location">
            <span class="place-detail-type">${escapeHtml(profile.name)}</span>
            ${place.category ? `<span>${escapeHtml(place.category)}</span>` : ""}
            ${place.category && place.address ? `<span class="place-detail-separator">·</span>` : ""}
            ${place.address ? `<span>${escapeHtml(place.address)}</span>` : ""}
          </div>
        </header>
        ${visitHtml}
        ${placePracticalMarkup(place, profile)}
        ${placeEntriesMarkup(place, profile)}
        ${place.note
          ? `<section class="place-note"><div class="place-note-label">备注</div><p>${escapeHtml(place.note)}</p></section>`
          : ""}
        <div class="place-detail-actions">
          <div class="place-route-actions" role="group" aria-label="将地点加入路线">
            <button class="place-route-button" type="button" onclick="window.setRouteEndpoint('${place.id}', 'origin')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.1 7 13 7 13s7-7.9 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>
              <span>从这里出发</span>
            </button>
            <button class="place-route-button" type="button" onclick="window.setRouteEndpoint('${place.id}', 'destination')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.1 7 13 7 13s7-7.9 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>
              <span>到这里去</span>
            </button>
          </div>
          ${canEdit
            ? `<button class="place-edit-button" type="button" onclick="window.editSavedPlace('${place.id}')">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 13.8V16h2.2l7.95-7.95-2.2-2.2L4 13.8Zm11.85-7.45a.6.6 0 0 0 0-.85l-1.35-1.35a.6.6 0 0 0-.85 0l-1.05 1.05 2.2 2.2 1.05-1.05Z"/></svg>
                <span>编辑</span>
              </button>`
            : ""}
        </div>
      </article>
    `;

    infoWindow.setContent(content);
    infoWindow.open(map, [place.longitude, place.latitude]);
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
      iconUrl: category.iconUrl || "",
      groupId: poiModel.categoryGroup(category)
    });
  });

  currentPlaces().filter((place) => place.isMarked !== false && place.category).forEach((place) => {
    if (!groups.has(place.category)) {
      groups.set(place.category, {
        id: place.categoryId || "",
        count: 0,
        iconUrl: categoryIconForPlace(place),
        groupId: poiModel.categoryGroup({ name: place.category })
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
  host.classList.add("has-category-groups");
  const usedGroups = poiModel.groups.filter((group) => [...groups.values()].some((category) => category.groupId === group.id));
  $("categorySummary").textContent = `${usedGroups.length} 大类 · ${groups.size} 分类`;
  const nav = $("categoryGroupFilters");
  nav.innerHTML = "";
  [{ id: "", name: "全部" }, ...usedGroups].forEach((group) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-group-tab ${activeCategoryGroup === group.id ? "selected" : ""}`;
    button.setAttribute("aria-pressed", String(activeCategoryGroup === group.id));
    const count = currentPlaces().filter((place) => place.isMarked !== false && (
      !group.id || poiModel.categoryGroup(findCategory(place.category, place.categoryId) || { name: place.category }) === group.id
    )).length;
    button.innerHTML = `<span>${escapeHtml(group.name)}</span><span class="category-group-count">${count}</span>`;
    button.onclick = () => {
      activeCategoryGroup = group.id;
      activeCategories.clear();
      categoryFilterActive = false;
      infoWindow?.close();
      renderCategoryFilters();
      renderMarkers();
      renderSavedPlaces();
    };
    nav.appendChild(button);
  });

  if (canEdit) {
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "new-category-entry";
    addButton.innerHTML = `
      <span class="new-category-plus">＋</span>
      <span>新建分类</span>
    `;
    addButton.onclick = () => openCategoryDialog();
    nav.appendChild(addButton);
  }

  const categoryHosts = new Map();
  usedGroups.filter((group) => !activeCategoryGroup || group.id === activeCategoryGroup).forEach((group) => {
    const section = document.createElement("section");
    section.className = "category-group-section";
    section.setAttribute("aria-label", `${group.name}分类`);
    const groupCategories = [...groups.values()].filter((category) => category.groupId === group.id);
    section.innerHTML = `<div class="category-group-heading"><h3>${escapeHtml(group.name)}</h3><span>${groupCategories.length} 个分类</span></div>`;
    const grid = document.createElement("div");
    grid.className = "category-list category-subcategory-grid";
    section.appendChild(grid);
    host.appendChild(section);
    categoryHosts.set(group.id, grid);
  });

  groups.forEach((data, category) => {
    const categoryHost = categoryHosts.get(data.groupId);
    if (!categoryHost) return;
    const active = !categoryFilterActive || activeCategories.has(category);
    const wrap = document.createElement("div");
    wrap.className = "category-item-wrap";

    const item = document.createElement("button");
    item.type = "button";
    item.className = `category-item ${active ? "" : "inactive"}`;
    item.setAttribute("aria-pressed", String(active));

    const initial = escapeHtml(category.trim().slice(0, 1) || "分");
    item.innerHTML = `
      <span class="category-label">${escapeHtml(category)}</span>
      <span class="category-count">${data.count}</span>
    `;

    item.onclick = () => {
      if (!categoryFilterActive) {
        groups.forEach((_, itemCategory) => activeCategories.add(itemCategory));
        categoryFilterActive = true;
      }

      activeCategories.has(category)
        ? activeCategories.delete(category)
        : activeCategories.add(category);

      if (activeCategories.size === groups.size) {
        activeCategories.clear();
        categoryFilterActive = false;
      }

      infoWindow?.close();
      renderCategoryFilters();
      renderMarkers();
      renderSavedPlaces();
    };

    wrap.appendChild(item);

    if (canEdit) {
      const iconButton = document.createElement("button");
      iconButton.type = "button";
      iconButton.className = "category-logo-button";
      iconButton.title = `编辑“${category}”的分类与 Logo`;
      iconButton.setAttribute("aria-label", `编辑“${category}”的分类与 Logo`);
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

    categoryHost.appendChild(wrap);
  });
}

function renderSavedPlaces() {
  const places = currentPlaces().filter(placeMatchesCategoryFilter);
  $("placeCount").textContent = activeCategoryGroup || categoryFilterActive ? `${places.length} / ${currentPlaces().length}` : places.length;
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
      setMobileSheetState("peek");
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
    host.innerHTML = `<div class="item-meta">${currentPlaces().length ? "这个筛选下暂时没有地点，可选择“全部”查看。" : `“${escapeHtml(mapTitle)}”暂时还没有地点。`}</div>`;
  }
}

function renderAll() {
  renderMapPresets();
  renderMarkers();
  renderCategoryFilters();
  renderSavedPlaces();
  updateRoutePlaceSelectors();
  updateMobileSheetMeta();
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
  setMobileSheetState("peek");
  if (highlightMarker) focusSearchMarker(highlightMarker);

  if (place.isMarked === false && canEdit) {
    window.editSavedPlace(place.id);
    return;
  }

  openPlaceDetails(place);
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
  if ($("bottomHint")) $("bottomHint").textContent = manualPlacementHint();
}

function manualPlacementHint(placeName = "") {
  const gesture = window.matchMedia("(pointer: coarse)").matches ? "长按" : "双击";
  return placeName
    ? `${gesture}餐厅所在位置，添加“${placeName}”`
    : `${gesture}地图可手动添加地点`;
}

function startManualPlacement(rawKeyword, city) {
  if (!canEdit) return;
  pendingManualPlaceName = splitSearchInput(rawKeyword).keyword || rawKeyword;
  activeSearchId += 1;
  clearSearchMarkers();
  $("searchResultsSection").classList.add("hidden");
  if (isMobileSheetViewport()) {
    setMobileSheetState("peek");
  } else {
    $("mainPanel").classList.add("collapsed");
    $("openPanelBtn").classList.remove("hidden");
  }
  $("bottomHint").textContent = manualPlacementHint(pendingManualPlaceName);
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
  setMobileSheetState("peek");
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
  setMobileSheetState("full");
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

  poiModel.groups.forEach((group) => {
    const groupCategories = categories.filter((name) => poiModel.categoryGroup(findCategory(name) || { name }) === group.id);
    if (!groupCategories.length) return;
    const optionGroup = document.createElement("optgroup");
    optionGroup.label = group.name;
    groupCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      option.selected = category === currentCategory;
      optionGroup.appendChild(option);
    });
    select.appendChild(optionGroup);
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
    (count ? ` 该分类下目前有 <strong>${count}</strong> 个地点。` : "");
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
  categoryGroupManuallyChosen = Boolean(category);
  $("categoryGroupSelect").innerHTML = poiModel.groups.map((group) =>
    `<option value="${group.id}">${escapeHtml(group.name)}</option>`
  ).join("");
  $("categoryGroupSelect").value = category ? poiModel.categoryGroup(category) : activeCategoryGroup || "other";
  renderCategoryDetailTypeOptions(category ? poiModel.categoryDetailType(category) : "");
  selectedCategoryIconId = category?.iconId ||
    savedIcons.find((icon) => icon.url === category?.iconUrl)?.id || "";
  $("categoryDialogTitle").textContent = category ? "编辑分类" : "新建分类";
  $("categoryIconHelp").textContent = category
    ? `“${category.name}”下的所有地点都会同步使用新的 Logo。`
    : "一个分类固定使用一个 Logo；地点会自动沿用，无需重复选择。";
  $("saveCategoryBtn").textContent = category ? "保存分类" : "创建分类";
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

function renderCategoryDetailTypeOptions(currentType = "") {
  const groupId = $("categoryGroupSelect").value;
  const profiles = poiModel.profiles.filter((profile) => profile.groupId === groupId);
  $("categoryDetailTypeSelect").innerHTML = profiles.map((profile) =>
    `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`
  ).join("");
  if (profiles.some((profile) => profile.id === currentType)) $("categoryDetailTypeSelect").value = currentType;
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
      groupId: $("categoryGroupSelect").value,
      detailType: $("categoryDetailTypeSelect").value,
      iconId: selectedCategoryIconId,
      iconUrl: selectedCategoryIconUrl(),
      createdAt: new Date().toISOString()
    };
    savedCategories.push(category);
  } else {
    category.groupId = $("categoryGroupSelect").value;
    category.detailType = $("categoryDetailTypeSelect").value;
    category.iconId = selectedCategoryIconId;
    category.iconUrl = selectedCategoryIconUrl();
    category.updatedAt = new Date().toISOString();
  }

  ensureCategoryIntegrity();
  persistCategoryLibrary();
  persistPlaces();
  $("categoryDialog").close();
  if (categoryDialogReturnToPlace) {
    collectPlaceDetailDrafts();
    renderCategorySelect(category.name);
    renderPlaceDetailTypeSelect($("placeDetailTypeSelect").value);
    renderPlaceDetailEditor(false);
  }
  editingCategoryId = "";
  categoryDialogReturnToPlace = false;
  renderAll();
}

function recommendationDraftId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `recommendation-${Date.now()}-${Math.random()}`;
}

function createRecommendationDraft(item = {}) {
  return {
    draftId: item.draftId || recommendationDraftId(),
    title: String(item.title || ""),
    description: String(item.description || ""),
    photo: String(item.photo || ""),
    photoFileId: String(item.photoFileId || ""),
    detailType: item.detailType || editingDetailType
  };
}

function collectRecommendationDraftsFromForm() {
  const host = $("recommendationList");
  if (!host) return recommendationDrafts;

  [...host.querySelectorAll(".recommendation-editor-item")].forEach((element) => {
      const draftId = element.dataset.recommendationId || "";
      const index = recommendationDrafts.findIndex((item) => item.draftId === draftId);
      if (index < 0) return;
      recommendationDrafts[index] = createRecommendationDraft({
        ...recommendationDrafts[index],
        draftId,
        title: element.querySelector("[data-field='title']")?.value || "",
        description: element.querySelector("[data-field='description']")?.value || ""
      });
  });
  return recommendationDrafts;
}

function recommendationEditorItemMarkup(draft, index) {
  const hasPhoto = Boolean(draft.photo);
  const profile = poiModel.profile(editingDetailType);
  return `
    <article class="recommendation-editor-item" data-recommendation-id="${escapeHtml(draft.draftId)}">
      <header class="recommendation-editor-header">
        <div class="recommendation-editor-title">
          <span class="recommendation-number">${index + 1}</span>
          <strong>${escapeHtml(profile.item)} ${index + 1}</strong>
        </div>
        <button
          class="recommendation-remove-button"
          type="button"
          data-action="remove-recommendation"
          aria-label="删除${escapeHtml(profile.item)} ${index + 1}"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 9.25h9v1.5h-9v-1.5Z"/></svg>
        </button>
      </header>
      <label class="form-field">
        <span>名称</span>
        <input data-field="title" maxlength="80" value="${escapeHtml(draft.title)}" placeholder="${escapeHtml(profile.titlePlaceholder)}" />
      </label>
      <label class="form-field">
        <span>${escapeHtml(profile.descriptionLabel)}（可选）</span>
        <textarea data-field="description" rows="2" maxlength="300" placeholder="${escapeHtml(profile.descriptionPlaceholder)}">${escapeHtml(draft.description)}</textarea>
      </label>
      <div class="recommendation-photo-row">
        ${hasPhoto
          ? `<div class="recommendation-photo-compact-preview">
              <img src="${escapeHtml(draft.photo)}" alt="${escapeHtml(draft.title || `${profile.item} ${index + 1}`)}">
              <button type="button" data-action="remove-photo">移除照片</button>
            </div>`
          : ""}
        <label class="recommendation-photo-button ${hasPhoto ? "has-photo" : ""}">
          <input data-action="upload-photo" type="file" accept="image/png,image/jpeg,image/webp" />
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h2l1 1.5h7A1.5 1.5 0 0 1 16.5 7v7A1.5 1.5 0 0 1 15 15.5H5A1.5 1.5 0 0 1 3.5 14V5.5Zm6.5 2A3.25 3.25 0 1 0 10 14a3.25 3.25 0 0 0 0-6.5Zm0 1.5a1.75 1.75 0 1 1 0 3.5A1.75 1.75 0 0 1 10 9Z"/></svg>
          <span>${hasPhoto ? "更换照片" : "添加照片"}</span>
        </label>
      </div>
    </article>
  `;
}

function renderRecommendationEditor(focusDraftId = "") {
  // 未填写的占位行可以释放，已经填写或上传的内容跨类型保留。
  recommendationDrafts = recommendationDrafts.filter((draft) => draft.detailType === editingDetailType || draftHasContent(draft));
  if (!recommendationDrafts.some((draft) => draft.detailType === editingDetailType) && recommendationDrafts.length < MAX_RECOMMENDATIONS) {
    recommendationDrafts.push(createRecommendationDraft());
  }
  const visibleDrafts = recommendationDrafts.filter((draft) => draft.detailType === editingDetailType);
  const profile = poiModel.profile(editingDetailType);

  $("recommendationList").innerHTML = visibleDrafts
    .map(recommendationEditorItemMarkup)
    .join("");

  const atLimit = recommendationDrafts.length >= MAX_RECOMMENDATIONS;
  $("addRecommendationBtn").disabled = atLimit;
  $("recommendationLimitHint").textContent = atLimit
    ? `每个地点最多 ${MAX_RECOMMENDATIONS} 条记录`
    : `${visibleDrafts.length} / ${MAX_RECOMMENDATIONS} ${profile.unit}`;
  const otherTypes = [...new Set(recommendationDrafts.filter((draft) => draft.detailType !== editingDetailType && draftHasContent(draft)).map((draft) => draft.detailType))];
  $("otherTypeRecords").classList.toggle("hidden", !otherTypes.length);
  $("otherTypeRecords").innerHTML = otherTypes.length ? `<span>已保留其他类型的记录：</span>${otherTypes.map((type) =>
    `<button type="button" data-detail-type="${type}">${escapeHtml(poiModel.profile(type).title)}</button>`
  ).join("")}` : "";

  if (focusDraftId) {
    const item = [...$("recommendationList").querySelectorAll(".recommendation-editor-item")]
      .find((element) => element.dataset.recommendationId === focusDraftId);
    item?.querySelector("[data-field='title']")?.focus();
  }
}

function recommendationValuesFromForm() {
  return collectRecommendationDraftsFromForm()
    .map((item) => ({
      title: item.title.trim(),
      description: item.description.trim(),
      photo: item.photo,
      photoFileId: item.photoFileId,
      detailType: item.detailType
    }))
    .filter((item) => item.title || item.description || item.photo || item.photoFileId)
    .slice(0, MAX_RECOMMENDATIONS);
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

function draftHasContent(draft) {
  return Boolean(draft.title.trim() || draft.description.trim() || draft.photo || draft.photoFileId || uploadingEntryIds.has(draft.draftId));
}

function collectPlaceDetailDrafts() {
  collectRecommendationDraftsFromForm();
  const values = {};
  $("placePracticalFields").querySelectorAll("[data-detail-field]").forEach((input) => {
    values[input.dataset.detailField] = input.value.trim();
  });
  detailFieldDrafts[editingDetailType] = values;
}

function defaultDetailTypeForForm() {
  return poiModel.placeDetailType({ name: $("placeName").value.trim() }, resolvedCategory() || {});
}

function renderPlaceDetailTypeSelect(currentOverride = "") {
  const defaultType = defaultDetailTypeForForm();
  const select = $("placeDetailTypeSelect");
  select.innerHTML = `<option value="">随分类 · ${escapeHtml(poiModel.profile(defaultType).name)}</option>`;
  poiModel.groups.forEach((group) => {
    const optionGroup = document.createElement("optgroup");
    optionGroup.label = group.name;
    poiModel.profiles.filter((profile) => profile.groupId === group.id).forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.name;
      optionGroup.appendChild(option);
    });
    select.appendChild(optionGroup);
  });
  select.value = currentOverride;
  if (select.selectedIndex < 0) select.value = "";
}

function renderPlaceDetailEditor(collect = true) {
  if (collect) collectPlaceDetailDrafts();
  editingDetailType = $("placeDetailTypeSelect").value || defaultDetailTypeForForm();
  const profile = poiModel.profile(editingDetailType);
  $("placeDetailTypeHelp").textContent = resolvedCategory()
    ? "通常随分类即可；同一分类里性质不同的地点，可以单独选择。"
    : "选择分类后会自动匹配，也可以为这个地点单独选择。";
  $("placeEntriesTitle").textContent = profile.title;
  $("placeEntriesHelp").textContent = profile.help;
  $("addRecommendationLabel").textContent = `添加${profile.item}`;
  $("placePracticalTitle").textContent = profile.groupId === "food" ? "消费与体验" : "实用信息";
  const values = detailFieldDrafts[profile.id] || {};
  $("placePracticalFields").innerHTML = profile.fields.map((field) => `<label class="form-field">
    <span>${escapeHtml(field.label)}</span>
    <input data-detail-field="${field.id}" maxlength="300" value="${escapeHtml(values[field.id] || "")}" placeholder="${escapeHtml(field.placeholder)}" />
  </label>`).join("");
  $("placePracticalSection").classList.toggle("hidden", !profile.fields.length);
  renderRecommendationEditor();
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

  recommendationDrafts = normalizedRecommendations(data).map(createRecommendationDraft);
  detailFieldDrafts = poiModel.normalizeDetails(data.detailsByType);
  renderPlaceDetailTypeSelect(data.detailType || "");
  renderPlaceDetailEditor(false);

  const visitRecord = data.visitRecord || {};
  $("visitDate").value = visitRecord.date || "";
  $("visitCompanions").value = visitRecord.companions || "";
  setVisitMode(visitRecord.mode || "solo");

  $("deletePlaceBtn").classList.toggle("hidden", !editingId);
  $("dialogTitle").textContent = editingId ? "编辑地点" : "添加地点";

  $("placeDialog").showModal();
  $("placeDialog").querySelector(".dialog-scroll").scrollTop = 0;
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
    detailType: place.detailType || "",
    detailsByType: place.detailsByType || {},
    note: place.note,
    recommendations: place.recommendations || [],
    recommendation: place.recommendation || {},
    visitRecord: place.visitRecord || {},
    location: [place.longitude, place.latitude],
    poiId: place.poiId || ""
  }, id);
};

function resolvedCategory() {
  return findCategory($("categorySelect").value);
}

function validateRecommendations(recommendations) {
  const invalidDraft = recommendationDrafts.find((item) =>
    (item.description.trim() || item.photo || item.photoFileId) && !item.title.trim()
  );
  if (!invalidDraft) return true;

  if (invalidDraft.detailType !== editingDetailType) {
    $("placeDetailTypeSelect").value = invalidDraft.detailType;
    renderPlaceDetailEditor(false);
  }
  const profile = poiModel.profile(invalidDraft.detailType);
  const visibleIndex = recommendationDrafts.filter((draft) => draft.detailType === invalidDraft.detailType).indexOf(invalidDraft);
  alert(`第 ${visibleIndex + 1} 个${profile.item}添加了描述或照片，请同时填写名称。`);
  const item = [...$("recommendationList").querySelectorAll(".recommendation-editor-item")]
    .find((element) => element.dataset.recommendationId === invalidDraft.draftId);
  item?.querySelector("[data-field='title']")?.focus();
  return false;
}

function savePlace(event) {
  event.preventDefault();
  if (!canEdit) return;
  if (uploadingEntryIds.size) {
    alert("照片还在上传，请完成后保存。");
    return;
  }

  const category = resolvedCategory();
  if (!category) {
    alert("请选择分类，或先新建一个分类。");
    return;
  }

  collectPlaceDetailDrafts();
  const recommendations = recommendationValuesFromForm();
  if (!validateRecommendations(recommendations)) return;

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
  const place = {
    ...(existingPlace || {}),
    id: editingId || (
      crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    ),
    poiId: $("poiId").value,
    name: $("placeName").value.trim(),
    address: $("placeAddress").value.trim(),
    category: category.name,
    categoryId: category.id,
    detailType: $("placeDetailTypeSelect").value || "",
    detailsByType: poiModel.normalizeDetails(detailFieldDrafts),
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
    recommendations,
    recommendation: recommendations[0] || null,
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
    description: "共同编辑的地点与到访记录",
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
  setMobileSheetState("half");
};

$("routePlannerBtn").onclick = () => {
  if ($("routePlannerSection").classList.contains("hidden")) openRoutePlanner();
  else closeRoutePlanner();
};

$("closeRoutePlannerBtn").onclick = closeRoutePlanner;

$("routeOriginSelect").onchange = (event) => selectRouteEndpoint("origin", event.target.value);

$("routeDestinationSelect").onchange = (event) => selectRouteEndpoint("destination", event.target.value);

$("swapRoutePointsBtn").onclick = () => {
  routeLocationRequestId += 1;
  [routeOriginId, routeDestinationId] = [routeDestinationId, routeOriginId];
  updateRoutePlaceSelectors();
  resetRouteResults();
  calculateActiveRoute();
};

$("routeModeTabs").onclick = (event) => {
  const tab = event.target.closest(".route-mode-tab[data-route-mode]");
  if (!tab || tab.dataset.routeMode === activeRouteMode) return;
  activeRouteMode = tab.dataset.routeMode;
  activeRoutePlanIndex = 0;
  renderRouteModeTabs();
  calculateActiveRoute();
};

$("routePlanList").onclick = (event) => {
  const card = event.target.closest(".route-plan-card[data-route-plan-index]");
  if (!card) return;
  drawRouteResult(activeRouteMode, Number(card.dataset.routePlanIndex));
};

$("newCategoryBtn").onclick = () => openCategoryDialog("", true);

$("categorySelect").onchange = () => {
  collectPlaceDetailDrafts();
  renderPlaceDetailTypeSelect($("placeDetailTypeSelect").value);
  renderPlaceDetailEditor(false);
};
$("placeDetailTypeSelect").onchange = () => renderPlaceDetailEditor();
$("otherTypeRecords").onclick = (event) => {
  const button = event.target.closest("button[data-detail-type]");
  if (!button) return;
  $("placeDetailTypeSelect").value = button.dataset.detailType;
  renderPlaceDetailEditor();
};

$("placeForm").addEventListener("submit", savePlace);
$("deletePlaceBtn").onclick = deleteCurrentPlace;
$("closeDialogBtn").onclick = () => $("placeDialog").close();
$("cancelBtn").onclick = () => $("placeDialog").close();

$("visitSoloBtn").onclick = () => setVisitMode("solo");
$("visitWithBtn").onclick = () => setVisitMode("with");

$("addRecommendationBtn").onclick = () => {
  collectRecommendationDraftsFromForm();
  if (recommendationDrafts.length >= MAX_RECOMMENDATIONS) return;
  const draft = createRecommendationDraft();
  recommendationDrafts.push(draft);
  renderRecommendationEditor(draft.draftId);
};

$("recommendationList").onclick = (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = button.closest(".recommendation-editor-item");
  const draftId = item?.dataset.recommendationId || "";

  collectRecommendationDraftsFromForm();
  const index = recommendationDrafts.findIndex((draft) => draft.draftId === draftId);
  if (index < 0) return;

  if (button.dataset.action === "remove-recommendation") {
    recommendationDrafts.splice(index, 1);
    renderRecommendationEditor();
    return;
  }

  if (button.dataset.action === "remove-photo") {
    recommendationDrafts[index].photo = "";
    recommendationDrafts[index].photoFileId = "";
    renderRecommendationEditor();
  }
};

$("recommendationList").onchange = async (event) => {
  const input = event.target.closest("input[data-action='upload-photo']");
  if (!input) return;
  const file = input.files[0];
  if (!file) return;

  const item = input.closest(".recommendation-editor-item");
  const draftId = item?.dataset.recommendationId || "";
  collectRecommendationDraftsFromForm();
  uploadingEntryIds.add(draftId);
  input.disabled = true;
  item?.classList.add("is-uploading");

  try {
    const asset = await uploadSharedAsset(file, "photo");
    collectRecommendationDraftsFromForm();
    const index = recommendationDrafts.findIndex((draft) => draft.draftId === draftId);
    if (index >= 0) {
      recommendationDrafts[index].photo = asset.url;
      recommendationDrafts[index].photoFileId = asset.fileId;
      renderRecommendationEditor();
    }
  } catch (error) {
    console.error(error);
    alert(error.message || "照片上传失败");
    setSyncStatus("照片上传失败", "error");
    input.disabled = false;
    item?.classList.remove("is-uploading");
  } finally {
    uploadingEntryIds.delete(draftId);
  }
};

$("deleteCategoryForm").addEventListener("submit", confirmDeleteCategory);
$("closeDeleteCategoryDialogBtn").onclick = closeDeleteCategoryDialog;
$("cancelDeleteCategoryBtn").onclick = closeDeleteCategoryDialog;

$("categoryForm").addEventListener("submit", saveStandaloneCategory);
$("categoryGroupSelect").onchange = () => {
  categoryGroupManuallyChosen = true;
  renderCategoryDetailTypeOptions();
};
$("standaloneCategoryName").oninput = () => {
  if (categoryGroupManuallyChosen) return;
  const type = poiModel.inferDetailType($("standaloneCategoryName").value);
  $("categoryGroupSelect").value = poiModel.profile(type).groupId;
  renderCategoryDetailTypeOptions(type);
};
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
  if (isMobileSheetViewport()) {
    setMobileSheetState(mobileSheetState === "peek" ? "half" : "peek");
    return;
  }
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

initializeMobileSheet();
bootstrapSharedMap().then(loadAmap);
