const crypto = require("crypto");
const cloudbase = require("@cloudbase/js-sdk");

const app = cloudbase.init({});
const db = app.rdb();
const TABLE = "shared_maps";
const ASSET_BUCKET = process.env.ASSET_BUCKET || "eatwithyu-assets";
const assets = app.storage.from(ASSET_BUCKET);
const DEFAULT_MAP_ID = process.env.MAP_ID || "beijing";
const MAP_TITLE = process.env.MAP_TITLE || "在北京吃饭";
const MAX_MAP_BYTES = 4.5 * 1024 * 1024;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

class MapServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function editorTokenHash() {
  return String(process.env.EDITOR_TOKEN_SHA256 || "").trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function isEditorTokenValid(token) {
  const expected = editorTokenHash();
  if (!/^[a-f0-9]{64}$/.test(expected) || String(token || "").length < 32) return false;

  const actualBuffer = Buffer.from(hashToken(token), "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireEditor(token) {
  if (!isEditorTokenValid(token)) {
    throw new MapServiceError("EDITOR_TOKEN_INVALID", "编辑链接无效或已失效");
  }
}

function requireMapId(mapId) {
  const normalized = String(mapId || DEFAULT_MAP_ID);
  if (normalized !== DEFAULT_MAP_ID || !/^[a-z0-9_-]{1,40}$/i.test(normalized)) {
    throw new MapServiceError("MAP_NOT_FOUND", "共享地图不存在");
  }
  return normalized;
}

function throwResultError(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

async function readMapDocument(mapId) {
  const result = await db
    .from(TABLE)
    .select("id,title,data,version,updated_at,write_id")
    .eq("id", mapId)
    .limit(1);
  const row = (throwResultError(result) || [])[0] || null;
  return row ? {
    id: row.id,
    title: row.title,
    data: row.data,
    version: row.version,
    updatedAt: row.updated_at,
    writeId: row.write_id
  } : null;
}

function emptyMapData() {
  return { places: [], categories: [], icons: [] };
}

function normalizeMapData(input) {
  const data = input && typeof input === "object" ? input : {};
  const normalized = {
    places: Array.isArray(data.places) ? data.places : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    icons: Array.isArray(data.icons) ? data.icons : []
  };

  if (normalized.places.length > 1000) {
    throw new MapServiceError("MAP_TOO_LARGE", "地点数量超过 1000 个");
  }
  if (normalized.categories.length > 200 || normalized.icons.length > 200) {
    throw new MapServiceError("MAP_TOO_LARGE", "分类或图标数量过多");
  }

  normalized.icons = normalized.icons.map((icon) => ({
    ...icon,
    url: icon.fileId ? "" : icon.url || ""
  }));
  normalized.categories = normalized.categories.map((category) => ({
    ...category,
    iconUrl: category.iconId ? "" : category.iconUrl || ""
  }));
  normalized.places = normalized.places.map((place) => ({
    ...place,
    iconUrl: place.iconId ? "" : place.iconUrl || "",
    recommendation: place.recommendation
      ? {
          ...place.recommendation,
          photo: place.recommendation.photoFileId
            ? ""
            : place.recommendation.photo || ""
        }
      : null
  }));

  const json = JSON.stringify(normalized);
  if (Buffer.byteLength(json, "utf8") > MAX_MAP_BYTES) {
    throw new MapServiceError("MAP_TOO_LARGE", "地图数据过大，请减少内嵌图片后重试");
  }
  return JSON.parse(json);
}

function collectFileIds(data) {
  const fileIds = new Set();
  data.icons.forEach((icon) => {
    if (icon.fileId) fileIds.add(icon.fileId);
  });
  data.places.forEach((place) => {
    if (place.recommendation?.photoFileId) fileIds.add(place.recommendation.photoFileId);
  });
  return [...fileIds];
}

async function fileUrlLookup(fileIds) {
  const lookup = new Map();
  for (let index = 0; index < fileIds.length; index += 50) {
    const batch = fileIds.slice(index, index + 50);
    const result = await assets.createSignedUrls(batch, 24 * 60 * 60);
    (throwResultError(result) || []).forEach((item) => {
      const url = item.fullSignedURL || item.signedUrl || item.signedURL || "";
      if (item.path && url) lookup.set(item.path, url);
    });
  }
  return lookup;
}

async function hydratePublicAssetUrls(storedData) {
  const data = normalizeMapData(storedData);
  const lookup = await fileUrlLookup(collectFileIds(data));

  data.icons = data.icons.map((icon) => ({
    ...icon,
    url: icon.fileId ? lookup.get(icon.fileId) || "" : icon.url || ""
  }));
  data.places = data.places.map((place) => ({
    ...place,
    recommendation: place.recommendation
      ? {
          ...place.recommendation,
          photo: place.recommendation.photoFileId
            ? lookup.get(place.recommendation.photoFileId) || ""
            : place.recommendation.photo || ""
        }
      : null
  }));
  return data;
}

async function getMap(event) {
  const mapId = requireMapId(event.mapId);
  const document = await readMapDocument(mapId);
  const data = await hydratePublicAssetUrls(document?.data || emptyMapData());
  return {
    ok: true,
    title: document?.title || MAP_TITLE,
    data,
    version: Number(document?.version || 0),
    updatedAt: document?.updatedAt || "",
    editable: isEditorTokenValid(event.editorToken)
  };
}

async function saveMap(event) {
  const mapId = requireMapId(event.mapId);
  requireEditor(event.editorToken);
  const data = normalizeMapData(event.data);
  const expectedVersion = Number(event.expectedVersion || 0);
  const current = await readMapDocument(mapId);
  const updatedAt = new Date().toISOString();
  const writeId = crypto.randomBytes(16).toString("hex");

  if (!current) {
    if (expectedVersion !== 0) {
      throw new MapServiceError("VERSION_CONFLICT", "地图版本冲突，请刷新后重试");
    }
    const inserted = await db.from(TABLE).insert({
      id: mapId,
      title: MAP_TITLE,
      data,
      version: 1,
      updated_at: updatedAt,
      write_id: writeId
    });
    if (inserted?.error) {
      const latest = await readMapDocument(mapId);
      if (latest) throw new MapServiceError("VERSION_CONFLICT", "地图版本冲突，请刷新后重试");
      throw inserted.error;
    }
    return { ok: true, version: 1, updatedAt };
  }

  const currentVersion = Number(current.version || 0);
  if (currentVersion !== expectedVersion) {
    throw new MapServiceError("VERSION_CONFLICT", "地图版本冲突，请刷新后重试");
  }

  const result = await db
    .from(TABLE)
    .update({
      title: MAP_TITLE,
      data,
      version: currentVersion + 1,
      updated_at: updatedAt,
      write_id: writeId
    })
    .eq("id", mapId)
    .eq("version", currentVersion);
  throwResultError(result);

  const saved = await readMapDocument(mapId);
  if (saved?.writeId !== writeId) {
    throw new MapServiceError("VERSION_CONFLICT", "地图版本冲突，请刷新后重试");
  }
  return { ok: true, version: currentVersion + 1, updatedAt };
}

function fileTypeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-z0-9+/=]+)$/i
  );
  if (!match) throw new MapServiceError("INVALID_ASSET", "不支持的图片格式");
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
}

function extensionForMime(mimeType) {
  return ({
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  })[mimeType];
}

async function uploadAsset(event) {
  const mapId = requireMapId(event.mapId);
  requireEditor(event.editorToken);
  const kind = event.kind === "icon" ? "icon" : event.kind === "photo" ? "photo" : "";
  if (!kind) throw new MapServiceError("INVALID_ASSET", "图片用途无效");

  const { mimeType, base64 } = fileTypeFromDataUrl(event.dataUrl);
  if (kind === "photo" && mimeType === "image/svg+xml") {
    throw new MapServiceError("INVALID_ASSET", "推荐照片不支持 SVG");
  }
  const fileContent = Buffer.from(base64, "base64");
  const maxBytes = kind === "icon" ? 600 * 1024 : 2 * 1024 * 1024;
  if (!fileContent.length || fileContent.length > maxBytes) {
    throw new MapServiceError("ASSET_TOO_LARGE", kind === "icon" ? "图标过大" : "照片过大");
  }

  const randomName = crypto.randomBytes(12).toString("hex");
  const cloudPath = `maps/${mapId}/${kind}/${Date.now()}-${randomName}.${extensionForMime(mimeType)}`;
  const uploaded = await assets.upload(cloudPath, fileContent, {
    contentType: mimeType,
    cacheControl: "max-age=31536000",
    upsert: false
  });
  const uploadedData = throwResultError(uploaded);
  const fileId = uploadedData?.path || cloudPath;
  const signed = await assets.createSignedUrl(fileId, 24 * 60 * 60);
  const signedData = throwResultError(signed) || {};
  const url = signedData.fullSignedURL || signedData.signedUrl || signedData.signedURL || "";
  return { ok: true, fileId, url };
}

function parseHttpEvent(rawEvent = {}) {
  if (rawEvent.action) return { event: rawEvent, isHttp: false };

  const isHttp = Boolean(rawEvent.httpMethod || rawEvent.requestContext || rawEvent.body !== undefined);
  if (!isHttp) return { event: rawEvent, isHttp: false };

  if (String(rawEvent.httpMethod || "").toUpperCase() === "OPTIONS") {
    return { event: {}, isHttp: true, isOptions: true };
  }

  let body = rawEvent.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return { event: body && typeof body === "object" ? body : {}, isHttp: true };
}

function httpResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: statusCode === 204 ? "" : JSON.stringify(body)
  };
}

exports.main = async (rawEvent = {}) => {
  const parsed = parseHttpEvent(rawEvent);
  if (parsed.isOptions) return httpResponse({}, 204);

  try {
    const event = parsed.event;
    let result;
    switch (event.action) {
      case "get":
        result = await getMap(event);
        break;
      case "save":
        result = await saveMap(event);
        break;
      case "uploadAsset":
        result = await uploadAsset(event);
        break;
      default:
        throw new MapServiceError("INVALID_ACTION", "不支持的操作");
    }
    return parsed.isHttp ? httpResponse(result) : result;
  } catch (error) {
    const known = error instanceof MapServiceError;
    if (!known) console.error(error);
    const result = {
      ok: false,
      code: known ? error.code : "SERVER_ERROR",
      message: known ? error.message : "共享服务暂时不可用"
    };
    return parsed.isHttp ? httpResponse(result) : result;
  }
};
