// Minimal Ethereum helpers for "Sign in with wallet" — no dependencies.
// keccak256, EIP-191 personal_sign hashing and secp256k1 public-key recovery (to an address).

/* ---------- keccak-256 (Ethereum's pre-standard SHA-3) ---------- */
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M64 = (1n << 64n) - 1n;
const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64;
function keccakF(s){
  for (let round = 0; round < 24; round++){
    const C = new Array(5), D = new Array(5);
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x+5] ^ s[x+10] ^ s[x+15] ^ s[x+20];
    for (let x = 0; x < 5; x++) D[x] = C[(x+4)%5] ^ rotl(C[(x+1)%5], 1);
    for (let i = 0; i < 25; i++) s[i] ^= D[i%5];
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5*((2*x + 3*y) % 5)] = rotl(s[x + 5*y], ROT[x + 5*y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5*y] = B[x + 5*y] ^ ((~B[(x+1)%5 + 5*y] & M64) & B[(x+2)%5 + 5*y]);
    s[0] ^= RC[round];
  }
}
export function keccak256(bytes){
  const rate = 136, s = new Array(25).fill(0n);
  const p = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  p.set(bytes); p[bytes.length] ^= 0x01; p[p.length - 1] ^= 0x80;
  for (let off = 0; off < p.length; off += rate){
    for (let i = 0; i < rate/8; i++){ let v = 0n; for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(p[off + i*8 + b]); s[i] ^= v; }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++){ let v = s[i]; for (let b = 0; b < 8; b++){ out[i*8 + b] = Number(v & 0xffn); v >>= 8n; } }
  return out;
}

/* ---------- secp256k1 ---------- */
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a, m = P){ let [lo, hi, x0, x1] = [mod(a, m), m, 1n, 0n]; while (lo > 1n){ const q = hi / lo; [lo, hi] = [hi - q*lo, lo]; [x0, x1] = [x1 - q*x0, x0]; } return mod(x0, m); }
function powmod(b, e, m = P){ let r = 1n; b = mod(b, m); while (e > 0n){ if (e & 1n) r = r*b % m; b = b*b % m; e >>= 1n; } return r; }
// Jacobian coordinates for speed
const toJ = p => p ? [p[0], p[1], 1n] : null;
function fromJ(J){ if (!J) return null; const zi = inv(J[2]), zi2 = zi*zi % P; return [J[0]*zi2 % P, J[1]*zi2 % P * zi % P]; }
function dbl(J){ if (!J || J[1] === 0n) return null; const [X, Y, Z] = J;
  const S = 4n*X*Y % P * Y % P, M = 3n*X % P * X % P, X3 = mod(M*M - 2n*S), Y3 = mod(M*(S - X3) - 8n*(Y*Y % P)*(Y*Y % P)), Z3 = 2n*Y % P * Z % P; return [X3, Y3, Z3]; }
function addJ(A, B){ if (!A) return B; if (!B) return A;
  const [X1, Y1, Z1] = A, [X2, Y2, Z2] = B, Z1s = Z1*Z1 % P, Z2s = Z2*Z2 % P;
  const U1 = X1*Z2s % P, U2 = X2*Z1s % P, S1 = Y1*Z2s % P * Z2 % P, S2 = Y2*Z1s % P * Z1 % P;
  if (U1 === U2) return S1 === S2 ? dbl(A) : null;
  const H = mod(U2 - U1), R = mod(S2 - S1), H2 = H*H % P, H3 = H2*H % P;
  const X3 = mod(R*R - H3 - 2n*U1*H2), Y3 = mod(R*(U1*H2 - X3) - S1*H3), Z3 = H*Z1 % P * Z2 % P; return [X3, Y3, Z3]; }
function mul(k, p){ let R = null, Q = toJ(p); k = mod(k, N); while (k > 0n){ if (k & 1n) R = addJ(R, Q); Q = dbl(Q); k >>= 1n; } return R; }

const hex = b => Buffer.from(b).toString('hex');
const big = b => BigInt('0x' + (hex(b) || '0'));
const be32 = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');

export function pubToAddress(x, y){
  const h = keccak256(Buffer.concat([be32(x), be32(y)]));
  return '0x' + hex(h.slice(12));
}
export function addressFromPrivateKey(d){ const p = fromJ(mul(d, G)); return pubToAddress(p[0], p[1]); }

// Recover the signer address from a 32-byte hash and a 65-byte signature (r, s, v).
export function recoverAddress(hash32, sigHex){
  const sig = Buffer.from(String(sigHex).replace(/^0x/, ''), 'hex');
  if (sig.length !== 65) throw new Error('bad_signature');
  const r = big(sig.subarray(0, 32)), s = big(sig.subarray(32, 64)); let v = sig[64];
  if (v >= 27) v -= 27; if (v !== 0 && v !== 1) throw new Error('bad_signature');
  if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error('bad_signature');
  if (s > N / 2n) throw new Error('bad_signature'); // EIP-2: reject high-s
  const x = r, ySq = mod(x*x % P * x + 7n), y0 = powmod(ySq, (P + 1n) / 4n);
  if (y0*y0 % P !== ySq) throw new Error('bad_signature');
  const y = (y0 & 1n) === BigInt(v) ? y0 : P - y0;
  const e = big(hash32), rInv = inv(r, N);
  const Q = addJ(mul(mod(-e * rInv, N), G), mul(s * rInv % N, [x, y]));
  const q = fromJ(Q); if (!q) throw new Error('bad_signature');
  return pubToAddress(q[0], q[1]);
}

// EIP-191 personal_sign hash
export function personalHash(message){
  const m = Buffer.from(message, 'utf8');
  return keccak256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${m.length}`, 'utf8'), m]));
}
export const verifyPersonalSign = (message, signature) => recoverAddress(personalHash(message), signature);

// Test helper: sign a 32-byte hash with a private key (deterministic nonce from HMAC). Not used by the site.
export function signHash(hash32, d){
  const crypto = globalThis.__kiraCrypto; if (!crypto) throw new Error('test only');
  const e = big(hash32); let k = big(crypto.createHmac('sha256', be32(d)).update(Buffer.from(hash32)).digest()) % N || 1n;
  const R = fromJ(mul(k, G)), r = R[0] % N; let s = inv(k, N) * (e + r*d) % N; let v = Number(R[1] & 1n);
  if (s > N / 2n){ s = N - s; v ^= 1; }
  return '0x' + hex(be32(r)) + hex(be32(s)) + (27 + v).toString(16);
}
