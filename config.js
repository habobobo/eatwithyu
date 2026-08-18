// 在高德开放平台创建“Web端（JS API）”Key 后，将下面两项替换为你自己的值。
window.MAP_CONFIG = {
  key: "8d1b2bd1dd0d99fc6ea30323e7f9fdb2",
  securityJsCode: "8e7665410865854721fa9e7f151bf868",
  defaultCenter: [116.397428, 39.90923], // 北京
  defaultZoom: 12
};

// Supabase 的 Project URL 和 anon public key 可以安全地放在前端；
// 编辑密钥不要写在这里，它只存在于 #edit=... 的编辑链接中。
window.SHARED_MAP_CONFIG = {
  supabaseUrl: "请替换为 Supabase Project URL",
  supabaseAnonKey: "请替换为 Supabase anon public key",
  mapId: "beijing"
};
