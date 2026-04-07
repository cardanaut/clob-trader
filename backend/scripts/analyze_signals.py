#!/usr/bin/env python3
"""
Polychamp — Signal Analysis (Phase 2: Bayesian Frequency Analysis)

Analyzes rejected + executed trades using Bayesian Beta-Binomial model
to answer:
  1. Which filters have high false-positive rates (blocking good signals)?
  2. Where does the edge come from (spike size, entry price, crypto, time)?
  3. How do sequence features differ between WIN/LOSS/FP?

Usage:
  cd /var/www/jeer.currenciary.com/polychamp
  python3 backend/scripts/analyze_signals.py

Output:
  Console report (colored)
  backend/logs/analysis_rejected.csv
  backend/logs/analysis_trades.csv
  backend/logs/analysis_features.csv   (records with context_candles)
"""

import os, sys, json, math, re
import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
from scipy import stats
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE  = os.path.join(BASE_DIR, '.env')
OUT_DIR   = os.path.join(BASE_DIR, 'logs')
PM_CACHE  = os.path.join(BASE_DIR, 'cache', 'pm_outcomes.json')

# Bayesian prior — Beta(0.5, 2.5) gives prior mean ~17% (skeptical)
# Matches our pessimistic WR spirit: wins / (total + 3) ≈ Beta(0.5, 2.5) mean
PRIOR_ALPHA = 0.5
PRIOR_BETA  = 2.5
CI_LEVEL    = 0.90   # 90% credible interval

# ANSI
RED    = '\033[91m'
GREEN  = '\033[92m'
YELLOW = '\033[93m'
BLUE   = '\033[94m'
CYAN   = '\033[96m'
BOLD   = '\033[1m'
DIM    = '\033[2m'
RESET  = '\033[0m'

# ── Bayesian helpers ──────────────────────────────────────────────────────────

def beta_stats(wins, losses):
    """Posterior Beta-Binomial: (mean, lo_ci, hi_ci)."""
    a = PRIOR_ALPHA + wins
    b = PRIOR_BETA  + losses
    lo, hi = stats.beta.ppf([(1 - CI_LEVEL) / 2, 1 - (1 - CI_LEVEL) / 2], a, b)
    return stats.beta.mean(a, b), lo, hi

def wr_str(wins, losses, color=True):
    n = wins + losses
    if n == 0:
        return f'{DIM}—{RESET}' if color else '—'
    mean, lo, hi = beta_stats(wins, losses)
    pct_str = f'{mean*100:.1f}% [{lo*100:.1f}–{hi*100:.1f}%] ({wins}W/{losses}L)'
    if not color:
        return pct_str
    clr = GREEN if mean >= 0.90 else YELLOW if mean >= 0.70 else RED
    return f'{clr}{pct_str}{RESET}'

def logit(p):
    p = max(0.001, min(0.999, float(p))  )
    return math.log(p / (1 - p))

# ── Env + DB ──────────────────────────────────────────────────────────────────

def read_env():
    env = {}
    if os.path.exists(ENV_FILE):
        for line in open(ENV_FILE):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

def db_connect(env):
    url = env.get('DATABASE_URL', '')
    # Parse URL manually — password may contain @ and :
    # Format: postgresql://user:pass@host:port/dbname
    m = re.match(r'postgresql://([^:]+):(.+)@([^:/]+):(\d+)/(\w+)$', url)
    if not m:
        raise ValueError(f'Cannot parse DATABASE_URL: {url!r}')
    user, password, host, port, dbname = m.groups()
    return psycopg2.connect(host=host, port=int(port), dbname=dbname,
                            user=user, password=password)

def load_pm_outcomes():
    if not os.path.exists(PM_CACHE):
        return {}
    with open(PM_CACHE) as f:
        return json.load(f)

def pm_outcome(pm, crypto, cycle_start_ms, candle_size):
    """Returns 'UP', 'DOWN', or None."""
    dur = 300 if candle_size < 100 else 900
    key = f'{crypto}_{int(cycle_start_ms // 1000)}_{dur}'
    return pm.get(key)

def _coerce_row(row):
    """Convert Decimal / memoryview DB types to Python native for pandas."""
    import decimal
    out = {}
    for k, v in row.items():
        if isinstance(v, decimal.Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out

def load_db(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT id, crypto, candle_size, direction,
               spike_pct, yes_ask, no_ask, entry_price,
               threshold, reason, details,
               cycle_start_ms, context_candles, created_at
        FROM t1000_rejected
        ORDER BY created_at
    """)
    rejected = [_coerce_row(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT trade_id, crypto, candle_size, direction,
               spike_pct, entry_price, position_usd,
               status, pnl_usd, cycle_start, trade_time,
               context_candles
        FROM t1000_live_trades
        WHERE strategy IN ('LIVE', 'LIVE_KALSHI')
          AND status IN ('WIN', 'LOSS')
        ORDER BY trade_time
    """)
    trades = [_coerce_row(r) for r in cur.fetchall()]

    cur.close()
    return rejected, trades

# ── Feature extraction ────────────────────────────────────────────────────────

def extract_ctx_features(ctx, direction, candle_size=None):
    """
    Extract predictive features from context_candles list.
    ctx         = list of {t, o, h, l, c, sp, ya, na}
                  OHLC in raw Binance USD prices (candle_size seconds per candle)
                  ya/na in 0-1 Polymarket scale
    candle_size = CXX duration in seconds (e.g. 80 for C80)
                  8 × candle_size = total context window in seconds
    Returns dict of ratio-based features (scale-free, comparable across CXX sizes).
    """
    if not ctx or len(ctx) < 1:
        return {}

    def s(v):
        return float(v) if v is not None else None

    def body_ratio(c):
        h, l, o, cl = s(c.get('h')), s(c.get('l')), s(c.get('o')), s(c.get('c'))
        if any(x is None for x in (h, l, o, cl)) or h == l:
            return None
        return abs(cl - o) / (h - l)

    def rng(c):
        h, l = s(c.get('h')), s(c.get('l'))
        return (h - l) if (h is not None and l is not None) else None

    def cdir(c):
        o, cl = s(c.get('o')), s(c.get('c'))
        if o is None or cl is None:
            return 0
        return 1 if cl > o else (-1 if cl < o else 0)

    spike  = ctx[-1]
    prior  = ctx[:-1]
    target = 1 if direction == 'UP' else -1

    # ── Spike candle ──────────────────────────────────────────────────────────
    sp_body  = body_ratio(spike)
    sp_range = rng(spike)
    h = s(spike.get('h')); l = s(spike.get('l'))
    o = s(spike.get('o')); cl = s(spike.get('c'))
    if sp_range and sp_range > 0 and all(x is not None for x in (h, l, o, cl)):
        upper_wick = (h - max(o, cl)) / sp_range
        lower_wick = (min(o, cl) - l)  / sp_range
    else:
        upper_wick = lower_wick = None

    ya = s(spike.get('ya'))
    na = s(spike.get('na'))
    entry_price = ya if direction == 'UP' else na

    # ── Prior candles ─────────────────────────────────────────────────────────
    prior_dirs   = [cdir(c) for c in prior]
    prior_ranges = [r for c in prior if (r := rng(c)) is not None]
    prior_bodies = [b for c in prior if (b := body_ratio(c)) is not None]

    # Consecutive same-direction candles immediately before spike
    consec = 0
    for d in reversed(prior_dirs):
        if d == target:
            consec += 1
        else:
            break

    # Range expansion: spike range vs mean of last 4 prior candles
    range_exp = None
    if sp_range and len(prior_ranges) >= 2:
        range_exp = sp_range / np.mean(prior_ranges[-4:])

    # Body acceleration: spike body vs mean of last 3 prior bodies
    body_acc = None
    if sp_body is not None and len(prior_bodies) >= 2:
        body_acc = sp_body / np.mean(prior_bodies[-3:])

    # Pre-spike drift: % change from first to last prior candle close
    c0 = s(prior[0].get('c')) if prior else None
    cN = s(prior[-1].get('c')) if prior else None
    pre_trend = ((cN - c0) / c0) if (c0 and cN and c0 != 0) else None

    # Volatility coefficient of variation
    vol_regime = (np.std(prior_ranges) / np.mean(prior_ranges)) if len(prior_ranges) >= 3 else None

    # Order book quality
    ob_eff     = (ya + na) if (ya and na) else None
    logit_ep   = logit(entry_price) if (entry_price and 0 < entry_price < 1) else None

    return {
        'entry_price'     : entry_price,
        'logit_entry'     : logit_ep,
        'ob_efficiency'   : ob_eff,
        'spike_body_ratio': sp_body,
        'spike_upper_wick': upper_wick,
        'spike_lower_wick': lower_wick,
        'spike_range_exp' : range_exp,
        'body_accel'      : body_acc,
        'consec_same_dir' : consec,
        'pre_trend_pct'   : pre_trend,
        'vol_regime'      : vol_regime,
        'mean_body_prior' : np.mean(prior_bodies) if prior_bodies else None,
        # CXX candle metadata — OHLC is in Binance USD prices for candles of candle_size seconds
        'n_ctx_candles'   : len(ctx),
        'ctx_span_sec'    : len(ctx) * candle_size if candle_size else None,
    }

def candle_label(candle_size):
    """Human-readable candle label, e.g. 'C80' or 'C210'."""
    return f'C{candle_size}'

def detection_offset_str(candle_size):
    """How far into the market cycle the signal fires, e.g. '1m20s'."""
    m = candle_size // 60
    s = candle_size % 60
    return f'{m}m{s:02d}s' if m else f'{s}s'

def context_span_str(candle_size, n=8):
    """Total time covered by n CXX-second candles, e.g. '640s (2 × 5m cycle)'."""
    total_s = candle_size * n
    cycle_s = 300 if candle_size < 100 else 900
    cycles  = total_s / cycle_s
    return f'{total_s}s ({cycles:.1f} cycles)'

# ── Printers ──────────────────────────────────────────────────────────────────

def section(title):
    print(f'\n{BOLD}{CYAN}{"═" * 72}{RESET}')
    print(f'{BOLD}{CYAN}  {title}{RESET}')
    print(f'{BOLD}{CYAN}{"═" * 72}{RESET}')

def sub(title):
    print(f'\n{BOLD}{BLUE}  ── {title} ──{RESET}')

REASON_LABELS = {
    'below_threshold'  : 'BELOW THRESHOLD',
    'weak_body'        : 'WEAK BODY',
    'bad_wick'         : 'BAD WICK',
    'price_too_high'   : 'PRICE TOO HIGH',
    'price_too_low'    : 'PRICE TOO LOW',
    'no_liquidity'     : 'NO LIQUIDITY',
    'already_pending'  : 'ALREADY PENDING',
    'asset_already_open': 'ASSET ALREADY OPEN',
    'max_positions'    : 'MAX POSITIONS',
    'signal_too_stale' : 'STALE SIGNAL',
    'bad_slot'         : 'BAD SLOT',
}

# ── Analysis sections ─────────────────────────────────────────────────────────

def analyze_rejected(rejected, pm):
    """FPR per reason, crypto, market type — with Bayesian CIs."""
    section('REJECTED SIGNALS — False Positive Rate (FPR)')
    print(f'{DIM}  FPR = % of rejected signals that WOULD have won = over-aggressive filter{RESET}')
    print(f'{DIM}  Green ≥90% FPR → filter is almost always wrong; Red <30% → filter is working{RESET}')

    rows = []
    for r in rejected:
        if not r.get('cycle_start_ms'):
            continue
        outcome = pm_outcome(pm, r['crypto'], r['cycle_start_ms'], r['candle_size'])
        if outcome is None:
            continue
        feats = extract_ctx_features(r.get('context_candles') or [], r['direction'])
        rows.append({
            **r,
            'outcome'   : outcome,
            'would_win' : int(outcome == r['direction']),
            **{f'ctx_{k}': v for k, v in feats.items()},
        })

    total_rej   = len(rejected)
    known_rej   = len(rows)
    unknown_rej = total_rej - known_rej

    print(f'\n  Total rejected signals : {total_rej}')
    print(f'  With known outcome     : {known_rej}  (awaiting PM resolution: {unknown_rej})')

    if not rows:
        print(f'\n  {YELLOW}No rejected signals with known outcomes yet.{RESET}')
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    overall_fp = df['would_win'].sum()
    print(f'  Would have WON         : {overall_fp}  ({overall_fp/known_rej*100:.0f}% of known)')

    # ── By reason ─────────────────────────────────────────────────────────────
    sub('By Rejection Reason')
    by_r = df.groupby('reason', as_index=False)['would_win'].agg(wins='sum', total='count')
    by_r['losses'] = by_r['total'] - by_r['wins']
    for _, row in by_r.sort_values('total', ascending=False).iterrows():
        label = REASON_LABELS.get(row['reason'], row['reason'].upper())
        print(f'  {label:<24} {wr_str(row["wins"], row["losses"])}')

    # ── By crypto ─────────────────────────────────────────────────────────────
    sub('By Crypto')
    for crypto, g in df.groupby('crypto'):
        w = g['would_win'].sum(); l = len(g) - w
        print(f'  {crypto:<6} {wr_str(w, l)}')

    # ── By market type ────────────────────────────────────────────────────────
    sub('By Market Type')
    df['mtype'] = df['candle_size'].apply(lambda s: '15m' if s >= 150 else '5m')
    for mt, g in df.groupby('mtype'):
        w = g['would_win'].sum(); l = len(g) - w
        print(f'  {mt:<6} {wr_str(w, l)}')

    # ── By candle size ────────────────────────────────────────────────────────
    sub('By Candle Size (CXX — fires at T+offset in cycle)')
    for cs, g in df.groupby('candle_size'):
        w = g['would_win'].sum(); l = len(g) - w
        offset = detection_offset_str(cs)
        span   = context_span_str(cs)
        print(f'  C{cs:<4} @T+{offset:<8} ctx={span:<20} {wr_str(w, l)}')

    # ── Spike magnitude of FP vs correct rejections ───────────────────────────
    sub('Spike magnitude: FP (would have WON) vs correct rejections')
    fp   = df[df['would_win'] == 1]['spike_pct'].dropna()
    ok   = df[df['would_win'] == 0]['spike_pct'].dropna()
    if len(fp) > 0 and len(ok) > 0:
        print(f'  {"":26} {"N":>5}  {"p25":>6}  {"median":>7}  {"p75":>6}  {"mean":>6}')
        for label, sub_df, color in [
            ('False positives (FP)', fp, YELLOW),
            ('Correct rejections  ', ok, DIM),
        ]:
            print(f'  {color}{label:<26} {len(sub_df):>5}  {sub_df.quantile(.25):>6.3f}  '
                  f'{sub_df.median():>7.3f}  {sub_df.quantile(.75):>6.3f}  {sub_df.mean():>6.3f}{RESET}')
        diff = fp.median() - ok.median()
        if abs(diff) < 0.04:
            print(f'\n  {YELLOW}→ Spike magnitudes are similar for FP and correct rejections.')
            print(f'    The threshold is not the problem — look at which filter triggered.{RESET}')
        elif diff < 0:
            print(f'\n  {GREEN}→ FP spikes are SMALLER: threshold may be slightly too low.{RESET}')
        else:
            print(f'\n  {RED}→ FP spikes are LARGER: the filter is blocking unusually strong signals.{RESET}')

    return df


def analyze_trades(trades):
    """Win rate slicing on executed trades."""
    section('EXECUTED TRADES — Win Rate Analysis')

    if not trades:
        print(f'\n  {YELLOW}No resolved trades found.{RESET}')
        return pd.DataFrame()

    df = pd.DataFrame(trades)
    df['is_win'] = (df['status'] == 'WIN').astype(int)
    W = df['is_win'].sum(); L = len(df) - W

    print(f'\n  Total resolved : {len(df)}   ({W} WIN, {L} LOSS)')
    print(f'  Overall WR     : {wr_str(W, L)}')

    # ── By crypto ─────────────────────────────────────────────────────────────
    sub('By Crypto')
    for crypto, g in df.groupby('crypto'):
        w = g['is_win'].sum(); l = len(g) - w
        print(f'  {crypto:<6} {wr_str(w, l)}')

    # ── By market type ────────────────────────────────────────────────────────
    sub('By Market Type (5m vs 15m)')
    df['mtype'] = df['candle_size'].apply(lambda s: '15m' if s >= 150 else '5m')
    for mt, g in df.groupby('mtype'):
        w = g['is_win'].sum(); l = len(g) - w
        print(f'  {mt:<6} {wr_str(w, l)}')

    # ── By direction ──────────────────────────────────────────────────────────
    sub('By Direction')
    for direction, g in df.groupby('direction'):
        w = g['is_win'].sum(); l = len(g) - w
        arrow = '▲ UP  ' if direction == 'UP' else '▼ DOWN'
        print(f'  {arrow} {wr_str(w, l)}')

    # ── By candle size ────────────────────────────────────────────────────────
    sub('By Candle Size (CXX — fires at T+offset in cycle)')
    for cs, g in df.groupby('candle_size'):
        w = g['is_win'].sum(); l = len(g) - w
        offset = detection_offset_str(cs)
        span   = context_span_str(cs)
        print(f'  C{cs:<4} @T+{offset:<8} ctx={span:<20} {wr_str(w, l)}')

    # ── By spike_pct bucket (quintiles) ──────────────────────────────────────
    sub('By Spike Magnitude (quintile buckets)')
    sp = df['spike_pct'].dropna()
    if len(sp) >= 20:
        df2 = df.dropna(subset=['spike_pct']).copy()
        try:
            df2['sp_bucket'] = pd.qcut(df2['spike_pct'], q=5, duplicates='drop')
            for bucket, g in df2.groupby('sp_bucket', observed=True):
                w = g['is_win'].sum(); l = len(g) - w
                print(f'  spike {str(bucket):<24} {wr_str(w, l)}')
        except Exception:
            pass
    else:
        print(f'  {DIM}(need ≥20 trades with spike_pct — have {len(sp)}){RESET}')

    # ── By entry price band ───────────────────────────────────────────────────
    sub('By Entry Price (cents)')
    df['entry_c'] = (df['entry_price'] * 100).round(0)
    bins   = [0,  10, 15, 20, 25, 30, 40, 50, 101]
    labels = ['≤10¢','11-15¢','16-20¢','21-25¢','26-30¢','31-40¢','41-50¢','>50¢']
    df['entry_band'] = pd.cut(df['entry_c'], bins=bins, labels=labels)
    for band, g in df.groupby('entry_band', observed=True):
        w = g['is_win'].sum(); l = len(g) - w
        if len(g) > 0:
            print(f'  {str(band):<10} {wr_str(w, l)}')

    # ── P&L distribution ──────────────────────────────────────────────────────
    sub('P&L Distribution')
    pnl = df['pnl_usd'].dropna().astype(float)
    if len(pnl) >= 5:
        pos = pnl[pnl > 0]; neg = pnl[pnl < 0]
        if len(pos) > 0:
            print(f'  WIN  P&L : mean=${pos.mean():.2f}  median=${pos.median():.2f}  '
                  f'min=${pos.min():.2f}  max=${pos.max():.2f}')
        if len(neg) > 0:
            print(f'  LOSS P&L : mean=${neg.mean():.2f}  median=${neg.median():.2f}  '
                  f'min=${neg.min():.2f}  max=${neg.max():.2f}')
        if len(pos) > 0 and len(neg) > 0:
            ev = pnl.mean()
            clr = GREEN if ev >= 0 else RED
            print(f'  {clr}EV/trade : ${ev:.2f}  ({len(pnl)} trades with resolved PNL){RESET}')

    return df


def analyze_comparison(rej_df, trades_df):
    """Cross-table spike_pct comparison across all 4 outcome groups."""
    section('SPIKE THRESHOLD COMPARISON — All Groups')
    print(f'{DIM}  Compares spike magnitude across: EXECUTED WIN, EXECUTED LOSS,{RESET}')
    print(f'{DIM}  REJECTED (false positive = would have WON), REJECTED (correct = would have LOST){RESET}')

    rows = []
    if not trades_df.empty:
        for _, r in trades_df.iterrows():
            sp = r.get('spike_pct')
            if sp is None: continue
            rows.append({'spike_pct': float(sp),
                         'group': 'EXEC_WIN' if r['status'] == 'WIN' else 'EXEC_LOSS'})

    if not rej_df.empty and 'would_win' in rej_df.columns:
        for _, r in rej_df.iterrows():
            sp = r.get('spike_pct')
            if sp is None: continue
            rows.append({'spike_pct': float(sp),
                         'group': 'REJ_FP' if r['would_win'] else 'REJ_OK'})

    if not rows:
        print(f'\n  {YELLOW}Not enough data.{RESET}')
        return

    df   = pd.DataFrame(rows)
    hdr  = f'  {"Group":<12} {"N":>5}  {"min":>6}  {"p25":>6}  {"median":>7}  {"p75":>6}  {"p90":>6}  {"mean":>6}'
    sep  = f'  {"─"*12} {"─"*5}  {"─"*6}  {"─"*6}  {"─"*7}  {"─"*6}  {"─"*6}  {"─"*6}'
    print(f'\n{hdr}\n{sep}')

    for grp, clr in [('EXEC_WIN', GREEN), ('EXEC_LOSS', RED),
                     ('REJ_FP', YELLOW), ('REJ_OK', DIM)]:
        sub_df = df[df['group'] == grp]['spike_pct']
        if len(sub_df) == 0: continue
        print(f'{clr}  {grp:<12} {len(sub_df):>5}  {sub_df.min():>6.3f}  '
              f'{sub_df.quantile(.25):>6.3f}  {sub_df.median():>7.3f}  '
              f'{sub_df.quantile(.75):>6.3f}  {sub_df.quantile(.90):>6.3f}  '
              f'{sub_df.mean():>6.3f}{RESET}')

    # Key insight
    for a, b, msg_fn in [
        ('REJ_FP', 'EXEC_WIN',
         lambda d: f'REJ_FP vs EXEC_WIN median diff = {d:+.3f}%'),
        ('EXEC_LOSS', 'EXEC_WIN',
         lambda d: f'EXEC_LOSS vs EXEC_WIN median diff = {d:+.3f}%'),
    ]:
        if a in df['group'].values and b in df['group'].values:
            da = df[df['group'] == a]['spike_pct'].median()
            db = df[df['group'] == b]['spike_pct'].median()
            diff = da - db
            clr = RED if abs(diff) < 0.03 else YELLOW
            print(f'\n  {clr}{msg_fn(diff)}{RESET}')


def analyze_sequence_features(rej_df, trades_df):
    """Feature comparison from context_candles (sparse right now)."""
    section('SEQUENCE FEATURES — context_candles Analysis')
    print(f'{DIM}  Each context window = 8 × CXX-second candles (OHLC in Binance USD prices).{RESET}')
    print(f'{DIM}  Context span: C50×8=400s, C85×8=680s, C150×8=1200s, C255×8=2040s{RESET}')
    print(f'{DIM}  Features are ratio-based (scale-free) so cross-candle-size comparison is valid.{RESET}')
    print(f'{DIM}  This section gains power as data accumulates (target: 50+ records per group).{RESET}')

    feature_rows = []

    if not rej_df.empty:
        for _, r in rej_df.iterrows():
            ctx = r.get('context_candles')
            if not ctx: continue
            cs = int(r.get('candle_size', 0))
            feats = extract_ctx_features(ctx if isinstance(ctx, list) else [], r['direction'], cs)
            if not feats: continue
            feature_rows.append({
                **feats,
                'source'      : 'rejected',
                'outcome'     : r.get('would_win'),
                'reason'      : r.get('reason', ''),
                'crypto'      : r.get('crypto', ''),
                'candle_size' : cs,
                'mtype'       : '15m' if cs >= 150 else '5m',
                'label'       : 'REJ_FP' if r.get('would_win') == 1 else 'REJ_OK',
            })

    if not trades_df.empty:
        for _, r in trades_df.iterrows():
            ctx = r.get('context_candles')
            if not ctx: continue
            cs = int(r.get('candle_size', 0))
            feats = extract_ctx_features(ctx if isinstance(ctx, list) else [], r['direction'], cs)
            if not feats: continue
            feature_rows.append({
                **feats,
                'source'      : 'trade',
                'outcome'     : 1 if r['status'] == 'WIN' else 0,
                'reason'      : r['status'],
                'crypto'      : r.get('crypto', ''),
                'candle_size' : cs,
                'mtype'       : '15m' if cs >= 150 else '5m',
                'label'       : 'EXEC_WIN' if r['status'] == 'WIN' else 'EXEC_LOSS',
            })

    print(f'\n  Records with context_candles: {len(feature_rows)}')
    if not feature_rows:
        print(f'  {YELLOW}None yet — will populate as new signals occur after deployment.{RESET}')
        return pd.DataFrame()

    df = pd.DataFrame(feature_rows)
    counts = df['label'].value_counts().to_dict()
    for lbl, n in counts.items():
        print(f'    {lbl:<14}: {n}')

    num_cols = ['entry_price', 'logit_entry', 'spike_body_ratio', 'spike_upper_wick',
                'spike_lower_wick', 'spike_range_exp', 'body_accel',
                'consec_same_dir', 'pre_trend_pct', 'vol_regime', 'ob_efficiency']
    available = [c for c in num_cols if c in df.columns and df[c].notna().sum() >= 3]

    groups_present = [g for g in ['EXEC_WIN', 'EXEC_LOSS', 'REJ_FP', 'REJ_OK']
                      if g in df['label'].values]
    if len(groups_present) >= 2 and available:
        sub('Feature means by outcome group')
        header = f'  {"Feature":<22}' + ''.join(f'{g:>13}' for g in groups_present)
        print(header)
        print(f'  {"─"*22}' + '─'*13*len(groups_present))
        for col in available:
            row_str = f'  {col:<22}'
            for g in groups_present:
                sub_df = df[df['label'] == g][col].dropna()
                if len(sub_df) >= 2:
                    row_str += f'{sub_df.mean():>13.4f}'
                else:
                    row_str += f'{"—":>13}'
            print(row_str)

        # Highlight biggest divergences between EXEC_WIN and EXEC_LOSS (if both present)
        if 'EXEC_WIN' in groups_present and 'EXEC_LOSS' in groups_present:
            sub('Largest WIN vs LOSS divergences (potential new filters)')
            diffs = []
            for col in available:
                w = df[df['label'] == 'EXEC_WIN'][col].dropna()
                l = df[df['label'] == 'EXEC_LOSS'][col].dropna()
                if len(w) >= 2 and len(l) >= 2:
                    # Normalised difference: (win_mean - loss_mean) / pooled_std
                    pooled_std = np.std(pd.concat([w, l]))
                    if pooled_std > 0:
                        diffs.append((col, w.mean(), l.mean(),
                                      (w.mean() - l.mean()) / pooled_std))
            diffs.sort(key=lambda x: abs(x[3]), reverse=True)
            for col, wm, lm, normd in diffs[:5]:
                clr = GREEN if normd > 0 else RED
                print(f'  {clr}{col:<22} WIN={wm:.4f}  LOSS={lm:.4f}  '
                      f'normalised_diff={normd:+.2f}{RESET}')
            if not diffs:
                print(f'  {DIM}(need more LOSS examples for meaningful comparison){RESET}')

    return df


def save_csvs(rej_df, trades_df, feat_df):
    os.makedirs(OUT_DIR, exist_ok=True)
    saved = []

    if not rej_df.empty:
        path = os.path.join(OUT_DIR, 'analysis_rejected.csv')
        keep = [c for c in ['crypto','candle_size','direction','spike_pct',
                             'yes_ask','no_ask','entry_price','threshold',
                             'reason','cycle_start_ms','outcome','would_win',
                             'created_at'] if c in rej_df.columns]
        rej_df[keep].to_csv(path, index=False)
        saved.append(path)

    if not trades_df.empty:
        path = os.path.join(OUT_DIR, 'analysis_trades.csv')
        keep = [c for c in ['trade_id','crypto','candle_size','direction',
                             'spike_pct','entry_price','position_usd',
                             'status','pnl_usd','trade_time'] if c in trades_df.columns]
        trades_df[keep].to_csv(path, index=False)
        saved.append(path)

    if not feat_df.empty:
        path = os.path.join(OUT_DIR, 'analysis_features.csv')
        feat_df.to_csv(path, index=False)
        saved.append(path)

    if saved:
        section('OUTPUT FILES')
        for p in saved:
            print(f'  {DIM}{p}{RESET}')


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f'\n{BOLD}{"═"*72}{RESET}')
    print(f'{BOLD}  Polychamp — Signal Analysis Report{RESET}')
    print(f'{BOLD}  Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}{RESET}')
    print(f'{BOLD}{"═"*72}{RESET}')

    env = read_env()

    print(f'\n{DIM}Loading pm_outcomes cache...{RESET}', end=' ', flush=True)
    pm = load_pm_outcomes()
    print(f'{len(pm)} entries')

    print(f'{DIM}Connecting to DB...{RESET}', end=' ', flush=True)
    conn = db_connect(env)
    rejected, trades = load_db(conn)
    conn.close()
    print(f'{len(rejected)} rejected signals, {len(trades)} resolved LIVE trades')

    rej_df    = analyze_rejected(rejected, pm)
    trades_df = analyze_trades(trades)
    analyze_comparison(rej_df, trades_df)
    feat_df   = analyze_sequence_features(rej_df, trades_df)
    save_csvs(rej_df, trades_df, feat_df if not isinstance(feat_df, pd.DataFrame) or not feat_df.empty
              else pd.DataFrame())

    section('NEXT MILESTONES')
    n_rej_known = len(rej_df) if not rej_df.empty and 'would_win' in rej_df.columns else 0
    n_ctx       = sum(1 for r in rejected if r.get('context_candles'))
    n_ctx_trade = sum(1 for t in trades   if t.get('context_candles'))

    print(f'  Rejected with known outcome     : {n_rej_known:>4}  (target: 50 per reason)')
    print(f'  Rejected with context_candles   : {n_ctx:>4}  (target: 100 for feature analysis)')
    print(f'  Trades with context_candles     : {n_ctx_trade:>4}  (target: 50 WIN + 20 LOSS)')
    print(f'\n  {DIM}Re-run weekly: python3 backend/scripts/analyze_signals.py{RESET}')
    print(f'  {DIM}Phase 3 (L1 logistic regression) unlocks at ~150 records with context_candles{RESET}')
    print()


if __name__ == '__main__':
    main()
