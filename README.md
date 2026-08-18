# 在北京吃饭

一个可以通过链接共同维护的北京美食地图。

## 使用方式

- 普通链接：只读浏览。
- 带 `#edit=编辑密钥` 的链接：可新增、修改和删除地点、分类及图标。
- 编辑密钥不会保存在网页代码或浏览器 localStorage 中；数据库只保存不可逆哈希。
- 任一编辑者保存后，另一位编辑者刷新页面即可看到最新内容。
- 同时编辑时使用版本号避免后一位无意覆盖前一位的修改。

## Supabase 设置

1. 创建一个 Supabase 项目。
2. 打开 SQL Editor，执行 `supabase/setup.sql`。执行前替换其中的随机编辑密钥占位符。
3. 在 Project Settings → API 中复制 Project URL 和 anon public key。
4. 把两项填写到 `config.js` 的 `window.SHARED_MAP_CONFIG`。
5. 部署后，普通网址为只读链接；编辑链接格式如下：

```text
https://habobobo.github.io/eatwithyu/#edit=你的随机编辑密钥
```

编辑链接等同于密码。只分享给可信的人；如链接泄露，可在 Supabase SQL Editor 中更新密钥哈希，让旧链接立即失效。

## 本地预览

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。未填写 Supabase 配置时，页面会回退为读取 `maps/beijing.json` 的只读地图。
