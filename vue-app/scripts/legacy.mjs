/* Explicit import adapter for 1.0.0–1.0.4. Never auto-load historical files. */
import { newVault, id, validate } from './vault.mjs';
const enc = new TextEncoder(), dec = new TextDecoder();
const deb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function safeRounds(n) { if (!Number.isSafeInteger(n) || n < 150000 || n > 1000000)
    throw Error('旧文件 KDF 参数非法'); return n; }
async function oldKdf(pass, salt, iterations) { const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(deb64(salt)), iterations: safeRounds(iterations) }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); }
async function unwrap(blob, pass) { const key = await oldKdf(pass, blob.salt, blob.iterations); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(deb64(blob.iv)) }, key, new Uint8Array(deb64(blob.data)))); }
function adapted(payload, old) {
    if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.items) || payload.items.length > 50000)
        throw Error('旧保险库的记录结构异常');
    const v = newVault();
    v.id = String(payload.id || old.id || id());
    v.categories = payload.categories.map((c) => ({ id: String(c.id || id()), name: String(c.name || '未命名分类'), fields: (c.fields || []).map((f) => ({ id: String(f.id || id()), name: String(f.name || '未命名字段'), type: (f.type === 'multiline' ? 'textarea' : f.type) })) }));
    const groups = new Set(v.categories.map(c => c.id));
    v.items = payload.items.map((it, i) => ({ id: String(it.id || id()), kind: it.kind === 'note' ? 'note' : 'record', title: String(it.title || '未命名'), categoryId: groups.has(String(it.categoryId)) ? String(it.categoryId) : '', body: String(it.body || ''), values: Object.fromEntries(Object.entries(it.values || {}).map(([k, value]) => [k, String(value ?? '')])), favorite: !!it.favorite, order: Number.isFinite(it.order) ? Number(it.order) : i + 1, updated: Number(it.updatedAt) || Date.now() }));
    const a = payload.appearance || {};
    v.appearance = { style: a.style === 'modern' ? 'modern' : a.style === 'memo' || a.style === 'minimal' ? 'minimal' : 'default', mode: a.scheme === 'dark' ? 'dark' : a.scheme === 'system' ? 'system' : 'light', accent: a.accent === 'blue' ? 'blue' : a.accent === 'green' ? 'green' : a.accent === 'pink' ? 'rose' : 'violet', cards: a.cardType === 'list' ? 'list' : 'cards', language: a.language === 'en' ? 'en' : 'zh' };
    v.security.openEnabled = !!old.security.openEnabled;
    // Historical encrypted export requires the historical password, but its KDF metadata is NOT reused as new export credentials.
    v.security.storageEnabled = false;
    return validate(v);
}
export function isLegacy(input) { const v = input; return !!v && /^foldmemo-v1\.0\.[0-4]$/.test(v.format) && !!v.security; }
export async function decodeLegacy(input, pass) {
    if (!isLegacy(input))
        throw Error('不支持的旧版保险库格式');
    const old = input;
    let payload;
    if (old.security.encryptEnabled) {
        if (!old.encrypted)
            throw Error('旧保险库缺少加密数据');
        let raw;
        const candidates = [old.security.storeWrap, old.security.openWrap].filter((x) => !!x);
        for (const w of candidates) {
            try {
                raw = await unwrap(w, pass);
                break;
            }
            catch { /* try other wrapper */ }
        }
        if (!raw)
            throw Error('旧保险库密码不正确或加密密钥已损坏');
        const bits = old.security.cipher === 'aes128' ? 128 : 256;
        const key = await crypto.subtle.importKey('raw', new Uint8Array(raw.subarray(0, bits / 8)), { name: 'AES-GCM' }, false, ['decrypt']);
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(deb64(old.encrypted.iv)) }, key, new Uint8Array(deb64(old.encrypted.data)));
        payload = JSON.parse(dec.decode(bytes));
    }
    else {
        if (old.security.openEnabled) {
            const proof = old.security.openProof;
            if (!proof)
                throw Error('缺少历史打开密码校验');
            const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
            const bytes = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(deb64(proof.salt)), iterations: safeRounds(proof.iterations) }, material, 256);
            let out = '';
            for (const b of new Uint8Array(bytes))
                out += String.fromCharCode(b);
            if (btoa(out) !== proof.digest)
                throw Error('旧打开密码不正确');
        }
        payload = old.plain;
    }
    if (payload?.id !== old.id)
        throw Error('历史保险库身份校验失败');
    return adapted(payload, old);
}
