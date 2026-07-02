// Token-bucket rate limiter, keyed by caller (IP). Pure logic with an
// injectable clock so refill behaviour is unit-testable without real time.

export class RateLimiter {
  // capacity: burst size. refillMs: one token regenerates every refillMs.
  constructor({ capacity = 10, refillMs = 6000, now = () => Date.now() } = {}) {
    this.capacity = capacity;
    this.refillMs = refillMs;
    this.now = now;
    this.buckets = new Map(); // key -> { tokens, updatedAt }
  }

  // Returns true when the call is allowed (and consumes a token).
  allow(key) {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updatedAt: t };
      this.buckets.set(key, b);
    }
    const refilled = Math.floor((t - b.updatedAt) / this.refillMs);
    if (refilled > 0) {
      b.tokens = Math.min(this.capacity, b.tokens + refilled);
      b.updatedAt += refilled * this.refillMs;
    }
    if (b.tokens <= 0) return false;
    b.tokens -= 1;
    return true;
  }

  // Drop buckets that have fully refilled — bounds memory over long uptimes.
  prune() {
    const t = this.now();
    for (const [key, b] of this.buckets) {
      if (t - b.updatedAt >= this.capacity * this.refillMs) this.buckets.delete(key);
    }
  }
}
