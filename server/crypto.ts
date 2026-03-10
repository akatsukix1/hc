import * as crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || "kotak-scalper-secret-2025";
const ENCRYPT_KEY = Buffer.from(SESSION_SECRET.padEnd(32, "0").slice(0, 32), "utf-8");

export function encryptAes(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPT_KEY, iv);
  const padLen = 16 - (Buffer.byteLength(text) % 16);
  const padded = Buffer.concat([Buffer.from(text), Buffer.alloc(padLen, padLen)]);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptAes(data: string): string {
  const [ivHex, encHex] = data.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPT_KEY, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const padLen = decrypted[decrypted.length - 1];
  return decrypted.slice(0, decrypted.length - padLen).toString("utf-8");
}
