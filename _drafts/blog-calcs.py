"""Verification script for every worked example in the Debt Free Empire blog.

ASSUMPTIONS (apply to all simulations below)
- Interest: each month, balance * APR / 12 is added BEFORE that month's payment.
- Payments: every debt receives its minimum; the rest of the fixed monthly total goes to the target debt.
- Rollover: the monthly TOTAL stays constant. When a debt closes, its minimum rolls to the next target.
- No new charges, fees, or promotional rates unless stated. Months are counted until all balances reach zero.
- "Minimum payment" is stated per example. When a formula is needed we use: interest + 1% of balance, $25 floor.
Run: python3 _drafts/blog-calcs.py
"""
import math

def pay_down(debts, total, order):
    """debts: {name: (balance, apr, minimum)}. order: list of names, target priority. Returns months, interest, closed-month dict."""
    bal = {k: v[0] for k, v in debts.items()}
    m = 0; interest = 0.0; closed = {}
    while any(x > 0.005 for x in bal.values()) and m < 1200:
        m += 1
        for k in bal:
            if bal[k] > 0:
                i = bal[k] * debts[k][1] / 12; bal[k] += i; interest += i
        pool = total
        for k in bal:
            if bal[k] > 0:
                p = min(bal[k], debts[k][2]); bal[k] -= p; pool -= p
        for k in order:
            if bal[k] > 0 and pool > 0:
                p = min(bal[k], pool); bal[k] -= p; pool -= p
        for k in bal:
            if bal[k] <= 0.005 and k not in closed: closed[k] = m
    return m, round(interest), closed

def flat(balance, apr, pay):
    """Single debt, fixed payment. Returns months, interest."""
    return pay_down({'d': (balance, apr, pay)}, pay, ['d'])[:2]

def min_formula(balance, apr, pct=0.01, floor=25):
    """Single card, payment = interest + pct*balance (floor). Returns months, interest."""
    b = balance; m = 0; t = 0.0
    while b > 0.005 and m < 2000:
        m += 1; i = b * apr / 12; b += i; t += i
        p = min(b, max(floor, i + pct * b)); b -= p
    return m, round(t)

def min_pct(balance, apr, pct=0.02, floor=25):
    b = balance; m = 0; t = 0.0
    while b > 0.005 and m < 2000:
        m += 1; i = b * apr / 12; b += i; t += i
        p = min(b, max(floor, pct * b)); b -= p
    return m, round(t)

if __name__ == '__main__':
    print('== Credit-card speed post: $5,000 balance ==')
    for apr, pay in [(.22, 150), (.22, 200), (.22, 250), (.12, 150), (.0, 150)]:
        m, i = flat(5000, apr, pay); print(f'  {apr:.0%} APR, ${pay}/mo -> {m} months ({m/12:.1f} yrs), interest ${i}')
    m, i = min_formula(5000, .22); print(f'  minimum = interest + 1% of balance (floor $25), 22% -> {m} months ({m/12:.1f} yrs), interest ${i}')
    m, i = min_pct(5000, .22); print(f'  minimum = 2% of balance (floor $25), 22% -> {m} months ({m/12:.1f} yrs), interest ${i}')
    print('== $6,000 at 24% ==')
    for pay in (200, 250, 300):
        m, i = flat(6000, .24, pay); print(f'  ${pay}/mo -> {m} months, interest ${i}')
    print('  principal share of a $300 payment, first month:', 300 - 6000 * .24 / 12)
    print('== Four-card example, $400/mo ==')
    cards = {'A': (4000, .2499, 100), 'B': (2500, .1999, 75), 'C': (1800, .2699, 60), 'D': (1100, .1599, 40)}
    for n, o in [('avalanche', 'CABD'), ('snowball', 'DCBA'), ('hybrid', 'DCAB')]:
        print(' ', n, pay_down(cards, 400, list(o)))
    print('== Snowball sample, $500/mo ==')
    c3 = {'Store': (800, .15, 30), 'Visa': (2400, .22, 65), 'MC': (5000, .26, 125)}
    print('  snowball', pay_down(c3, 500, ['Store', 'Visa', 'MC']))
    print('  avalanche', pay_down(c3, 500, ['MC', 'Visa', 'Store']))
    print('  minimums only', pay_down(c3, 220, []))
    print('== Paycheck post: two cards, $200 extra ==')
    # Card A $500 @19% min $25 ; Card B $3,000 @24% min $75 ; total $300/mo
    c2 = {'A': (500, .19, 25), 'B': (3000, .24, 75)}
    print('  snowball (A first)', pay_down(c2, 300, ['A', 'B']))
    print('  avalanche (B first)', pay_down(c2, 300, ['B', 'A']))
    print('== Paycheck post: buffer timelines (target = one month of essentials) ==')
    for target in (1500, 2000, 2500):
        for per_month in (100, 200, 300, 400):
            print(f'  target ${target}, ${per_month}/mo -> {math.ceil(target / per_month)} months')

def student_examples():
    print('== Student-debt post ==')
    # $5k card at 22%, minimum $100
    for extra in (100, 250, 500):
        m, i = flat(5000, .22, 100 + extra); print(f'  $5k @22%, $100 min + ${extra} extra (=${100+extra}/mo) -> {m} months, interest ${i}')
    # $18k: student $5k@5% min $55; cards $10k@22% min $250; car $3k@7% min $95; $600 extra
    d18 = {'student': (5000, .05, 55), 'cards': (10000, .22, 250), 'car': (3000, .07, 95)}
    tot = 55 + 250 + 95 + 600
    print(f'  $18k total monthly payment ${tot}')
    print('   avalanche (cards, car, student)', pay_down(d18, tot, ['cards', 'car', 'student']))
    print('   snowball  (car, student, cards)', pay_down(d18, tot, ['car', 'student', 'cards']))
    # annual interest comparison used in the matrix section
    print('  $5k @24% annual interest', 5000 * .24, ' | $18k @5% annual interest', 18000 * .05)
    # $20k in a year
    for apr in (0, .15):
        r = apr / 12; pmt = 20000 / 12 if r == 0 else 20000 * r / (1 - (1 + r) ** -12)
        print(f'  payment to clear $20k in 12 months at {apr:.0%} APR: ${pmt:.0f}')
    # $20k mixed: cards $12k@22% min $300, student $5k@5% min $55, IRS $3k@8% min $100, $600 extra
    d20 = {'cards': (12000, .22, 300), 'student': (5000, .05, 55), 'irs': (3000, .08, 100)}
    tot = 300 + 55 + 100 + 600
    print(f'  $20k total monthly payment ${tot}')
    print('   irs-first then cards then student', pay_down(d20, tot, ['irs', 'cards', 'student']))
    print('   cards-first (avalanche by rate)', pay_down(d20, tot, ['cards', 'irs', 'student']))

if __name__ == '__main__':
    student_examples()
