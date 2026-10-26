export function id() { return crypto.randomUUID(); }
export function newVault() { return { format: 'foldmemo-vue-1', id: id(), categories: [], items: [], appearance: { style: 'modern', mode: 'light', accent: 'violet', cards: 'cards', language: 'zh' }, security: { openEnabled: true, storageEnabled: true } }; }
export function validate(input) {
    const v = input;
    if (!v || v.format !== 'foldmemo-vue-1' || typeof v.id !== 'string' || !Array.isArray(v.categories) || !Array.isArray(v.items) || !v.appearance || !v.security || v.items.length > 50000 || v.categories.length > 2000)
        throw Error('数据格式不受支持或结构无效');
    const cats = new Set();
    for (const c of v.categories) {
        if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !Array.isArray(c.fields) || c.fields.length > 100 || cats.has(c.id))
            throw Error('分类模板数据不合法');
        cats.add(c.id);
        for (const f of c.fields) {
            if (!f || !['text', 'password', 'url', 'textarea'].includes(f.type) || typeof f.name !== 'string' || typeof f.id !== 'string')
                throw Error('字段模板不合法');
        }
    }
    for (const i of v.items) {
        if (!i || typeof i.title !== 'string' || !['record', 'note'].includes(i.kind) || typeof i.body !== 'string' || !i.values || typeof i.values !== 'object')
            throw Error('记录格式不合法');
    }
    return v;
}
const enc = new TextEncoder(), dec = new TextDecoder();
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); }
function unb64(s) { const d = atob(s); const r = new Uint8Array(d.length); for (let i = 0; i < d.length; i++)
    r[i] = d.charCodeAt(i); return r; }
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
async function derive(pass, salt, bits, rounds, usage) { const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: rounds }, key, { name: 'AES-GCM', length: bits }, false, usage); }
export async function pack(v, pass, rounds = 310000, bits = 256) { validate(v); if (pass === null)
    return { format: 'foldmemo-vue-package-1', encrypted: false, plain: JSON.parse(JSON.stringify(v)) }; if (!pass)
    throw Error('加密密码不能为空'); const salt = random(16), iv = random(12), key = await derive(pass, salt, bits, rounds, ['encrypt']); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, enc.encode(JSON.stringify(v))); return { format: 'foldmemo-vue-package-1', encrypted: true, salt: b64(salt), iv: b64(iv), rounds, payload: b64(new Uint8Array(ct)), bits }; }
export async function unpack(p, pass) { const x = p; if (!x || x.format !== 'foldmemo-vue-package-1')
    throw Error('不是本程序保险库文件'); if (!x.encrypted)
    return validate(x.plain); if (pass === null || !pass)
    throw Error('需要正确的解锁密码'); if (x.rounds < 100000 || x.rounds > 2500000 || ![128, 256].includes(x.bits) || x.payload.length > 40_000_000)
    throw Error('加密参数不合法'); const key = await derive(pass, unb64(x.salt), x.bits, x.rounds, ['decrypt']); const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(unb64(x.iv)) }, key, new Uint8Array(unb64(x.payload))); return validate(JSON.parse(dec.decode(buf))); }
export async function verifier(pass, salt) { if (!pass)
    throw Error('密码不能为空'); const s = salt ? unb64(salt) : random(16); const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(s), iterations: 280000 }, key, 256); return { salt: b64(s), hash: b64(new Uint8Array(bits)) }; }
export function filename(fallback = 'FoldMemo.html') { try {
    return decodeURIComponent(location.pathname.split('/').pop() || fallback);
}
catch {
    return fallback;
} }
export function initialPackage() {
    const el = document.getElementById('foldmemo-embedded');
    if (!el?.textContent?.trim() || el.textContent.trim() === 'null')
        return null;
    try {
        return JSON.parse(el.textContent);
    }
    catch {
        return null;
    }
}
export function htmlWithVault(source, p) {
    const doc = new DOMParser().parseFromString(source, 'text/html'), el = doc.getElementById('foldmemo-embedded');
    if (!el)
        throw Error('HTML 模板缺少内嵌保险库标识');
    el.textContent = JSON.stringify(p).replace(/</g, '\\u003c');
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
export function download(data, name, type) { const u = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
export function normalizedUrl(raw) { const s = raw.trim(); if (!s)
    return null; try {
    const p = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!['http:', 'https:'].includes(p.protocol))
        return null;
    return p.href;
}
catch {
    return null;
} }
