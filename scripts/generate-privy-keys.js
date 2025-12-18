// Script sinh RSA private key + self-signed certificate cho Privy
// Chạy: node scripts/generate-privy-keys.js

const selfsigned = require("selfsigned");

// Tạo certificate với key length 2048 bit
const attrs = [{ name: "commonName", value: "shineticket-privy" }];
const pems = selfsigned.generate(attrs, {
  keySize: 2048,
  days: 3650,
  algorithm: "sha256",
});

console.log("[DEBUG] selfsigned output keys:", Object.keys(pems));

const privateKeyPem = pems.private || pems.privateKey || pems.key;
const certPem = pems.cert || pems.certificate;

if (!privateKeyPem || !certPem) {
  console.error(
    "Không lấy được privateKey/cert từ selfsigned output, kiểm tra lại phiên bản thư viện."
  );
  process.exit(1);
}

const privateKeyBase64 = Buffer.from(privateKeyPem, "utf8").toString("base64");

console.log("===== PRIVATE KEY (PEM) - KHÔNG DÁN LÊN GIT =====\n");
console.log(privateKeyPem);
console.log(
  "\n===== PRIVATE KEY BASE64 - DÁN VÀO .env: PRIVY_PRIVATE_KEY_BASE64 =====\n"
);
console.log(privateKeyBase64);
console.log(
  "\n===== PUBLIC CERTIFICATE (PEM) - DÁN VÀO PRIVY 'Public verification certificate' =====\n"
);
console.log(certPem);
