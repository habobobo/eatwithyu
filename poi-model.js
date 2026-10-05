(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.POIModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const groups = [
    { id: "food", name: "吃喝" },
    { id: "culture", name: "文化" },
    { id: "outdoors", name: "自然与户外" },
    { id: "stay", name: "住宿" },
    { id: "transport", name: "交通" },
    { id: "life", name: "日常生活" },
    { id: "other", name: "其他" }
  ];

  const field = (id, label, placeholder) => ({ id, label, placeholder });
  const profiles = [
    {
      id: "dining", groupId: "food", name: "餐厅与小吃", title: "推荐菜", item: "推荐菜", unit: "道",
      help: "记下值得点的菜、口味和照片。", titlePlaceholder: "例如：招牌烤鸭", descriptionLabel: "口味与推荐理由",
      descriptionPlaceholder: "口味、分量、价格，或下次还想点什么",
      fields: [field("budget", "人均参考", "例如：约 100 元"), field("occasion", "适合场景", "例如：朋友聚餐、安静约会"), field("reservation", "订位与排队", "记录自己的经验")]
    },
    {
      id: "cafe", groupId: "food", name: "咖啡与茶饮", title: "推荐饮品", item: "饮品", unit: "款",
      help: "记录常点的饮品，也可以记下甜点。", titlePlaceholder: "例如：手冲、拿铁", descriptionLabel: "风味与体验",
      descriptionPlaceholder: "风味、烘焙度或喜欢的搭配",
      fields: [field("budget", "消费参考", "例如：一杯约 35 元"), field("atmosphere", "空间与氛围", "例如：安静、适合看书"), field("seating", "座位与设施", "例如：有插座、户外座位")]
    },
    {
      id: "dessert", groupId: "food", name: "甜品与冰淇淋", title: "推荐口味", item: "口味", unit: "款",
      help: "记住喜欢的甜品和冰淇淋口味。", titlePlaceholder: "例如：开心果 Gelato", descriptionLabel: "风味与推荐理由",
      descriptionPlaceholder: "甜度、口感或搭配建议",
      fields: [field("budget", "消费参考", "例如：双球约 40 元"), field("seasonal", "季节限定", "喜欢的限定口味或供应季节")]
    },
    {
      id: "bar", groupId: "food", name: "酒吧与酒馆", title: "推荐酒款", item: "酒款", unit: "款",
      help: "记录喜欢的酒款、风味和照片。", titlePlaceholder: "例如：招牌鸡尾酒", descriptionLabel: "风味与体验",
      descriptionPlaceholder: "风味、酒体或调酒师的推荐",
      fields: [field("budget", "消费参考", "例如：每杯约 80 元"), field("atmosphere", "氛围与音量", "例如：适合聊天、音乐较轻"), field("reservation", "订位与营业提示", "记录自己的经验")]
    },
    {
      id: "museum", groupId: "culture", name: "博物馆与展览", title: "值得看的展览与藏品", item: "看点", unit: "项",
      help: "记录喜欢的展品、展览和展厅。", titlePlaceholder: "例如：曾侯乙编钟", descriptionLabel: "展厅与观看心得",
      descriptionPlaceholder: "在哪个展厅、为什么值得看",
      fields: [field("openingHours", "开放时间", "填写已确认的时间"), field("admission", "门票与预约", "预约方式、票价或入馆提醒"), field("duration", "建议停留", "例如：2–3 小时"), field("route", "参观顺序", "例如：先常设展，再特展")]
    },
    {
      id: "architecture", groupId: "culture", name: "建筑与街区", title: "看点与拍照机位", item: "看点", unit: "处",
      help: "记录建筑细节、街区角落和拍摄位置。", titlePlaceholder: "例如：临江立面、街角机位", descriptionLabel: "位置与观看建议",
      descriptionPlaceholder: "在哪个方向、怎样走或怎样拍",
      fields: [field("access", "参观方式", "例如：外观可看，室内需预约"), field("bestTime", "适合时段", "例如：傍晚光线较好"), field("duration", "建议停留", "例如：30 分钟")]
    },
    {
      id: "temple", groupId: "culture", name: "寺庙与宗教场所", title: "参观重点", item: "看点", unit: "处",
      help: "记录建筑、庭院和参观体验。", titlePlaceholder: "例如：主殿、庭院", descriptionLabel: "参观心得",
      descriptionPlaceholder: "看点、路线或需要留意的事",
      fields: [field("openingHours", "开放时间", "填写已确认的时间"), field("admission", "门票与预约", "票价或入场方式"), field("etiquette", "参观提醒", "例如：拍照要求、着装与礼仪")]
    },
    {
      id: "bookstore", groupId: "culture", name: "书店与阅读", title: "选书与空间推荐", item: "推荐", unit: "项",
      help: "记录喜欢的书、书架和阅读角落。", titlePlaceholder: "例如：艺术书区、临窗阅读位", descriptionLabel: "喜欢的理由",
      descriptionPlaceholder: "选书特色、阅读体验或值得买的书",
      fields: [field("openingHours", "开放时间", "填写已确认的时间"), field("specialty", "选书特色", "例如：文学、设计、独立出版"), field("seating", "阅读与座位", "能否坐下来阅读、是否需要消费")]
    },
    {
      id: "park", groupId: "outdoors", name: "公园与风景", title: "风景与散步路线", item: "看点", unit: "处",
      help: "记录喜欢的风景、步道和休息位置。", titlePlaceholder: "例如：江边步道、落日机位", descriptionLabel: "位置与走法",
      descriptionPlaceholder: "入口、沿途风景或适合坐下来的位置",
      fields: [field("bestTime", "适合时段", "例如：日落前一小时"), field("duration", "步行与停留", "例如：散步约 1 小时"), field("access", "入口与设施", "入口、洗手间、座椅或遮阴")]
    },
    {
      id: "birding", groupId: "outdoors", name: "观鸟", title: "观察记录", item: "观察", unit: "条",
      help: "记录观察到的鸟种、位置和照片。", titlePlaceholder: "例如：白鹭、翠鸟", descriptionLabel: "观察位置与情况",
      descriptionPlaceholder: "在哪里看到、观察时的情况",
      fields: [field("bestTime", "季节与时段", "例如：冬季清晨"), field("access", "观察点与入口", "岸边、林地或具体入口"), field("equipment", "装备与提醒", "例如：望远镜、防蚊、保持距离")]
    },
    {
      id: "hotel", groupId: "stay", name: "酒店与住宿", title: "入住体验", item: "体验", unit: "项",
      help: "记录房间、早餐和喜欢的设施。", titlePlaceholder: "例如：安静房型、早餐", descriptionLabel: "体验与建议",
      descriptionPlaceholder: "房型选择、隔音、舒适度或服务体验",
      fields: [field("checkIn", "入住与退房", "例如：15:00 入住，12:00 退房"), field("room", "房型与价格参考", "记录入住时的房型和价格"), field("facilities", "设施与服务", "例如：洗衣房、早餐、行李寄存")]
    },
    {
      id: "transport", groupId: "transport", name: "车站与交通", title: "出行提示", item: "提示", unit: "条",
      help: "记录出入口、候车或换乘经验。", titlePlaceholder: "例如：南进站口、出租车候车点", descriptionLabel: "走法与提醒",
      descriptionPlaceholder: "怎样走、需要预留多少时间",
      fields: [field("connections", "线路与换乘", "地铁线路、公交或换乘方式"), field("entrance", "常用出入口", "例如：东广场进站口"), field("buffer", "提前到达", "例如：提前 40 分钟")]
    },
    {
      id: "everyday", groupId: "life", name: "日常地点", title: "实用信息", item: "提示", unit: "条",
      help: "记录抵达方式和经常用到的信息。", titlePlaceholder: "例如：常用入口、停车位置", descriptionLabel: "具体说明",
      descriptionPlaceholder: "记录有用的到达或使用提示",
      fields: [field("entrance", "入口与到达", "常用入口或步行走法"), field("facilities", "周边与设施", "停车、取快递或附近服务")]
    },
    {
      id: "general", groupId: "other", name: "通用地点", title: "地点看点", item: "记录", unit: "条",
      help: "记录这个地点值得记住的事。", titlePlaceholder: "写下一个看点或提示", descriptionLabel: "具体说明",
      descriptionPlaceholder: "体验、使用方式或推荐理由",
      fields: [field("access", "到达与使用", "入口、开放方式或实用信息"), field("bestTime", "适合时段", "什么时候来比较合适")]
    }
  ];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const normalizeName = (value) => String(value || "").normalize("NFKC").trim().toLowerCase();

  function inferDetailType(name) {
    const key = normalizeName(name);
    if (/观鸟/.test(key)) return "birding";
    if (/咖啡|茶饮|茶馆/.test(key)) return "cafe";
    if (/gelato|冰淇淋|甜品|甜点|烘焙/.test(key)) return "dessert";
    if (/酒吧|酒馆|喝的/.test(key)) return "bar";
    if (/博物|美术馆|展览|艺术馆/.test(key)) return "museum";
    if (/建筑|街区|古迹/.test(key)) return "architecture";
    if (/寺庙|寺院|宗教|教堂/.test(key)) return "temple";
    if (key === "书" || /书店|图书|阅读/.test(key)) return "bookstore";
    if (/公园|江滩|风景|户外|徒步|自然/.test(key)) return "park";
    if (/酒店|住宿|民宿/.test(key)) return "hotel";
    if (/车站|机场|码头|交通|地铁/.test(key)) return "transport";
    if (/^(家|单位|工作|生活|日常)$/.test(key)) return "everyday";
    if (/菜|海鲜|吃的|餐|小吃|早餐|过早|火锅|烧烤|面食/.test(key)) return "dining";
    return "general";
  }

  function categoryGroup(category = {}) {
    if (groups.some((group) => group.id === category.groupId)) return category.groupId;
    return byId.get(category.detailType || inferDetailType(category.name))?.groupId || "other";
  }

  function categoryDetailType(category = {}) {
    if (byId.has(category.detailType)) return category.detailType;
    const inferred = inferDetailType(category.name);
    if (!category.groupId || byId.get(inferred).groupId === categoryGroup(category)) return inferred;
    return profiles.find((profile) => profile.groupId === categoryGroup(category))?.id || "general";
  }

  function placeDetailType(place = {}, category = {}) {
    if (byId.has(place.detailType)) return place.detailType;
    // 这些现有标记借用了寺庙图标，内容仍按建筑展示；用户可以手动覆盖。
    if (categoryDetailType(category) === "temple" && /^(黄鹤楼|晴川阁|行吟阁)$/.test(place.name || "")) return "architecture";
    return categoryDetailType(category);
  }

  function normalizeEntries(place = {}) {
    const source = Array.isArray(place.recommendations) && place.recommendations.length
      ? place.recommendations : place.recommendation ? [place.recommendation] : [];
    return source.filter((item) => item && typeof item === "object").slice(0, 10).map((item) => ({
      title: String(item.title || "").slice(0, 80),
      description: String(item.description || "").slice(0, 300),
      photo: String(item.photo || ""),
      photoFileId: String(item.photoFileId || ""),
      detailType: byId.has(item.detailType) ? item.detailType : "dining"
    })).filter((item) => item.title || item.description || item.photo || item.photoFileId);
  }

  function normalizeDetails(input = {}) {
    const result = {};
    profiles.forEach((profile) => {
      const source = input?.[profile.id];
      if (!source || typeof source !== "object") return;
      const fields = {};
      profile.fields.forEach((field) => {
        const value = String(source[field.id] || "").trim().slice(0, 300);
        if (value) fields[field.id] = value;
      });
      if (Object.keys(fields).length) result[profile.id] = fields;
    });
    return result;
  }

  return { groups, profiles, inferDetailType, categoryGroup, categoryDetailType, placeDetailType, normalizeEntries, normalizeDetails, profile: (id) => byId.get(id) || byId.get("general") };
});
