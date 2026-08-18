const SHARED_MAP_FALLBACK_FILE = "./maps/beijing.json";
const sharedConfig = window.SHARED_MAP_CONFIG || {};
const editorToken = new URLSearchParams(window.location.hash.slice(1)).get("edit") || "";
const canEdit = Boolean(editorToken);

let map;
let placeSearch;
let markers = new Map();
let savedPlaces = [];
let pendingDeleteCategory = "";
let savedIcons = [];
let savedCategories = [];
let activeCategories = new Set();
let selectedIconId = "";
let selectedCategoryIconId = "";
let recommendationPhotoData = "";
let selectedVisitMode = "solo";
let infoWindow;
let sharedVersion = null;
let saveTimer = null;
let isHydrating = true;

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

function hasSharedBackend() {
  return Boolean(
    sharedConfig.supabaseUrl &&
    sharedConfig.supabaseAnonKey &&
    !sharedConfig.supabaseUrl.includes("请替换") &&
    !sharedConfig.supabaseAnonKey.includes("请替换")
  );
}

function sharedHeaders() {
  return {
    apikey: sharedConfig.supabaseAnonKey,
    Authorization: `Bearer ${sharedConfig.supabaseAnonKey}`,
    "Content-Type": "application/json"
  };
}

function setSyncStatus(message, state = "") {
  const status = $("sharedStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function applySharedData(data = {}) {
  savedPlaces = Array.isArray(data.places) ? data.places : [];
  savedCategories = Array.isArray(data.categories) ? data.categories : [];
  savedIcons = Array.isArray(data.icons) ? data.icons : [];
}

async function loadFallbackMap() {
  const response = await fetch(SHARED_MAP_FALLBACK_FILE, { cache: "no-store" });
  if (!response.ok) throw new Error("地图文件读取失败");
  const data = await response.json();
  applySharedData({ places: data.places || [], categories: [], icons: [] });
}

async function loadSharedMap() {
  if (!hasSharedBackend()) {
    await loadFallbackMap();
    setSyncStatus("等待连接共享数据", "offline");
    return;
  }

  const mapId = encodeURIComponent(sharedConfig.mapId || "beijing");
  const url = `${sharedConfig.supabaseUrl}/rest/v1/shared_maps?id=eq.${mapId}&select=title,data,version,updated_at`;
  const response = await fetch(url, { headers: sharedHeaders(), cache: "no-store" });
  if (!response.ok) throw new Error("共享地图读取失败");

  const rows = await response.json();
  if (!rows.length) throw new Error("共享地图尚未初始化");

  applySharedData(rows[0].data || {});
  sharedVersion = rows[0].version;
  setSyncStatus(canEdit ? "可共同编辑" : "只读浏览", canEdit ? "editable" : "readonly");
}

async function bootstrapSharedMap() {
  document.body.classList.toggle("read-only", !canEdit);
  $("editorLinkAction")?.classList.toggle("hidden", !canEdit);
  setSyncStatus("正在同步…", "saving");

  try {
    await loadSharedMap();
  } catch (error) {
    console.error(error);
    try {
      await loadFallbackMap();
    } catch (fallbackError) {
      console.error(fallbackError);
      applySharedData();
    }
    setSyncStatus("共享数据暂时不可用", "error");
  } finally {
    isHydrating = false;
  }
}

function sharedPayload() {
  return {
    places: savedPlaces,
    categories: savedCategories,
    icons: savedIcons
  };
}

function scheduleSharedSave() {
  if (isHydrating || !canEdit) return;
  if (!hasSharedBackend()) {
    setSyncStatus("尚未连接共享数据", "error");
    return;
  }

  window.clearTimeout(saveTimer);
  setSyncStatus("正在保存…", "saving");
  saveTimer = window.setTimeout(saveSharedMap, 250);
}

async function saveSharedMap() {
  try {
    const response = await fetch(`${sharedConfig.supabaseUrl}/rest/v1/rpc/save_shared_map`, {
      method: "POST",
      headers: sharedHeaders(),
      body: JSON.stringify({
        p_map_id: sharedConfig.mapId || "beijing",
        p_editor_token: editorToken,
        p_data: sharedPayload(),
        p_expected_version: sharedVersion
      })
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const message = result?.message || "共享地图保存失败";
      if (/版本|version|conflict/i.test(message)) {
        alert("另一位编辑者刚刚更新了地图。请刷新页面读取最新内容后再编辑。");
      } else if (/密钥|token|permission|权限/i.test(message)) {
        alert("这条编辑链接无效或已失效。");
      } else {
        alert(message);
      }
      throw new Error(message);
    }

    const row = Array.isArray(result) ? result[0] : result;
    if (row?.version != null) sharedVersion = row.version;
    setSyncStatus("已保存到共享地图", "saved");
  } catch (error) {
    console.error(error);
    setSyncStatus("保存失败", "error");
  }
}

function migrateCategoriesFromPlaces() {
  const knownNames = new Set(savedCategories.map((category) => category.name));
  let changed = false;

  savedPlaces.forEach((place) => {
    if (!place.category || knownNames.has(place.category)) return;

    savedCategories.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `category-${Date.now()}-${Math.random()}`,
      name: place.category,
      iconUrl: place.iconUrl || "",
      createdAt: new Date().toISOString()
    });
    knownNames.add(place.category);
    changed = true;
  });

  if (changed) persistCategoryLibrary();
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
    "&plugin=AMap.PlaceSearch,AMap.Scale,AMap.ToolBar";

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
    city: cfg.defaultCity || "北京",
    citylimit: false
  });

  infoWindow = new AMap.InfoWindow({
    offset: new AMap.Pixel(0, -20),
    isCustom: false
  });

  map.on("dblclick", (event) => {
    if (!canEdit) return;
    openPlaceDialog({
      name: "地图上的地点",
      address: "",
      location: [event.lnglat.lng, event.lnglat.lat],
      poiId: ""
    });
  });

  migrateIconsFromPlaces();
  migrateCategoriesFromPlaces();
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
  if (!place.iconUrl) {
    return defaultMarkerContent();
  }

  const element = document.createElement("div");
  element.className = "custom-marker";

  const image = document.createElement("img");
  image.src = place.iconUrl;
  image.alt = place.category || "地点";
  element.appendChild(image);

  return element;
}

function addMarker(place) {
  if (!map) return;
  if (activeCategories.size && !activeCategories.has(place.category)) return;

  const hasIcon = Boolean(place.iconUrl);
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
        <div class="info-recommendation">
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
        </div>
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
          <span class="visit-summary-icon">✓</span>
          <span>${visitText}</span>
        </div>
      `
      : "";

    const content = `
      <div class="info-card">
        <h3>${escapeHtml(place.name)}</h3>
        <p>${escapeHtml(place.category)}${place.address ? " · " + escapeHtml(place.address) : ""}</p>
        ${visitHtml}
        ${recommendationHtml}
        ${place.note ? `<p>${escapeHtml(place.note)}</p>` : ""}
        ${canEdit
          ? `<button class="google-primary-button" onclick="window.editSavedPlace('${place.id}')">编辑地点</button>`
          : ""}
      </div>
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
    groups.set(category.name, { count: 0, iconUrl: category.iconUrl || "" });
  });

  currentPlaces().forEach((place) => {
    if (!groups.has(place.category)) {
      groups.set(place.category, { count: 0, iconUrl: place.iconUrl || "" });
    }
    groups.get(place.category).count += 1;
    if (!groups.get(place.category).iconUrl && place.iconUrl) {
      groups.get(place.category).iconUrl = place.iconUrl;
    }
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
    addButton.onclick = openCategoryDialog;
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
      ${data.iconUrl
        ? `<img class="mini-icon" src="${data.iconUrl}" alt="">`
        : `<span class="category-icon-placeholder">${initial}</span>`}
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
    item.className = `saved-item ${isUnmarked ? "unmarked" : ""}`;
    item.innerHTML = `
      ${place.iconUrl && !isUnmarked
        ? `<img class="mini-icon" src="${place.iconUrl}" alt="">`
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
    host.innerHTML = '<div class="item-meta">“在北京吃饭”暂时还没有地点。</div>';
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
  host.innerHTML = `
    <div class="map-preset-button active shared-map-card">
    <span class="map-preset-icon">京</span>
    <span class="map-preset-copy">
      <span class="map-preset-title">在北京吃饭</span>
      <span id="sharedStatus" class="map-preset-meta">${canEdit ? "可共同编辑" : "只读浏览"}</span>
    </span>
    <span class="map-preset-count">${savedPlaces.length}</span>
    </div>`;
  $("activeMapSummary").textContent = `${currentPlaces().length} 个地点`;
}

function searchPoi() {
  const keyword = $("poiKeyword").value.trim();
  if (!keyword || !placeSearch) return;

  $("searchResultsSection").classList.remove("hidden");
  $("searchResults").innerHTML = '<div class="item-meta">正在搜索…</div>';

  placeSearch.search(keyword, (status, result) => {
    if (status !== "complete" || !result?.poiList?.pois?.length) {
      $("searchResults").innerHTML = '<div class="item-meta">没有找到结果，请换一个关键词。</div>';
      return;
    }

    const host = $("searchResults");
    host.innerHTML = "";

    result.poiList.pois.forEach((poi) => {
      if (!poi.location) return;

      const location = [poi.location.lng, poi.location.lat];
      const item = document.createElement("div");
      item.className = "result-item";

      item.innerHTML = `
        <div class="item-copy">
          <div class="item-title">${escapeHtml(poi.name)}</div>
          <div class="item-meta">${escapeHtml(
            poi.address || `${poi.pname || ""}${poi.cityname || ""}${poi.adname || ""}`
          )}</div>
        </div>
      `;

      item.onclick = () => {
        map.setZoomAndCenter(17, location);
        openPlaceDialog({
          name: poi.name,
          address: poi.address || "",
          location,
          poiId: poi.id || ""
        });
      };

      host.appendChild(item);
    });
  });
}

function getCategories() {
  return [...new Set([
    ...savedCategories.map((category) => category.name),
    ...savedPlaces.map((place) => place.category)
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
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

function renderIconLibrary() {
  const host = $("iconLibrary");
  host.innerHTML = "";

  if (!savedIcons.length) {
    host.innerHTML = `
      <div class="icon-library-empty">
        还没有保存的图标。上传第一个图标后，它会一直保留在这里。
      </div>
    `;
    return;
  }

  savedIcons.forEach((icon) => {
    const wrap = document.createElement("div");
    wrap.className = "saved-icon-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `saved-icon-option ${selectedIconId === icon.id ? "selected" : ""}`;
    button.title = icon.name || "自定义图标";
    button.innerHTML = `<img src="${icon.url}" alt="${escapeHtml(icon.name || "自定义图标")}">`;
    button.onclick = () => {
      selectedIconId = selectedIconId === icon.id ? "" : icon.id;
      renderIconLibrary();
    };

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-delete";
    deleteButton.textContent = "×";
    deleteButton.title = "从图标库删除";
    deleteButton.onclick = (event) => {
      event.stopPropagation();
      const inUse = savedPlaces.some((place) => place.iconUrl === icon.url);

      if (inUse) {
        alert("这个图标正在被地点使用，暂时不能从图标库删除。");
        return;
      }

      savedIcons = savedIcons.filter((item) => item.id !== icon.id);
      if (selectedIconId === icon.id) selectedIconId = "";
      persistIconLibrary();
      renderIconLibrary();
    };

    wrap.append(button, deleteButton);
    host.appendChild(wrap);
  });
}

function renderCategoryIconLibrary() {
  const host = $("categoryIconLibrary");
  host.innerHTML = "";

  const noIconButton = document.createElement("button");
  noIconButton.type = "button";
  noIconButton.className = `saved-icon-option ${selectedCategoryIconId === "" ? "selected" : ""}`;
  noIconButton.title = "不使用图标";
  noIconButton.innerHTML = '<span class="category-icon-placeholder">无</span>';
  noIconButton.onclick = () => {
    selectedCategoryIconId = "";
    renderCategoryIconLibrary();
  };
  host.appendChild(noIconButton);

  savedIcons.forEach((icon) => {
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

function openCategoryDialog() {
  if (!canEdit) return;
  $("standaloneCategoryName").value = "";
  selectedCategoryIconId = "";
  renderCategoryIconLibrary();
  $("categoryDialog").showModal();
  setTimeout(() => $("standaloneCategoryName").focus(), 0);
}

function selectedCategoryIconUrl() {
  return savedIcons.find((icon) => icon.id === selectedCategoryIconId)?.url || "";
}

function saveStandaloneCategory(event) {
  event.preventDefault();
  if (!canEdit) return;

  const name = $("standaloneCategoryName").value.trim();
  if (!name) return;

  const exists = getCategories().some(
    (category) => category.toLocaleLowerCase() === name.toLocaleLowerCase()
  );

  if (exists) {
    alert("这个分类已经存在。");
    $("standaloneCategoryName").focus();
    return;
  }

  savedCategories.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `category-${Date.now()}`,
    name,
    iconUrl: selectedCategoryIconUrl(),
    createdAt: new Date().toISOString()
  });

  persistCategoryLibrary();
  $("categoryDialog").close();
  renderCategoryFilters();
}

function selectedIconUrl() {
  return savedIcons.find((icon) => icon.id === selectedIconId)?.url || "";
}

function setRecommendationPhoto(dataUrl) {
  recommendationPhotoData = dataUrl || "";
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
  $("newCategoryName").value = "";
  $("newCategoryName").classList.add("hidden");
  $("newCategoryBtn").textContent = "＋ 新建分类";

  const matchingIcon = savedIcons.find((icon) => icon.url === data.iconUrl);
  selectedIconId = matchingIcon?.id || "";

  const recommendation = data.recommendation || {};
  $("recommendationTitle").value = recommendation.title || "";
  $("recommendationDescription").value = recommendation.description || "";
  setRecommendationPhoto(recommendation.photo || "");

  const visitRecord = data.visitRecord || {};
  $("visitDate").value = visitRecord.date || "";
  $("visitCompanions").value = visitRecord.companions || "";
  setVisitMode(visitRecord.mode || "solo");

  $("deletePlaceBtn").classList.toggle("hidden", !editingId);
  $("dialogTitle").textContent = editingId ? "编辑地点" : "添加地点";

  renderIconLibrary();
  $("placeDialog").showModal();
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
    iconUrl: place.iconUrl,
    recommendation: place.recommendation || {},
    visitRecord: place.visitRecord || {},
    location: [place.longitude, place.latitude],
    poiId: place.poiId || ""
  }, id);
};

function resolvedCategory() {
  const newCategory = $("newCategoryName").value.trim();
  return newCategory || $("categorySelect").value;
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
    alert("请选择分类，或新建一个分类。");
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
  const recommendationTitle = $("recommendationTitle").value.trim();

  const place = {
    id: editingId || (
      crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    ),
    poiId: $("poiId").value,
    name: $("placeName").value.trim(),
    address: $("placeAddress").value.trim(),
    category,
    note: $("placeNote").value.trim(),
    longitude: Number($("longitude").value),
    latitude: Number($("latitude").value),
    iconUrl: selectedIconUrl(),
    isMarked: true,
    recommendation: recommendationTitle
      ? {
          title: recommendationTitle,
          description: $("recommendationDescription").value.trim(),
          photo: recommendationPhotoData
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

  if (editingId) {
    savedPlaces = savedPlaces.map((item) => item.id === editingId ? place : item);
  } else {
    savedPlaces.push(place);
  }

  persistPlaces();
  $("placeDialog").close();
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

function exportData() {
  const payload = JSON.stringify({
    version: 1,
    id: "beijing",
    title: "在北京吃饭",
    description: "共同编辑的北京美食地点",
    updatedAt: new Date().toISOString(),
    map: {
      center: window.MAP_CONFIG?.defaultCenter || [116.397428, 39.90923],
      zoom: window.MAP_CONFIG?.defaultZoom || 11
    },
    places: savedPlaces
  }, null, 2);

  const blob = new Blob([payload], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = "beijing.json";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function fileToDataUrl(file, maxSizeKb, callback) {
  if (file.size > maxSizeKb * 1024) {
    alert(`文件过大，请压缩到 ${maxSizeKb} KB 以内。`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
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
};

$("newCategoryBtn").onclick = () => {
  const input = $("newCategoryName");
  const opening = input.classList.contains("hidden");
  input.classList.toggle("hidden", !opening);
  $("newCategoryBtn").textContent = opening ? "使用已有分类" : "＋ 新建分类";
  if (opening) input.focus();
};

$("placeForm").addEventListener("submit", savePlace);
$("deletePlaceBtn").onclick = deleteCurrentPlace;
$("closeDialogBtn").onclick = () => $("placeDialog").close();
$("cancelBtn").onclick = () => $("placeDialog").close();
$("customIconFile").onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  fileToDataUrl(file, 500, (dataUrl) => {
    const icon = {
      id: crypto.randomUUID ? crypto.randomUUID() : `icon-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      url: dataUrl,
      createdAt: new Date().toISOString()
    };

    savedIcons.unshift(icon);
    selectedIconId = icon.id;
    persistIconLibrary();
    renderIconLibrary();
    event.target.value = "";
  });
};

$("visitSoloBtn").onclick = () => setVisitMode("solo");
$("visitWithBtn").onclick = () => setVisitMode("with");

$("recommendationPhotoFile").onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  fileToDataUrl(file, 1200, (dataUrl) => {
    setRecommendationPhoto(dataUrl);
  });
};

$("removeRecommendationPhotoBtn").onclick = () => {
  setRecommendationPhoto("");
};

$("deleteCategoryForm").addEventListener("submit", confirmDeleteCategory);
$("closeDeleteCategoryDialogBtn").onclick = closeDeleteCategoryDialog;
$("cancelDeleteCategoryBtn").onclick = closeDeleteCategoryDialog;

$("categoryForm").addEventListener("submit", saveStandaloneCategory);
$("closeCategoryDialogBtn").onclick = () => $("categoryDialog").close();
$("cancelCategoryBtn").onclick = () => $("categoryDialog").close();

$("categoryIconFile").onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  fileToDataUrl(file, 500, (dataUrl) => {
    const icon = {
      id: crypto.randomUUID ? crypto.randomUUID() : `icon-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      url: dataUrl,
      createdAt: new Date().toISOString()
    };

    savedIcons.unshift(icon);
    selectedCategoryIconId = icon.id;
    persistIconLibrary();
    renderCategoryIconLibrary();
    event.target.value = "";
  });
};

$("menuBtn").onclick = () => {
  $("mainPanel").classList.add("collapsed");
  $("openPanelBtn").classList.remove("hidden");
};

$("openPanelBtn").onclick = () => {
  $("mainPanel").classList.remove("collapsed");
  $("openPanelBtn").classList.add("hidden");
};

$("copyEditorLinkBtn").onclick = async () => {
  if (!canEdit) return;
  try {
    await navigator.clipboard.writeText(window.location.href);
    const button = $("copyEditorLinkBtn");
    const original = button.textContent;
    button.textContent = "编辑链接已复制";
    window.setTimeout(() => { button.textContent = original; }, 1800);
  } catch {
    window.prompt("复制下面的编辑链接", window.location.href);
  }
};

bootstrapSharedMap().then(loadAmap);
