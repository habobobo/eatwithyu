const crypto = require("crypto");

const token = crypto.randomBytes(32).toString("base64url");
const hash = crypto.createHash("sha256").update(token, "utf8").digest("hex");

console.log(`EDITOR_TOKEN=${token}`);
console.log(`EDITOR_TOKEN_SHA256=${hash}`);
