import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIANPING_INPUT = path.join(ROOT, "data", "dianping-must-eat.json");
const OUTPUT = path.join(ROOT, "credits-data.js");

const splitNames = (value) => value
  .split("\n")
  .map((name) => name.trim())
  .filter(Boolean);

const normalizeText = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("zh-CN")
  .replace(/[\s·•・—\-_|｜/／,，。:：;；()（）\[\]【】'"“”‘’]+/g, "");

const dianpingSources = {
  2024: {
    北京: "https://app.bjtitle.com/8816/newshow.php?newsid=6544008&typeid=13",
    深圳: "https://static.nfnews.com/content/202407/03/c9047107.html"
  },
  2025: {
    北京: "https://www.bjnews.com.cn/detail/1750911314168601.html",
    深圳: "https://www.sznews.com/news/content/2025-06/26/content_31611676.htm"
  },
  2026: {
    北京: "https://plat.dianping.com/app/femember-musteat-web/musteat-rank?cityid=2&ranktype=3",
    深圳: "https://plat.dianping.com/app/femember-musteat-web/musteat-rank?cityid=7&ranktype=3"
  }
};

const publishedCounts = {
  "2024|北京": 137,
  "2024|深圳": 79,
  "2025|北京": 142,
  "2025|深圳": 84,
  "2026|北京": 146,
  "2026|深圳": 85
};

// These shops remain in a historical list as IDs, but their public detail payload is gone.
// Names were recovered from public Dianping photo/edit pages and archived result pages.
const inactiveDianpingShopNames = {
  "1692558667": "牛鼎云南特色烧烤（望京店）",
  "1988604904": "粤小馆·宵夜（朝阳门南小街店）",
  "1709626877": "苏小牛·牛肉串（慈云寺店）",
  "22789291": "戈拿旺巴西烤肉（亚运村店）",
  "579615361": "惠丰堂",
  "579743009": "神户赤童日式烤肉（暖山店）",
  "516092": "日昌餐馆（亦庄店）",
  "1348172460": "PATPONG帕蓬·泰国餐厅（南山店）",
  "1037351004": "Riverbed河床",
  "1732350709": "大呲花丹东海鲜烤肉（梅林店）",
  "1799377727": "HIDING（万象天地店）",
  "976116723": "森Some Fusion·创意西厨（宝安店）",
  "24508697": "荷塘味道（水长城店）"
};

// The 2024 Shenzhen release poster still contains all 79 shops, including two entries
// that disappeared completely from the later historical API snapshot.
const shenzhen2024PosterNames = splitNames(`
79号渔船海鲜饭店（科技园店）
HIDING（万象天地店）
I HOLIC艾豪丽披萨（中航城君尚店）
MEAT吃肉酒肆·牛排馆（龙岗万科店）
PATPONG帕蓬·泰国餐厅（南山店）
Riverbed河床
Tony's Kitchen（蛇口店）
巴二代·江湖菜·肥肠芋儿鸡
巴汗羊肉串烧烤店
百年果林椰子鸡（宝安总店）
北村韩食·活烤鳗鱼·大片烤肉（梅林店）
冰村大叔·煲仔粥糖水店（梅林居店）
昌记隆江猪脚饭
潮德阿水牛肉火锅（深圳总店）
潮泰牛肉火锅·创于1992年（车公庙店）
潮香四海·家传潮汕菜（南山店）
潮悦牛肉火锅店（西丽龙井店）
陈鹏鹏潮汕菜（宝安机场店）
成都瓜串串（水围1368店）
成都钟姐钵钵鸡（南山店）
川胖子美蛙鱼头（公园路店）
川香楼酒家
翠湖广东乡下菜（龙井店）
大呲花丹东海鲜烤肉（梅林店）
大树脚云南菜（东园路店）
大唐靓汤私房菜（红荔西路店）
电白鸭粥店
冬阴功泰国菜（蛇口店）
蘩楼（华强北店）
豪林居·潮汕菜·海鲜打冷（八卦一路店）
何止料理（福田中心贰店）
胡哥烤肥牛（梅林总店）
胡须佬鸡煲四季火锅店（皇岗总店）
黄晓猫剁椒大鱼头（福田cocopark店）
火桶1971（生活广场店）
嘉华小吃（蛇口市场店）
江味龙虾馆（南山店）
匠传（上梅林店）
金稻园砂锅粥（海上世界店）
老顾客煲仔饭（蛇口店）
李师傅脆肚（皇庭广场店）
卖鱼佬砂锅粥
明洞串城·烧烤·延边朝鲜族烧烤串专门店（龙华店）
鸟沢TORISAWA（万象天地店）
牛百鲜·牛腩煲火锅（学府路总店）
牛王庙（龙华店）
农畉LONFOOD（万象天地店）
鹏小馆Bistro·深圳特色小馆（华侨城店）
鮨政·Omakase（福田平安金融中心店）
榕意·川味之美（深业上城店）
润园四季椰子鸡火锅（卓悦汇店）
森Some Fusion·创意西厨（宝安店）
山禾田·创作料理（罗湖店）
谭厨中山传家菜（海上世界店）
淘米捞·中山脆肉鲩火锅（皇岗店）
天宝兄弟·湘菜龙虾馆（梅林直营店）
汉和记粥底火锅·团建聚餐（南山店）
西北领头羊·清真餐厅·团建聚会·宴席
犀先生·烧肉（福田店）
先记烧鹅王·本地粤菜（福永总店）
鲜潭蒸汽石锅鱼（欢乐海岸店）
香港新发烧腊茶餐厅（书城店）
香火肥肠（福田店）
湘椒（侨香店）
湘田田·湖南土菜（新安店）
小炳胜（卓悦中心店）
小火璽
新起点脆肉鲩火锅（宝安南路店）
新西园饮食店
新一味潮汕肠粉王（梅林店）
星怡会（深业上城店）
雪乡情东北菜（登良旗舰店）
有章牛杂（石厦店）
渝月川菜（勤诚达店）
誉八仙茶室（万象天地店）
悦满楼·西关名点·湛江名菜（航空综合大厦店）
中山壹鸽
周螺记螺蛳粉
姊妹豆花（南海明珠店）
`);

const michelinEditions = [
  {
    year: 2024,
    city: "北京",
    sourceUrl: "https://www.michelin.com.cn/news/2023/1012-2.html",
    groups: {
      "3-star": splitNames(`京兆尹\n新荣记（新源南路）\n潮上潮（朝阳）`),
      "2-star": splitNames(`京季\n屋里厢`),
      "1-star": splitNames(`
采逸轩
富临饭店
富春居
芙蓉无双
美·大董
淮扬府
Il Ristorante-Niko Romito
湘爱（工体东路）
Jing
京雅堂
利苑（金宝大厦）
玲珑
鲁上鲁
鲁采（安定路）
京艳·翰林书院
Opera Bombana
拾久（东三环中路）
晟永兴（朝阳）
北京厨房
承味堂
TRB Hutong
新荣记（建国门外大街）
新荣记（金融大街）
止观小馆
紫金阁
迦达花园
茉
兰斋
`),
      "bib-gourmand": splitNames(`
爆肚金生隆（安德路）
宝源
闽中闽（东三环北路）
功德林
静一（西城）
柴氏风味斋
老川办
柳泉居
牛街清真满恒记
方砖厂69号炸酱面（方砖厂胡同）
胖妹面庄（东城）
钱塘花园
荣小馆（百子湾南二路）
红馆
天厨妙香素食（朝阳）
同和居（月坛南街）
宜宾招待所
尹三豆汁（东晓市街）
玉华台（西城）
之参
`),
      selected: splitNames(`
1949·全鸭季
Amico BJ
羊大爷涮肉（麦子店西街）
百味园饺子馆
匠牛饺子
壮壮酒馆
花开素食（东城）
鸢尾宫1893
紫膳
意味轩
恰（南三里屯路）
1996川菜·主厨餐厅
唐人馆
楚膳四季
乡味小厨
新长福
晶采轩
老北京炸酱面大王（东兴隆街）
福满圆（新源里）
西院·东
禾苑（丰盛胡同）
泓0871
海天阁
凰庭
禾家
寂川
老干杯（东城）
叶叶菩提（光华路）
腊罗巴
乐·墨瑞
乐福
福楼
文华扒房
郇厨
Mio
锦
金阁
前里
曲廊院
程府宴（西城）
Refer
左岸
三清潭（三里屯路）
上海滩
苏帮袁（将台路）
同春园
潮外粤宴（东长安街）
山河万朵
沃夫冈牛排馆（工人体育场北路）
湘上湘（金和东路）
新明园
裕德孚（东直门内大街）
`)
    }
  },
  {
    year: 2025,
    city: "北京",
    sourceUrl: "https://www.michelin.com.cn/news/2024/1015.html",
    groups: {
      "3-star": splitNames(`潮上潮（朝阳）\n新荣记（新源南路）`),
      "2-star": splitNames(`京季\n京兆尹\n屋里厢\n鲁上鲁`),
      "1-star": splitNames(`
采逸轩
富临饭店
富春居
芙蓉无双
美·大董
迦达花园
淮扬府
Il Ristorante-Niko Romito
湘爱（工体东路）
Jing
兰斋
利苑（金宝大厦）
玲珑
鲁采（安定路）
京艳·翰林书院
茉
拾久（东三环中路）
晟永兴（朝阳）
北京厨房
TRB Hutong
新荣记（建国门外大街）
新荣记（金融大街）
止观小馆
紫金阁
黑天鹅
龙庭
The Georg
`),
      "bib-gourmand": splitNames(`
爆肚金生隆（安德路）
宝源
花开素食（东城）
闽中闽（东三环北路）
功德林
红蕃茄（玉渊潭南路）
京华楼
静一（琉璃厂东街）
柴氏风味斋
老川办
牛街清真满恒记
方砖厂69号炸酱面（方砖厂胡同）
胖妹面庄（香饵胡同）
钱塘花园
荣小馆（百子湾南二路）
红馆
天厨妙香素食（朝阳）
同和居（月坛南街）
宜宾招待所
玉华台（西城）
钟餐厅
`),
      selected: splitNames(`
1949·全鸭季
Amico BJ
羊大爷涮肉（麦子店西街）
百味园饺子馆
匠牛饺子
壮壮酒馆（朝阳公园路）
鸢尾宫1893
紫膳
潮上潮（西城）
恰（南三里屯路）
1996川菜·主厨餐厅
楚膳四季
乡味小厨
新长福
晶采轩
老北京炸酱面大王（东兴隆街）
福满圆（新源里）
福建菜馆
宴锦堂·西院·东
泓0871
海天阁
淮香国色
寂川
禾家（朝阳）
叶叶菩提（光华路）
腊罗巴
乐·墨瑞
福楼
文华扒房
郇厨
Mio
梦都会
俏东北
锦
前里
曲廊院
承味堂
左岸
三清潭（三里屯路）
荣袍
同春园
潮外粤宴（东长安街）
沃夫冈牛排馆（工人体育场北路）
湘上湘（金和东路）
新明园
裕德孚（东直门内大街）
粤界
`)
    }
  },
  {
    year: 2026,
    city: "北京",
    sourceUrl: "https://www.michelin.com.cn/news/2025/1029.html",
    groups: {
      "3-star": splitNames(`潮上潮（朝阳）\n新荣记（新源南路）`),
      "2-star": splitNames(`黑天鹅\n京季\n京兆尹\n兰斋\n鲁上鲁\n屋里厢`),
      "1-star": splitNames(`
采逸轩
潮上潮（西城）
富春居
芙蓉无双
美·大董
迦达花园
Il Ristorante-Niko Romito
Jing
利苑（金宝大厦）
鲁采（安定路）
京艳·翰林书院
茉
拾久（东三环中路）
荣袍
家全七福
晟永兴（朝阳）
北京厨房（建国路）
The Georg
龙庭
TRB Hutong
新荣记（建国门外大街）
新荣记（金融大街）
止观小馆
紫金阁
`),
      "bib-gourmand": splitNames(`
煲煲好
爆肚金生隆（东城）
宝源
闽中闽（东三环北路）
老川办
红蕃茄（玉渊潭南路）
华盛丰（东三环南路）
京华楼
静一（琉璃厂东街）
柴氏风味斋
刘妈妈肉汁饺子（朝阳）
明园餐厅
卖汤
牛街清真满恒记
方砖厂69号炸酱面（方砖厂胡同）
胖妹面庄（香饵胡同）
钱塘花园（双榆树北路）
荣小馆（百子湾南二路）
坛
天厨妙香素食（朝阳）
同和居（月坛南街）
湘彬萱（花园路）
湘临天下
宜宾招待所
玉华台（西城）
钟餐厅
`),
      selected: splitNames(`
1949·全鸭季
Amico BJ
羊大爷涮肉（麦子店西街）
百味园饺子馆（团结湖路）
匠牛饺子（朝阳）
壮壮酒馆（朝阳公园路）
鸢尾宫1893
恰（南三里屯路）
1996川菜·主厨餐厅
楚膳四季
乡味小厨
新长福
晶采轩
老北京炸酱面大王（东兴隆街）
福建菜馆
福满圆（新源里）
宴锦堂·西院·东
泓0871
淮香国色
淮扬府（东城）
湘爱（工体东路）
禾家（朝阳）
寂川
叶叶菩提（光华路）
兰颂
腊罗巴
乐·墨瑞
福楼
梦都会
Mio
前里
俏东北（东城）
曲廊院
左岸
同春园
沃夫冈牛排馆（工人体育场北路）
湘上湘（金和东路）
新明园
檐庭
裕德孚（东直门内大街）
粤界（后阳路）
`)
    }
  },
  {
    year: 2026,
    city: "深圳",
    sourceUrl: "https://www.michelin.com.cn/news/2026/0818.html",
    groups: {
      "2-star": splitNames(`东湾\n云璟`),
      "1-star": splitNames(`潮上潮\nEnsue\nFumée拂鸣\nOpus 388\n新荣记`),
      "bib-gourmand": splitNames(`
翠湖（南山）
大唐靓汤
回潮粥
发记烧鹅美食
高三姐豆花店
戈记美极鲜
化州B记饭店
揭阳老二粿条汤
九九面馆
小桌宴
卖鱼佬砂锅粥
3号码头
Rex山水肠粉
露两手
台山佬黄鳝饭
小芙蓉餐厅
小龙牛肉面（福田）
新湖村促肉（龙华建设路）
新记客家味道
兴宁客家菜馆（梅村路）
缘生态
`),
      selected: splitNames(`
Avant
Blackitch
胤呈
陈皮陈饭庄
主席楼
大林苑
蜑家菜
东山茶寮
珍庭
Gogo饭店
水岸十里（南山）
望月
La Tablée
马旺子
宁波酒家
Notti
配德
荣川菜（深南大道）
山海作
香乐园
植庭
夏宫
珍庭观时
嘉悦里
天屿水
瓦乌
吴
宴庭
颐亭
粤海荟
卓粤轩
`)
    }
  }
];

const rows = new Map();

function rowFor({ city, name, identity }) {
  const key = `${city}|${identity || normalizeText(name)}`;
  if (!rows.has(key)) rows.set(key, { city, names: [], poiIds: [], credits: [] });
  const row = rows.get(key);
  if (name && !row.names.includes(name)) row.names.push(name);
  return row;
}

function addCredit(row, credit) {
  const key = [credit.system, credit.year, credit.distinction || ""].join("|");
  if (!row.credits.some((item) => [item.system, item.year, item.distinction || ""].join("|") === key)) {
    row.credits.push(credit);
  }
}

const dianpingData = JSON.parse(await readFile(DIANPING_INPUT, "utf8"));
const audits = [];

for (const list of dianpingData.lists) {
  const sourceUrl = dianpingSources[list.year][list.city];
  let imported = 0;

  if (list.year === 2024 && list.city === "深圳") {
    for (const name of shenzhen2024PosterNames) {
      const row = rowFor({ city: list.city, name });
      addCredit(row, { system: "dianping-must-eat", year: list.year, sourceUrl });
      imported += 1;
    }
  } else {
    for (const shop of list.shops) {
      const row = rowFor({ city: list.city, name: shop.name, identity: `dp:${shop.shopId}` });
      if (shop.shopId && !row.poiIds.includes(String(shop.shopId))) row.poiIds.push(String(shop.shopId));
      addCredit(row, { system: "dianping-must-eat", year: list.year, sourceUrl });
      imported += 1;
    }

    for (const shopId of list.unresolvedShopIds) {
      const name = inactiveDianpingShopNames[String(shopId)];
      if (!name) continue;
      const row = rowFor({ city: list.city, name, identity: `dp:${shopId}` });
      if (!row.poiIds.includes(String(shopId))) row.poiIds.push(String(shopId));
      addCredit(row, { system: "dianping-must-eat", year: list.year, sourceUrl });
      imported += 1;
    }
  }

  audits.push({
    system: "dianping-must-eat",
    year: list.year,
    city: list.city,
    publishedCount: publishedCounts[`${list.year}|${list.city}`],
    importedCount: imported,
    sourceUrl,
    note: imported === publishedCounts[`${list.year}|${list.city}`]
      ? "完整导入"
      : "源站历史索引已永久删除部分商户，保留发布总数但不再返回商户 ID 或名称"
  });
}

for (const edition of michelinEditions) {
  let imported = 0;
  for (const [distinction, names] of Object.entries(edition.groups)) {
    for (const name of names) {
      const row = rowFor({ city: edition.city, name });
      addCredit(row, {
        system: "michelin",
        year: edition.year,
        distinction,
        sourceUrl: edition.sourceUrl
      });
      imported += 1;
    }
  }
  audits.push({
    system: "michelin",
    year: edition.year,
    city: edition.city,
    publishedCount: imported,
    importedCount: imported,
    sourceUrl: edition.sourceUrl,
    note: "完整导入"
  });
}

// Shenzhen did not have a Michelin Guide city edition in 2024 or 2025.
for (const year of [2024, 2025]) {
  audits.push({
    system: "michelin",
    year,
    city: "深圳",
    publishedCount: 0,
    importedCount: 0,
    sourceUrl: "https://www.michelin.com.cn/news/2026/0818.html",
    note: "深圳首版米其林指南为2026版；此前没有深圳城市版名单"
  });
}

const mergedRows = [];
const mergedByExactName = new Map();
for (const row of rows.values()) {
  const exactKeys = row.names.map((name) => `${row.city}|${normalizeText(name)}`);
  let target = exactKeys.map((key) => mergedByExactName.get(key)).find(Boolean);
  if (!target) {
    target = { city: row.city, names: [], poiIds: [], credits: [] };
    mergedRows.push(target);
  }
  row.names.forEach((name) => {
    if (!target.names.includes(name)) target.names.push(name);
    mergedByExactName.set(`${row.city}|${normalizeText(name)}`, target);
  });
  row.poiIds.forEach((poiId) => {
    if (!target.poiIds.includes(poiId)) target.poiIds.push(poiId);
  });
  row.credits.forEach((credit) => addCredit(target, credit));
}

const catalog = mergedRows
  .filter((row) => row.names.length && row.credits.length)
  .map((row) => ({
    names: row.names,
    city: row.city,
    ...(row.poiIds.length ? { poiIds: row.poiIds } : {}),
    credits: row.credits.sort((a, b) => b.year - a.year || a.system.localeCompare(b.system))
  }))
  .sort((a, b) => a.city.localeCompare(b.city, "zh-CN") || a.names[0].localeCompare(b.names[0], "zh-CN"));

const payload = {
  version: "2026-08-29",
  generatedAt: new Date().toISOString(),
  catalog,
  audits: audits.sort((a, b) => a.system.localeCompare(b.system) || a.city.localeCompare(b.city, "zh-CN") || a.year - b.year)
};

const output = `(function loadRestaurantCreditCatalog(global) {\n  "use strict";\n  global.RestaurantCreditCatalogData = Object.freeze(${JSON.stringify(payload, null, 2)});\n})(typeof window === "undefined" ? globalThis : window);\n`;
await writeFile(OUTPUT, output, "utf8");
process.stdout.write(`${OUTPUT}\n${catalog.length} catalog entries\n`);
