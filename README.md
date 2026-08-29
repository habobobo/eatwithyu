# eatwithyu

一张使用高德底图、可以公开浏览并通过私密链接共同编辑的北京美食地图。

## 两种链接

- 公开链接：任何人打开都能查看，不需要账号、密码或登录。
- 私密编辑链接：格式为 `公开网址/#edit=编辑密钥`，持有者可以新增、修改和删除地点。

编辑密钥不会写进前端代码或数据库；云函数只保存它的 SHA-256 哈希。公开访客可以调用读取接口，但保存与图片上传必须通过编辑密钥校验。

## 已有功能

- 高德 POI 搜索与地图双击添加地点
- 新增、编辑、删除地点
- 新建、筛选和二次确认删除分类
- 自定义图标库与图标复用
- 推荐菜单标题、描述与照片
- 到访日期、自己前往或同行人记录
- 备注、未标记地点恢复、数据备份导出
- 单一公开地图「eatwithyu」
- 持编辑链接的人可以随时重命名地图，名称会同步给所有访问者
- 公开链接与私密编辑链接分别复制
- 多人编辑版本冲突保护

## 为什么使用 CloudBase

地图面向中国大陆用户，底图使用高德；共享数据、图片、云函数和可选的静态网站托管使用腾讯云 CloudBase 上海地域。普通访客不会看到登录页。地图主体保存在 PostgreSQL 的 JSONB 字段中，图片放在私有 Bucket，地图数据只保存对象路径，适合逐步增加到 200–300 个地点。

## CloudBase 初始化

1. 在腾讯云 CloudBase 创建上海地域的 PostgreSQL 环境。
2. 在「API Key 管理」创建 Server API Key，并且只把它放进云函数。若保留 SDK 调用作为备用通道，也可以另外创建 Publishable Key。
3. 把环境 ID 填入 `config.js` 和 `cloudbaserc.json`；网页正常使用 HTTP 访问服务地址，不需要用户登录。
4. 创建 `public.shared_maps` 表和私有 Bucket `eatwithyu-assets`，并确保只有 `service_role` 能读写地图表。
5. 生成一组私密编辑密钥：

```bash
node scripts/generate-editor-key.js
```

命令会显示两行：

```text
EDITOR_TOKEN=只放进私密编辑链接
EDITOR_TOKEN_SHA256=只放进云函数环境变量
```

6. 在云函数环境变量中配置以下内容。`CLOUDBASE_APIKEY` 和编辑密钥哈希都不得写入 GitHub：

```text
CLOUDBASE_APIKEY=Server API Key
EDITOR_TOKEN_SHA256=上一步生成的哈希
MAP_ID=beijing
MAP_TITLE=eatwithyu
ASSET_BUCKET=eatwithyu-assets
```

7. 部署普通云函数：

```bash
tcb fn deploy eatwithyu-map
```

8. 为 `eatwithyu-map` 创建唯一的 HTTP 访问路径，并把返回地址填入 `config.js` 的 `cloudbaseHttpEndpoint`。示例命令：

```bash
tcb service create -e 你的环境ID -p eatwithyu-map-public -f eatwithyu-map
```

9. 公开 HTTP 路径允许任何人调用，但云函数内部仍会校验编辑密钥；没有密钥的保存和图片上传请求会被拒绝。PostgreSQL 表和私有 Bucket 保持客户端不可写。

`cloudbaserc.json` 刻意不保存 `envVariables`，避免部署配置被提交到 GitHub。若重新部署到新环境，请先在控制台配置上述环境变量。

## 发布网页

GitHub Pages 可以继续作为现有公开入口。若要进一步优化中国大陆访问，可把同一份静态页面部署到 CloudBase：

```bash
tcb hosting deploy . / -e 你的环境ID --ignore "cloudfunctions/**,scripts/**,tests/**,README.md,cloudbaserc.json,.gitignore"
```

CloudBase 默认域名适合测试。正式长期使用建议绑定已备案的中国大陆自定义域名。

## 地址格式

公开链接示例：

```text
https://habobobo.github.io/eatwithyu/
```

私密编辑链接示例：

```text
https://habobobo.github.io/eatwithyu/#edit=EDITOR_TOKEN
```

编辑链接等同于编辑权限，只发送给可信的人。需要让旧链接失效时，重新生成密钥并只替换云函数中的 `EDITOR_TOKEN_SHA256`。

## 本地预览

```bash
python3 -m http.server 8000
```

访问 `http://localhost:8000`。CloudBase 尚未配置时，网页会回退为读取 `maps/beijing.json` 的公开只读地图。

## 餐厅荣誉数据

搜索结果与已收藏地点详情会按具体城市和分店显示米其林、大众点评必吃榜等荣誉。当前内置北京、深圳 2024–2026 年榜单；同一体系跨年份只显示一个 logo，详情气泡逐年列出结果。

重新拉取大众点评仍公开保留的历史索引并生成浏览器数据：

```bash
node scripts/fetch-dianping-must-eat.mjs
node scripts/build-restaurant-credits.mjs
```

深圳的首版米其林指南是 2026 版，因此不存在 2024、2025 深圳米其林城市版名单。大众点评历史索引会在商户彻底下线后删除条目；`credits-data.js` 的 `audits` 同时记录发布数量和当前逐店可核验数量，不用猜测条目补足发布数字。
