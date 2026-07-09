// bundle.js 재생성 스크립트 (Node.js). 실행: node build-bundle.js
const fs = require("fs");
const path = require("path");

const FILES = [
  "src/shared/constants/api-config.js",
  "src/shared/constants/storage-keys.js",
  "src/shared/http/token-storage.js",
  "src/shared/http/auth-service.js",
  "src/shared/http/http-client.js",
  "src/shared/socket/protocol/socket-constants.js",
  "src/shared/socket/socket-events.js",
  "src/shared/socket/protocol/catpos-codec.js",
  "src/shared/socket/protocol/terminal-codec.js",
  "src/shared/socket/socket-config.js",
  "src/shared/socket/transport/websocket-transport.js",
  "src/shared/socket/transport/serial-transport.js",
  "src/shared/socket/socket-gateway.js",
  "src/features/transaction-parser/transaction-parser.service.js",
  "src/features/point-inquiry/point-inquiry.service.js",
  "src/features/point-settings/point-settings.service.js",
  "src/features/point-transaction/point-transaction.service.js",
  "src/features/point-estimate/point-estimate.service.js",
  "src/features/point-earn/point-earn.service.js",
  "src/features/point-use/point-use.service.js",
  "src/features/result-page/result-page.service.js",
  "src/features/result-page/result-navigator.js",
  "src/features/app-session/app-session.service.js",
  "src/features/app-config/app-config.service.js",
];

const chunks = [];
for (const f of FILES) {
  const full = path.join(__dirname, f);
  if (!fs.existsSync(full)) {
    console.error("MISSING:", f);
    continue;
  }
  const winPath = f.replace(/\//g, "\\");
  chunks.push(`/* ===== ${winPath} ===== */\n`);
  chunks.push(fs.readFileSync(full, "utf8"));
  chunks.push("\n");
}

fs.writeFileSync(path.join(__dirname, "bundle.js"), chunks.join(""), "utf8");
const size = fs.statSync(path.join(__dirname, "bundle.js")).size;
console.log(`bundle.js regenerated: ${size} bytes, ${FILES.length} files`);
