const assert = require("assert");
const Module = require("module");
const crypto = require("crypto");

const documents = new Map();
const uploadedFiles = new Map();

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pgBuilder() {
  let operation = "";
  let values = null;
  const filters = [];

  const builder = {
    select() {
      operation = "select";
      return builder;
    },
    async insert(row) {
      if (documents.has(row.id)) return { data: null, error: new Error("duplicate key") };
      documents.set(row.id, clone(row));
      return { data: null, error: null };
    },
    update(patch) {
      operation = "update";
      values = clone(patch);
      return builder;
    },
    eq(column, value) {
      filters.push([column, value]);
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve, reject) {
      try {
        const matches = [...documents.values()].filter((row) =>
          filters.every(([column, value]) => row[column] === value)
        );
        if (operation === "select") {
          return Promise.resolve({ data: clone(matches), error: null }).then(resolve, reject);
        }
        if (operation === "update") {
          matches.forEach((row) => documents.set(row.id, { ...row, ...clone(values) }));
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    }
  };
  return builder;
}

const db = {
  from() {
    return pgBuilder();
  }
};

const storageBucket = {
  async upload(path, fileContent) {
    uploadedFiles.set(path, Buffer.from(fileContent));
    return { data: { id: path, path, fullPath: `eatwithyu-assets/${path}` }, error: null };
  },
  async createSignedUrl(path) {
    return {
      data: { path, fullSignedURL: `https://assets.example/${encodeURIComponent(path)}` },
      error: null
    };
  },
  async createSignedUrls(paths) {
    return {
      data: paths.map((path) => ({
        path,
        fullSignedURL: `https://assets.example/${encodeURIComponent(path)}`
      })),
      error: null
    };
  }
};

const mockCloudbase = {
  init() {
    return {
      rdb() {
        return db;
      },
      storage: {
        from() {
          return storageBucket;
        }
      }
    };
  }
};

const editorToken = "a-secure-editor-token-that-is-longer-than-32-characters";
process.env.EDITOR_TOKEN_SHA256 = crypto.createHash("sha256").update(editorToken).digest("hex");
process.env.MAP_ID = "beijing";
process.env.MAP_TITLE = "eatwithyu";

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@cloudbase/js-sdk") return mockCloudbase;
  return originalLoad.call(this, request, parent, isMain);
};

const mapFunction = require("../cloudfunctions/eatwithyu-map/index.js");
Module._load = originalLoad;

async function run() {
  const publicMap = await mapFunction.main({ action: "get", mapId: "beijing" });
  assert.equal(publicMap.ok, true);
  assert.equal(publicMap.editable, false);
  assert.equal(publicMap.title, "eatwithyu");
  assert.deepEqual(publicMap.data, { places: [], categories: [], icons: [] });

  const httpMapResponse = await mapFunction.main({
    httpMethod: "POST",
    body: JSON.stringify({ action: "get", mapId: "beijing" })
  });
  assert.equal(httpMapResponse.statusCode, 200);
  assert.equal(httpMapResponse.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(JSON.parse(httpMapResponse.body).ok, true);

  const httpOptionsResponse = await mapFunction.main({ httpMethod: "OPTIONS" });
  assert.equal(httpOptionsResponse.statusCode, 204);

  const editorMap = await mapFunction.main({
    action: "get",
    mapId: "beijing",
    editorToken
  });
  assert.equal(editorMap.editable, true);

  const rejectedSave = await mapFunction.main({
    action: "save",
    mapId: "beijing",
    editorToken: "wrong-token",
    expectedVersion: 0,
    data: { places: [], categories: [], icons: [] }
  });
  assert.equal(rejectedSave.code, "EDITOR_TOKEN_INVALID");

  const uploaded = await mapFunction.main({
    action: "uploadAsset",
    mapId: "beijing",
    editorToken,
    kind: "photo",
    dataUrl: `data:image/png;base64,${Buffer.from("test-image").toString("base64")}`
  });
  assert.equal(uploaded.ok, true);
  assert.ok(uploaded.fileId.startsWith("maps/beijing/photo/"));
  assert.ok(uploadedFiles.has(uploaded.fileId));

  const firstSave = await mapFunction.main({
    action: "save",
    mapId: "beijing",
    editorToken,
    expectedVersion: 0,
    title: "eatwithyu",
    data: {
      places: [{
        id: "place-1",
        name: "测试餐厅",
        recommendation: {
          title: "测试菜",
          photo: uploaded.url,
          photoFileId: uploaded.fileId
        }
      }],
      categories: [],
      icons: []
    }
  });
  assert.equal(firstSave.version, 1);
  assert.equal(firstSave.title, "eatwithyu");
  assert.equal(documents.get("beijing").title, "eatwithyu");
  assert.equal(documents.get("beijing").data.places[0].recommendation.photo, "");
  assert.equal(JSON.stringify(documents.get("beijing")).includes(editorToken), false);

  const hydrated = await mapFunction.main({ action: "get", mapId: "beijing" });
  assert.equal(hydrated.data.places[0].recommendation.photo, uploaded.url);

  const conflict = await mapFunction.main({
    action: "save",
    mapId: "beijing",
    editorToken,
    expectedVersion: 0,
    data: hydrated.data
  });
  assert.equal(conflict.code, "VERSION_CONFLICT");

  const secondSave = await mapFunction.main({
    action: "save",
    mapId: "beijing",
    editorToken,
    expectedVersion: 1,
    title: "周末吃饭",
    data: hydrated.data
  });
  assert.equal(secondSave.version, 2);
  assert.equal(secondSave.title, "周末吃饭");
  assert.equal(documents.get("beijing").title, "周末吃饭");

  const manyPlaces = Array.from({ length: 300 }, (_, index) => ({
    id: `place-${index + 1}`,
    name: `测试地点 ${index + 1}`,
    address: `北京市测试地址 ${index + 1} 号`,
    category: index % 2 ? "咖啡" : "云南菜",
    longitude: 116.2 + index * 0.0001,
    latitude: 39.8 + index * 0.0001,
    isMarked: true
  }));
  const scaleSave = await mapFunction.main({
    action: "save",
    mapId: "beijing",
    editorToken,
    expectedVersion: 2,
    data: { places: manyPlaces, categories: [], icons: [] }
  });
  assert.equal(scaleSave.version, 3);
  const scaleRead = await mapFunction.main({ action: "get", mapId: "beijing" });
  assert.equal(scaleRead.title, "周末吃饭");
  assert.equal(scaleRead.data.places.length, 300);
  console.log("CloudBase function tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
