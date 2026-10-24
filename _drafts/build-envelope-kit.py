# Builds assets/printables/cash-envelope-budget-kit.pdf (US Letter, 5 pages). Run: python3 _drafts/build-envelope-kit.py
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
F = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Sans', F + 'Arial.ttf'))
pdfmetrics.registerFont(TTFont('Sans-B', F + 'Arial Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif-B', F + 'Georgia Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif-I', F + 'Georgia Italic.ttf'))
pdfmetrics.registerFont(TTFont('Serif', F + 'Georgia.ttf'))

INK = HexColor('#1A1A1A'); MUTED = HexColor('#55515B'); GOLD = HexColor('#C89B45'); GOLD_L = HexColor('#E4C590')
CREAM = HexColor('#FAF7F2'); CARD = HexColor('#FFFDF9'); LINE = HexColor('#D9CDB8'); SOFT = HexColor('#F3EBDD'); GOLD_D = HexColor('#8E6F3E')
W, H = 612, 792; M = 44
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'printables', 'cash-envelope-budget-kit.pdf')
c = canvas.Canvas(OUT, pagesize=(W, H))
c.setTitle('Cash Envelope Budget Kit'); c.setAuthor('Debt Free Empire'); c.setSubject('A free printable for cash envelope budgeting')
TOTAL = 5

def base(page, title, sub=None):
    c.setFillColor(CREAM); c.rect(0, 0, W, H, stroke=0, fill=1)
    c.setFillColor(GOLD); c.rect(0, H - 8, W, 8, stroke=0, fill=1)
    c.setFillColor(INK); c.setFont('Sans-B', 12); c.drawString(M, H - 40, 'DEBT FREE')
    c.setFillColor(GOLD_D); c.setFont('Serif-I', 15); c.drawString(M + c.stringWidth('DEBT FREE', 'Sans-B', 12) + 6, H - 40.5, 'Empire')
    c.setFillColor(MUTED); c.setFont('Sans-B', 8); c.drawRightString(W - M, H - 38, 'CASH ENVELOPE BUDGET KIT')
    c.setStrokeColor(GOLD_L); c.setLineWidth(1.2); c.line(M, H - 52, W - M, H - 52)
    if title:
        c.setFillColor(INK); c.setFont('Serif-B', 26); c.drawString(M, H - 88, title)
        if sub:
            c.setFillColor(MUTED); c.setFont('Sans', 10.5); c.drawString(M, H - 106, sub)
    # footer
    c.setStrokeColor(LINE); c.setLineWidth(0.6); c.line(M, 46, W - M, 46)
    c.setFillColor(MUTED); c.setFont('Sans', 8)
    c.drawString(M, 32, 'debtfreeempire.com   |   Free to print and share with people you care about.')
    c.drawRightString(W - M, 32, 'Page %d of %d' % (page, TOTAL))
    c.setFont('Sans', 6.8); c.drawString(M, 21, 'For education only. Not financial, tax or legal advice.')

def field(x, y, w, label, prefix=None):
    c.setStrokeColor(MUTED); c.setLineWidth(0.7); c.line(x, y, x + w, y)
    c.setFillColor(MUTED); c.setFont('Sans-B', 7.2); c.drawString(x, y - 10, label.upper())
    if prefix: c.setFillColor(INK); c.setFont('Sans', 11); c.drawString(x, y + 3, prefix)

def card(x, y, w, h, fill=CARD):
    c.setFillColor(fill); c.setStrokeColor(LINE); c.setLineWidth(0.8); c.roundRect(x, y, w, h, 9, stroke=1, fill=1)

def table(x, y_top, cols, rows, row_h, header, head_fill=SOFT, font=8):
    """cols = [(label, width)], draws header + `rows` empty ruled rows. Returns y of table bottom."""
    w = sum(cw for _, cw in cols)
    c.setFillColor(head_fill); c.setStrokeColor(LINE); c.setLineWidth(0.7)
    c.roundRect(x, y_top - header, w, header, 4, stroke=0, fill=1)
    cx = x
    c.setFillColor(GOLD_D); c.setFont('Sans-B', font)
    for label, cw in cols:
        c.drawString(cx + 6, y_top - header + 6.5, label.upper()); cx += cw
    y = y_top - header
    c.setStrokeColor(LINE); c.setLineWidth(0.6)
    for _ in range(rows):
        y -= row_h; c.line(x, y, x + w, y)
    cx = x
    for _, cw in cols[:-1]:
        cx += cw; c.line(cx, y_top - header, cx, y)
    c.line(x, y_top - header, x, y); c.line(x + w, y_top - header, x + w, y)
    return y

# ---------------- Page 1: how it works ----------------
base(1, None)
c.setFillColor(GOLD_D); c.setFont('Sans-B', 9); c.drawString(M, H - 96, 'FREE PRINTABLE')
c.setFillColor(INK); c.setFont('Serif-B', 34); c.drawString(M, H - 134, 'Cash Envelope')
c.drawString(M, H - 172, 'Budget Kit')
c.setFillColor(MUTED); c.setFont('Serif-I', 14); c.drawString(M, H - 198, 'A calm way to give every dollar a job.')
c.setFillColor(INK); c.setFont('Sans', 10.5)
txt = ['Split each paycheck into labeled envelopes, one per spending category,',
       'and spend only what is inside. When an envelope is empty, that category',
       'is done until your next payday. No app and no bank connection needed.']
y = H - 228
for ln in txt: c.drawString(M, y, ln); y -= 15
# how it works cards
steps = [('1', 'Plan your payday', 'Use page 2. List your bills, debt payments and savings first, then give what is left to 4 to 6 envelopes.'),
         ('2', 'Fill the envelopes', 'Put the cash in each envelope, or set the amount aside in a digital envelope. Write the starting amount on each tracker sheet.'),
         ('3', 'Spend, then subtract', 'Log every purchase the day you make it on pages 3 and 4. The balance left is always the truth.'),
         ('4', 'Close the month', 'Use page 5 to review. Roll leftover cash forward for irregular costs, or send it to your debt.')]
cw = (W - 2 * M - 14) / 2; ch = 98; top = H - 292
for i, (n, t, d) in enumerate(steps):
    x = M + (i % 2) * (cw + 14); yy = top - (i // 2) * (ch + 14) - ch
    card(x, yy, cw, ch)
    c.setFillColor(GOLD); c.circle(x + 24, yy + ch - 26, 12, stroke=0, fill=1)
    c.setFillColor(white); c.setFont('Sans-B', 12); c.drawCentredString(x + 24, yy + ch - 30, n)
    c.setFillColor(INK); c.setFont('Serif-B', 13); c.drawString(x + 44, yy + ch - 30, t)
    c.setFillColor(MUTED); c.setFont('Sans', 9)
    words = d.split(); line = ''; ly = yy + ch - 50
    for wd in words:
        trial = (line + ' ' + wd).strip()
        if c.stringWidth(trial, 'Sans', 9) > cw - 34: c.drawString(x + 18, ly, line); ly -= 12.5; line = wd
        else: line = trial
    c.drawString(x + 18, ly, line)
# example + tips
ey = top - 2 * (ch + 14) - 8
card(M, ey - 128, W - 2 * M, 128, fill=SOFT)
c.setFillColor(GOLD_D); c.setFont('Sans-B', 8.5); c.drawString(M + 16, ey - 22, 'EXAMPLE: A $1,150 SPENDING BUDGET FOR THE MONTH')
c.setFillColor(INK); c.setFont('Sans', 9.5)
ex = [('Groceries', '$500'), ('Dining', '$200'), ('Gas', '$150'), ('Fun', '$300')]
for i, (k, v) in enumerate(ex):
    x = M + 16 + i * 122
    c.setFillColor(CARD); c.setStrokeColor(GOLD_L); c.roundRect(x, ey - 70, 108, 34, 6, stroke=1, fill=1)
    c.setFillColor(MUTED); c.setFont('Sans-B', 7.5); c.drawString(x + 10, ey - 51, k.upper())
    c.setFillColor(INK); c.setFont('Serif-B', 14); c.drawRightString(x + 98, ey - 52, v)
c.setFillColor(INK); c.setFont('Sans', 9)
c.drawString(M + 16, ey - 90, 'Fixed bills like rent, utilities and subscriptions stay in your bank account. Envelopes are for')
c.drawString(M + 16, ey - 103, 'spending that changes: groceries, gas, dining and fun. If one runs dry, move money from another')
c.drawString(M + 16, ey - 116, 'envelope and write it down, or stop spending there. Never pull from savings or a credit card.')
c.setFillColor(MUTED); c.setFont('Sans', 8.5)
c.drawString(M, 66, 'Want the full worked month with every dollar? Read it free:  debtfreeempire.com/resources/blog/cash-envelope-budgeting-real-math')
c.showPage()

# ---------------- Page 2: payday plan ----------------
base(2, 'Payday plan', 'Fill this in before you pull any cash. Every dollar of your paycheck gets a job.')
y = H - 140
field(M, y, 190, 'Pay date'); field(M + 215, y, 160, 'Take-home pay', '$'); field(M + 400, y, 124, 'Pay period')
y -= 40
# fixed bills
c.setFillColor(INK); c.setFont('Serif-B', 13); c.drawString(M, y, 'A. Fixed bills and debt payments'); y -= 8
y = table(M, y, [('Bill or debt', 290), ('Due', 90), ('Amount', 144)], 7, 19, 19)
c.setFillColor(MUTED); c.setFont('Sans-B', 8); c.drawRightString(W - M - 8, y - 14, 'TOTAL A   $ ________'); y -= 32
# savings
c.setFillColor(INK); c.setFont('Serif-B', 13); c.drawString(M, y, 'B. Savings and extra debt payment'); y -= 8
y = table(M, y, [('Goal', 380), ('Amount', 144)], 2, 19, 19)
c.setFillColor(MUTED); c.setFont('Sans-B', 8); c.drawRightString(W - M - 8, y - 14, 'TOTAL B   $ ________'); y -= 32
# envelopes
c.setFillColor(INK); c.setFont('Serif-B', 13); c.drawString(M, y, 'C. Envelopes (spending that changes)'); y -= 8
y = table(M, y, [('Envelope', 380), ('Amount', 144)], 6, 19, 19)
c.setFillColor(MUTED); c.setFont('Sans-B', 8); c.drawRightString(W - M - 8, y - 14, 'TOTAL C   $ ________'); y -= 26
# check box
card(M, y - 52, W - 2 * M, 52, fill=SOFT)
c.setFillColor(GOLD_D); c.setFont('Sans-B', 8.5); c.drawString(M + 16, y - 20, 'THE ZERO CHECK')
c.setFillColor(INK); c.setFont('Sans', 10)
c.drawString(M + 16, y - 38, 'Take-home pay  -  A  -  B  -  C  =  $ ____________   (aim for $0. If it is negative, trim an envelope.)')
c.showPage()

# ---------------- Pages 3 and 4: envelope tracker ----------------
for p in (3, 4):
    base(p, 'Envelope tracker', 'One sheet per envelope. Print as many copies as you need.')
    y = H - 142
    field(M, y, 230, 'Envelope (category)'); field(M + 255, y, 120, 'Starting balance', '$'); field(M + 400, y, 124, 'Funded from paycheck dated')
    y -= 40
    bottom = table(M, y, [('Date', 62), ('What it was for', 270), ('Amount', 96), ('Balance left', 96)], 20, 22, 20)
    card(M, bottom - 56, W - 2 * M, 44, fill=SOFT)
    c.setFillColor(INK); c.setFont('Sans', 10)
    c.drawString(M + 14, bottom - 31, 'Left at the end of the pay period:  $ __________')
    c.drawString(M + 290, bottom - 31, 'Roll over     /     Sweep to debt     (circle one)')
    c.setFillColor(MUTED); c.setFont('Sans', 8); c.drawString(M, bottom - 72, 'Once a week, compare your sheets with your bank balance. If they drift apart, a purchase went unrecorded.')
    c.showPage()

# ---------------- Page 5: month-end review ----------------
base(5, 'Month-end review', 'Take 10 minutes when the pay period closes. What happened, and what will you change?')
y = H - 132
y = table(M, y, [('Envelope', 150), ('Started with', 90), ('Spent', 90), ('Left', 70), ('Roll over', 62), ('To debt', 62)], 7, 24, 22)
c.setFillColor(MUTED); c.setFont('Sans-B', 8); c.drawRightString(W - M - 8, y - 14, 'TOTAL LEFT   $ ________'); y -= 44
for title, n in (('What went well this month', 3), ('Where did an envelope run dry, and why?', 3), ('What I will change next payday', 3)):
    c.setFillColor(INK); c.setFont('Serif-B', 12.5); c.drawString(M, y, title); y -= 6
    c.setStrokeColor(LINE); c.setLineWidth(0.7)
    for _ in range(n): y -= 22; c.line(M, y, W - M, y)
    y -= 26
card(M, y - 62, W - 2 * M, 62, fill=SOFT)
c.setFillColor(GOLD_D); c.setFont('Sans-B', 8.5); c.drawString(M + 16, y - 20, 'A RULE OF THUMB')
c.setFillColor(INK); c.setFont('Sans', 9.3)
c.drawString(M + 16, y - 36, 'Roll over for irregular costs (gifts, car repairs, vet bills). Sweep leftovers from steady categories like groceries')
c.drawString(M + 16, y - 49, 'to your debt, and trim that envelope next month so it matches what you really spend.')
c.showPage()
c.save()
print('wrote', os.path.abspath(OUT), os.path.getsize(OUT) // 1024, 'KB')
