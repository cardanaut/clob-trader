/*
 * walletgen.c — Ethereum Vanity Address Generator (C / multi-thread)
 * ────────────────────────────────────────────────────────────────────
 * Compile:  make          (uses Makefile)
 *    or:    gcc -O3 -o walletgen walletgen.c -lcrypto -lpthread -lm \
 *                -Wno-deprecated-declarations
 *
 * Usage:    ./walletgen [prefix] [threads]
 * Example:  ./walletgen 0000
 *           ./walletgen 000000 16
 *
 * Speed:    ~40,000–120,000 keys/s per core (secp256k1 + Keccak-256)
 * Expected: 0000     →  ~65 k   → instant
 *           000000   →  ~16 M   → ~2s    (8 cores)
 *           00000000 →  ~4.3 B  → ~8 min (8 cores)
 *
 * Stack:
 *   - Keccak-256 (Ethereum's hash) — embedded, zero dependencies
 *   - secp256k1 key generation via OpenSSL EC API
 *   - pthreads for parallel workers
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <pthread.h>
#include <time.h>
#include <math.h>
#include <unistd.h>
#include <signal.h>

/* OpenSSL EC (secp256k1) — available in OpenSSL 1.1+ and 3.x */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
#include <openssl/ec.h>
#include <openssl/bn.h>
#include <openssl/obj_mac.h>
#include <openssl/rand.h>

/* ════════════════════════════════════════════════ Keccak-256 ════════
 * Original Keccak team reference (public domain), optimised for x64.
 * Padding byte = 0x01 (Keccak-256, NOT SHA3-256 which uses 0x06).
 * Rate = 136 bytes (1088-bit rate for 256-bit output).
 */

#define ROTL64(x,n) (((x)<<(n))|((x)>>(64-(n))))

static const uint64_t KECCAK_RC[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL,
    0x800000000000808aULL, 0x8000000080008000ULL,
    0x000000000000808bULL, 0x0000000080000001ULL,
    0x8000000080008081ULL, 0x8000000000008009ULL,
    0x000000000000008aULL, 0x0000000000000088ULL,
    0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL,
    0x8000000000008089ULL, 0x8000000000008003ULL,
    0x8000000000008002ULL, 0x8000000000000080ULL,
    0x000000000000800aULL, 0x800000008000000aULL,
    0x8000000080008081ULL, 0x8000000000008080ULL,
    0x0000000080000001ULL, 0x8000000080008008ULL,
};
static const int KECCAK_ROT[24] = {
     1, 62, 28, 27, 36, 44,  6, 55, 20,
     3, 10, 43, 25, 39, 41, 45, 15, 21,
     8, 18,  2, 61, 56, 14,
};
static const int KECCAK_PIL[24] = {
    10,  7, 11, 17, 18,  3,  5, 16,  8,
    21, 24,  4, 15, 23, 19, 13, 12,  2,
    20, 14, 22,  9,  6,  1,
};

static void keccakf1600(uint64_t s[25]) {
    uint64_t bc[5], t;
    int i, j, r;
    for (r = 0; r < 24; r++) {
        /* θ */
        for (i = 0; i < 5; i++)
            bc[i] = s[i] ^ s[i+5] ^ s[i+10] ^ s[i+15] ^ s[i+20];
        for (i = 0; i < 5; i++) {
            t = bc[(i+4)%5] ^ ROTL64(bc[(i+1)%5], 1);
            for (j = 0; j < 25; j += 5) s[j+i] ^= t;
        }
        /* ρπ */
        t = s[1];
        for (i = 0; i < 24; i++) {
            j = KECCAK_PIL[i];
            bc[0] = s[j];
            s[j]  = ROTL64(t, KECCAK_ROT[i]);
            t     = bc[0];
        }
        /* χ */
        for (j = 0; j < 25; j += 5) {
            for (i = 0; i < 5; i++) bc[i] = s[j+i];
            for (i = 0; i < 5; i++) s[j+i] ^= (~bc[(i+1)%5]) & bc[(i+2)%5];
        }
        /* ι */
        s[0] ^= KECCAK_RC[r];
    }
}

/* Compute Keccak-256 of `in` (length `ilen`), write 32 bytes to `out`. */
static void keccak256(const uint8_t *in, size_t ilen, uint8_t out[32]) {
    uint64_t st[25];
    uint8_t  buf[136];
    uint64_t lane;
    int      i;

    memset(st, 0, sizeof(st));

    /* Absorb complete 136-byte blocks */
    while (ilen >= 136) {
        for (i = 0; i < 17; i++) {        /* 136 / 8 = 17 lanes */
            memcpy(&lane, in + i*8, 8);
            st[i] ^= lane;
        }
        keccakf1600(st);
        in   += 136;
        ilen -= 136;
    }

    /* Final block: copy remainder, pad with Keccak-256 rule (0x01 … 0x80) */
    memset(buf, 0, 136);
    memcpy(buf, in, ilen);
    buf[ilen]  = 0x01;          /* Keccak padding — NOT 0x06 (that is SHA3) */
    buf[135]  |= 0x80;

    for (i = 0; i < 17; i++) {
        memcpy(&lane, buf + i*8, 8);
        st[i] ^= lane;
    }
    keccakf1600(st);

    memcpy(out, st, 32);
}

/* ══════════════════════════════════════════════ Shared state ════════ */

typedef struct {
    uint8_t          nibbles[40];   /* target prefix as nibble array   */
    int              nlen;          /* number of nibbles to match       */
    volatile int     found;         /* set to 1 when match is found     */
    volatile long long total;       /* total keys tried across all thds */
    char             res_addr[43];  /* "0x" + 40 hex + NUL             */
    char             res_priv[67];  /* "0x" + 64 hex + NUL             */
    pthread_mutex_t  lock;
} Global;

static Global G;
static volatile int interrupted = 0;

static void on_sigint(int s) { (void)s; interrupted = 1; G.found = 1; }

/* ══════════════════════════════════════════════ Worker thread ═══════ */

static void *worker(void *arg) {
    (void)arg;

    /* Each thread gets its own EC context — not thread-safe to share */
    EC_GROUP *grp  = EC_GROUP_new_by_curve_name(NID_secp256k1);
    EC_POINT *pub  = EC_POINT_new(grp);
    BIGNUM   *priv = BN_new();
    BN_CTX   *ctx  = BN_CTX_new();

    const BIGNUM *order = EC_GROUP_get0_order(grp);

    uint8_t pubbuf[65]; /* 04 || X(32) || Y(32) */
    uint8_t hash[32];
    uint8_t privraw[32];
    long long local_count = 0;

    while (!G.found) {

        /* ── 1. Random private key in [1, order) ─────────────────── */
        do {
            if (RAND_bytes(privraw, 32) != 1) continue;
            BN_bin2bn(privraw, 32, priv);
        } while (BN_is_zero(priv) || BN_cmp(priv, order) >= 0);

        /* ── 2. Public key (secp256k1 scalar multiplication) ──────── */
        if (EC_POINT_mul(grp, pub, priv, NULL, NULL, ctx) != 1) continue;

        /* ── 3. Serialize uncompressed: 04 || X || Y ──────────────── */
        EC_POINT_point2oct(grp, pub, POINT_CONVERSION_UNCOMPRESSED,
                           pubbuf, sizeof(pubbuf), ctx);

        /* ── 4. Keccak-256 of the 64-byte XY payload (skip 04) ────── */
        keccak256(pubbuf + 1, 64, hash);

        /* ── 5. Ethereum address = last 20 bytes of hash ──────────── */
        const uint8_t *addr = hash + 12;

        /* ── 6. Check prefix nibbles ───────────────────────────────── */
        int match = 1;
        for (int i = 0; i < G.nlen && match; i++) {
            uint8_t nibble = (i & 1) ? (addr[i/2] & 0x0f) : (addr[i/2] >> 4);
            if (nibble != G.nibbles[i]) match = 0;
        }

        local_count++;
        if (local_count == 1000) {
            __atomic_fetch_add(&G.total, 1000, __ATOMIC_RELAXED);
            local_count = 0;
        }

        if (match) {
            pthread_mutex_lock(&G.lock);
            if (!G.found) {
                G.found = 1;
                __atomic_fetch_add(&G.total, local_count, __ATOMIC_RELAXED);

                /* Format address (lowercase) */
                snprintf(G.res_addr, 3, "0x");
                for (int i = 0; i < 20; i++)
                    snprintf(G.res_addr + 2 + i*2, 3, "%02x", addr[i]);

                /* Format private key */
                BN_bn2binpad(priv, privraw, 32);
                snprintf(G.res_priv, 3, "0x");
                for (int i = 0; i < 32; i++)
                    snprintf(G.res_priv + 2 + i*2, 3, "%02x", privraw[i]);
            }
            pthread_mutex_unlock(&G.lock);
        }
    }

    /* Flush remaining local count */
    __atomic_fetch_add(&G.total, local_count, __ATOMIC_RELAXED);

    BN_free(priv);
    BN_CTX_free(ctx);
    EC_POINT_free(pub);
    EC_GROUP_free(grp);
    return NULL;
}

#pragma GCC diagnostic pop

/* ══════════════════════════════════════════════ main ════════════════ */

int main(int argc, char *argv[]) {
    const char *prefix  = argc > 1 ? argv[1] : "0000";
    int         nthread = argc > 2 ? atoi(argv[2])
                                   : (int)sysconf(_SC_NPROCESSORS_ONLN);

    if (nthread < 1) nthread = 1;
    if (nthread > 256) nthread = 256;

    /* ── Parse prefix → nibble array ──────────────────────────────── */
    memset(&G, 0, sizeof(G));
    pthread_mutex_init(&G.lock, NULL);

    G.nlen = (int)strlen(prefix);
    if (G.nlen == 0 || G.nlen > 40) {
        fprintf(stderr, "Prefix must be 1–40 hex characters.\n");
        return 1;
    }
    for (int i = 0; i < G.nlen; i++) {
        char c = prefix[i];
        if      (c >= '0' && c <= '9') G.nibbles[i] = (uint8_t)(c - '0');
        else if (c >= 'a' && c <= 'f') G.nibbles[i] = (uint8_t)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') G.nibbles[i] = (uint8_t)(c - 'A' + 10);
        else {
            fprintf(stderr, "Invalid hex char '%c' in prefix.\n", c);
            return 1;
        }
    }

    /* ── Info banner ──────────────────────────────────────────────── */
    double expected = pow(16.0, G.nlen);
    printf("\n");
    printf("  Ethereum Vanity Address Generator  (C / OpenSSL / pthreads)\n");
    printf("  ─────────────────────────────────────────────────────────────\n");
    printf("  Target   : 0x%s...\n", prefix);
    printf("  Threads  : %d\n", nthread);
    printf("  Expected : ~%.0f attempts\n", expected);
    printf("\n");
    printf("  Searching... (Ctrl+C to cancel)\n\n");

    signal(SIGINT, on_sigint);

    /* ── Spawn workers ─────────────────────────────────────────────── */
    pthread_t *threads = malloc((size_t)nthread * sizeof(pthread_t));
    if (!threads) { perror("malloc"); return 1; }

    for (int i = 0; i < nthread; i++)
        pthread_create(&threads[i], NULL, worker, NULL);

    /* ── Progress display (main thread) ────────────────────────────── */
    time_t t0 = time(NULL);
    while (!G.found) {
        sleep(1);
        long long n = __atomic_load_n(&G.total, __ATOMIC_RELAXED);
        long long t = (long long)(time(NULL) - t0);
        if (t > 0) {
            printf("\r  %lld keys | %lld keys/s | %llds elapsed    ",
                   n, n / t, t);
            fflush(stdout);
        }
    }

    for (int i = 0; i < nthread; i++)
        pthread_join(threads[i], NULL);
    free(threads);

    /* ── Result ────────────────────────────────────────────────────── */
    if (interrupted) {
        printf("\n  Interrupted.\n\n");
        pthread_mutex_destroy(&G.lock);
        return 1;
    }

    long long n = __atomic_load_n(&G.total, __ATOMIC_RELAXED);
    long long t = (long long)(time(NULL) - t0);

    printf("\n\n");
    printf("  ┌─────────────────────────────────────────────────────────────┐\n");
    printf("  │  ✓  FOUND                                                   │\n");
    printf("  ├─────────────────────────────────────────────────────────────┤\n");
    printf("  │  Address    : %s\n", G.res_addr);
    printf("  │  PrivateKey : %s\n", G.res_priv);
    printf("  ├─────────────────────────────────────────────────────────────┤\n");
    printf("  │  Attempts   : %lld\n", n);
    printf("  │  Time       : %llds\n", t);
    if (t > 0)
    printf("  │  Speed      : %lld keys/s\n", n / t);
    printf("  └─────────────────────────────────────────────────────────────┘\n\n");
    printf("  ⚠  Save the PrivateKey securely. Never share it.\n\n");

    pthread_mutex_destroy(&G.lock);
    return 0;
}
