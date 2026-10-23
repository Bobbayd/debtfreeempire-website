"""Independent cross-check of _drafts/blog-calcs.py.

Deliberately written a different way: exact Decimal/Fraction arithmetic, closed-form amortization for single
debts, and a fixed-length-month schedule for multi-debt rollover. If both programs agree, the result does not
depend on one implementation's bookkeeping.

Run: python3 _drafts/blog-calcs-verify.py
"""
from fractions import Fraction as F
import math, importlib.util, sys, os

spec = importlib.util.spec_from_file_location('calcs', os.path.join(os.path.dirname(__file__), 'blog-calcs.py'))
calcs = importlib.util.module_from_spec(spec); spec.loader.exec_module(calcs)

fails = []
def check(name, mine, theirs, tol=0):
    ok = abs(mine - theirs) <= tol
    print(f"  {'OK  ' if ok else 'FAIL'} {name}: independent={mine} script={theirs}")
    if not ok: fails.append(name)

# ---- 1. single debt, fixed payment: closed form ----
def closed_form(balance, apr, pay):
    r = apr / 12
    if r == 0:
        n = math.ceil(balance / pay); return n, 0
    n = -math.log(1 - balance * r / pay) / math.log(1 + r)
    n_int = math.ceil(n - 1e-9)
    # exact interest = total paid - principal, last payment is partial
    b = F(balance); rr = F(apr) / 12; paid = F(0)
    for _ in range(n_int):
        b = b * (1 + rr); p = min(b, F(pay)); b -= p; paid += p
    return n_int, round(float(paid - balance))
print('Single-debt closed form vs script')
for bal, apr, pay in [(5000,.22,150),(5000,.22,200),(5000,.22,250),(5000,.12,150),(5000,0,150),(6000,.24,200),(6000,.24,250),(6000,.24,300),(5000,.22,350),(5000,.22,600)]:
    m, i = closed_form(bal, apr, pay); m2, i2 = calcs.flat(bal, apr, pay)
    check(f'{bal} @{apr:.0%} ${pay}/mo months', m, m2); check(f'{bal} @{apr:.0%} ${pay}/mo interest', i, i2, tol=1)

# ---- 2. minimum-only (interest + 1% of balance, $25 floor) ----
def min_only(balance, apr):
    b = F(balance); r = F(apr) / 12; n = 0; paid = F(0)
    while b > F(1, 200) and n < 2000:
        n += 1; i = b * r; b += i
        p = min(b, max(F(25), i + b * F(1, 100))); b -= p; paid += p
    return n, round(float(paid - balance))
print('Minimum-only (interest + 1% of balance)')
m, i = min_only(5000, .22); m2, i2 = calcs.min_formula(5000, .22)
check('months', m, m2); check('interest', i, i2, tol=1)
print(f'  -> {m/12:.1f} years, ~${i:,} interest (post says ~19 years, ~$8,000)')

# ---- 3. multi-debt rollover, independent schedule ----
def rollover(debts, total, order):
    """debts: list of (name, balance, apr, minimum). Independent bookkeeping: pay minimums, then waterfall extra."""
    bal = {n: F(b) for n, b, a, m in debts}; apr = {n: F(a) for n, b, a, m in debts}; mn = {n: F(m) for n, b, a, m in debts}
    months = 0; interest = F(0); closed = {}
    while any(v > F(1, 200) for v in bal.values()):
        months += 1
        for n in bal:
            if bal[n] > 0:
                i = bal[n] * apr[n] / 12; bal[n] += i; interest += i
        pool = F(total)
        for n in bal:                                   # minimums first
            pay = min(bal[n], mn[n]); bal[n] -= pay; pool -= pay
        for n in order:                                 # waterfall the rest
            pay = min(bal[n], pool); bal[n] -= pay; pool -= pay
        for n in bal:
            if bal[n] <= F(1, 200) and n not in closed: closed[n] = months
    return months, round(float(interest)), closed
def compare(label, debts, total, order):
    d = {n: (b, a, m) for n, b, a, m in debts}
    mine = rollover(debts, total, order); theirs = calcs.pay_down(d, total, order)
    check(label + ' months', mine[0], theirs[0]); check(label + ' interest', mine[1], theirs[1], tol=1)
    if mine[2] != theirs[2]: print('   closed-month mismatch', mine[2], theirs[2]); fails.append(label + ' closed')
print('Multi-debt rollover')
four = [('A',4000,.2499,100),('B',2500,.1999,75),('C',1800,.2699,60),('D',1100,.1599,40)]
compare('four-card avalanche', four, 400, list('CABD')); compare('four-card snowball', four, 400, list('DCBA')); compare('four-card hybrid', four, 400, list('DCAB'))
three = [('Store',800,.15,30),('Visa',2400,.22,65),('MC',5000,.26,125)]
compare('three-card snowball', three, 500, ['Store','Visa','MC']); compare('three-card avalanche', three, 500, ['MC','Visa','Store']); compare('three-card minimums', three, 220, [])
two = [('A',500,.19,25),('B',3000,.24,75)]
compare('two-card snowball', two, 300, ['A','B']); compare('two-card avalanche', two, 300, ['B','A'])
d18 = [('student',5000,.05,55),('cards',10000,.22,250),('car',3000,.07,95)]
compare('$18k avalanche', d18, 1000, ['cards','car','student']); compare('$18k snowball', d18, 1000, ['car','student','cards'])
d20 = [('cards',12000,.22,300),('student',5000,.05,55),('irs',3000,.08,100)]
compare('$20k irs-first', d20, 1055, ['irs','cards','student']); compare('$20k cards-first', d20, 1055, ['cards','irs','student'])

# ---- 4. arithmetic claims quoted in posts ----
print('Arithmetic quoted in posts')
check('$20k in 12 months @15% payment', round(20000 * (.15/12) / (1 - (1 + .15/12) ** -12)), 1805, tol=1)
check('$20k in 12 months @0% payment', round(20000 / 12), 1667, tol=1)
check('goal: $50/week per month', round(50 * 52 / 12), 217); check('goal: $50/week per twice-monthly paycheck', round(50 * 52 / 24), 108)
check('subscriptions per year (15.49+11.99+35)*12', round((15.49 + 11.99 + 35) * 12, 2), 749.76, tol=0.005)
check('paycheck 1 total', 900 + 50 + 250 + 100 + 100, 1400); check('paycheck 15th total', 60 + 90 + 120 + 350 + 75 + 250 + 100 + 50 + 305, 1400)
check('envelopes total', 200 + 80 + 60 + 60 + 100, 500)
check('$5k @24% annual interest', 5000 * .24, 1200); check('$18k @5% annual interest', 18000 * .05, 900)
check('sample week: 5 showed up of 6 active days, percent', round(5 / 6 * 100), 83)

# ---- 5. sensitivity: does the timing assumption change conclusions? ----
print('Sensitivity: pay first, accrue interest after (instead of accrue then pay)')
def pay_then_accrue(debts, total, order):
    bal = {n: F(b) for n, b, a, m in debts}; apr = {n: F(a) for n, b, a, m in debts}; mn = {n: F(m) for n, b, a, m in debts}
    months = 0; interest = F(0)
    while any(v > F(1, 200) for v in bal.values()) and months < 400:
        months += 1; pool = F(total)
        for n in bal:
            pay = min(bal[n], mn[n]); bal[n] -= pay; pool -= pay
        for n in order:
            pay = min(bal[n], pool); bal[n] -= pay; pool -= pay
        for n in bal:
            if bal[n] > 0: i = bal[n] * apr[n] / 12; bal[n] += i; interest += i
    return months, round(float(interest))
for label, debts, total, order in [('four-card avalanche', four, 400, list('CABD')), ('four-card snowball', four, 400, list('DCBA')), ('three-card snowball', three, 500, ['Store','Visa','MC']), ('three-card avalanche', three, 500, ['MC','Visa','Store'])]:
    a = rollover(debts, total, order)[:2]; b = pay_then_accrue(debts, total, order)
    print(f'  {label}: accrue-then-pay {a} | pay-then-accrue {b}')

print('\nRESULT:', 'ALL CHECKS PASSED' if not fails else f'{len(fails)} FAILURES: {fails}')
sys.exit(1 if fails else 0)
