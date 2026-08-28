(function initializeRestaurantCredits(global) {
  "use strict";

  const SYSTEMS = Object.freeze({
    michelin: Object.freeze({
      name: "米其林",
      icon: "./assets/credits/michelin.svg"
    }),
    "dianping-must-eat": Object.freeze({
      name: "大众点评必吃榜",
      icon: "./assets/credits/dianping-must-eat.svg"
    }),
    "black-pearl": Object.freeze({
      name: "黑珍珠餐厅指南",
      icon: "./assets/credits/black-pearl.svg"
    })
  });

  const SYSTEM_ORDER = Object.freeze([
    "michelin",
    "dianping-must-eat",
    "black-pearl"
  ]);

  const SYSTEM_ALIASES = Object.freeze({
    michelin: "michelin",
    米其林: "michelin",
    dianping: "dianping-must-eat",
    "dianping-must-eat": "dianping-must-eat",
    大众点评必吃榜: "dianping-must-eat",
    blackpearl: "black-pearl",
    "black-pearl": "black-pearl",
    黑珍珠: "black-pearl",
    黑珍珠餐厅: "black-pearl"
  });

  // 这里只收录已经逐店核验过的分店，避免把品牌荣誉误套到同名的其他门店。
  const CATALOG = Object.freeze([
    Object.freeze({
      names: Object.freeze([
        "CAPARESH開府莱舍(国贸银泰店)",
        "CAPARESH開府莱舍（国贸银泰店）",
        "CAPARESH開府莱舍(北京银泰中心店)",
        "CAPARESH開府莱舍（北京银泰中心店）"
      ]),
      city: "北京",
      credits: Object.freeze([
        Object.freeze({
          system: "michelin",
          year: 2025,
          distinction: "bib-gourmand",
          sourceUrl: "https://www.visitbeijing.com.cn/article/4NOeTh1GpJO"
        }),
        Object.freeze({
          system: "dianping-must-eat",
          year: 2025,
          sourceUrl: "https://www.visitbeijing.com.cn/article/4NOeTh1GpJO"
        })
      ])
    }),
    Object.freeze({
      names: Object.freeze([
        "马旺子川小馆",
        "马旺子·川小馆"
      ]),
      city: "深圳",
      credits: Object.freeze([
        Object.freeze({
          system: "dianping-must-eat",
          year: 2021,
          sourceUrl: "https://k.sina.cn/article_1893278624_70d923a002000v5aw.html"
        })
      ])
    })
  ]);

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s·•・—\-_|｜/／,，。:：;；()（）\[\]【】'"“”‘’]+/g, "");
  }

  function normalizeSystem(value) {
    const key = String(value || "").trim();
    return SYSTEM_ALIASES[key] || "";
  }

  function generatedLabel(credit) {
    const yearPrefix = credit.year ? `${credit.year}年` : "";
    if (credit.system === "michelin") {
      const labels = {
        "3-star": "米其林三星",
        "2-star": "米其林二星",
        "1-star": "米其林一星",
        "bib-gourmand": "米其林必比登入选",
        selected: "米其林指南入选",
        "green-star": "米其林绿星"
      };
      return `${yearPrefix}${labels[credit.distinction] || "米其林指南入选"}`;
    }
    if (credit.system === "dianping-must-eat") {
      return `${yearPrefix}大众点评必吃榜`;
    }
    if (credit.system === "black-pearl") {
      const labels = {
        "3-diamond": "黑珍珠三钻餐厅",
        "2-diamond": "黑珍珠二钻餐厅",
        "1-diamond": "黑珍珠一钻餐厅",
        selected: "黑珍珠餐厅指南入选"
      };
      return `${yearPrefix}${labels[credit.distinction] || "黑珍珠餐厅指南入选"}`;
    }
    return "";
  }

  function normalizeCredit(value) {
    if (!value || typeof value !== "object") return null;
    const system = normalizeSystem(value.system || value.type);
    if (!system || !SYSTEMS[system]) return null;
    const numericYear = Number(value.year);
    const credit = {
      system,
      year: Number.isInteger(numericYear) && numericYear >= 1900 && numericYear <= 2200
        ? numericYear
        : null,
      distinction: String(value.distinction || "").trim(),
      sourceUrl: String(value.sourceUrl || "").trim()
    };
    credit.label = String(value.label || "").trim() || generatedLabel(credit);
    return credit;
  }

  function normalize(value) {
    const bySystem = new Map();
    (Array.isArray(value) ? value : []).forEach((item) => {
      const credit = normalizeCredit(item);
      if (credit && !bySystem.has(credit.system)) bySystem.set(credit.system, credit);
    });
    return SYSTEM_ORDER.map((system) => bySystem.get(system)).filter(Boolean);
  }

  function candidateAddress(candidate) {
    return [
      candidate?.city,
      candidate?.cityname,
      candidate?.pname,
      candidate?.adname,
      candidate?.address
    ].filter(Boolean).join(" ");
  }

  function matchesEntry(candidate, entry) {
    const candidatePoiId = String(candidate?.poiId || candidate?.id || "").trim();
    if (candidatePoiId && entry.poiIds?.includes(candidatePoiId)) return true;

    const candidateName = normalizeText(candidate?.name);
    if (!candidateName) return false;
    const nameMatches = entry.names.some((name) => normalizeText(name) === candidateName);
    if (!nameMatches) return false;

    const city = normalizeText(entry.city);
    return !city || normalizeText(candidateAddress(candidate)).includes(city);
  }

  function forCandidate(candidate) {
    const directCredits = normalize(candidate?.credits);
    const catalogCredits = CATALOG
      .filter((entry) => matchesEntry(candidate || {}, entry))
      .flatMap((entry) => entry.credits);
    return normalize([...directCredits, ...catalogCredits]);
  }

  global.RestaurantCredits = Object.freeze({
    systems: SYSTEMS,
    order: SYSTEM_ORDER,
    catalog: CATALOG,
    normalize,
    forCandidate,
    generatedLabel,
    normalizeText
  });
})(typeof window === "undefined" ? globalThis : window);
