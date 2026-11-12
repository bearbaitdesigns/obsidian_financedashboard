# Finance Dashboard for Obsidian

Track net worth, credit score, spending, savings goals and retirement in a four-page dashboard inside Obsidian. Everything is stored locally in the plugin's `data.json` in your vault — nothing leaves your machine.

## Install

### With BRAT (recommended)

1. Install **BRAT** (Obsidian42 - BRAT) from **Settings → Community plugins → Browse**, and enable it.
2. Open **Settings → BRAT → Add beta plugin**.
3. Paste `bearbaitdesigns/obsidian_financedashboard` and click **Add plugin**.
4. Enable **Finance Dashboard** under **Settings → Community plugins**.

BRAT checks this repository for new releases and can update the plugin for you.

### Manually

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/bearbaitdesigns/obsidian_financedashboard/releases/latest).
2. In your vault, create the folder `.obsidian/plugins/finance-dashboard/` (show hidden files if you can't see `.obsidian`) and put the three files in it.
3. In Obsidian: **Settings → Community plugins** → turn off Restricted mode if needed → reload the list → enable **Finance Dashboard**.
4. Click the wallet icon in the left ribbon (or run **Finance Dashboard: Open dashboard** from the command palette).

## The pages

| Page | What it shows |
|---|---|
| **Overview** | Headline numbers from every page (net worth, credit score, month spending vs budget, retirement status), a 12-month net-worth chart, spending donut, savings-goal progress, retirement progress ring, an **Income** card with a **Net / Gross / Both** toggle, this month's **Notes**, and a "Things to look at" list (over-budget categories, goals behind pace, emergency-fund coverage, credit score moves). Click any card to jump to its page. |
| **Net Worth** | Net worth, assets, debts and 12-month change; net-worth trend (6M / 1Y / 3Y / All) with assets and debts; pie charts for **Investments** and **On-budget accounts** plus overall asset mix; **credit score trend** with Poor→Exceptional bands; full accounts table. |
| **Investments** *(can be hidden)* | Total invested, taxable vs retirement, this month's change and **12-month market growth with estimated return**; a growth chart for investment & retirement accounts (**Total / By group / By account**, 6M / 1Y / 3Y / All); **Balance vs money put in**; tax-treatment mix; **Where the change came from** (money put in vs market growth/loss each month); and an account performance table with 12-month trend lines, 1- and 12-month changes and estimated return. Plus **Past balances** and a **(?)** explainer. |
| **Spending & Savings** | Month picker and All / Debit / Credit filter; spending by category (split by debit vs credit, with budget ticks); category share donut; six-month trend; **savings goals** with progress, monthly amount needed, and behind-pace flags; transaction list. |
| **Retirement** | Retirement savings, target nest egg, **estimated retirement date/age**, and **on-track status**; your goals; projected growth vs target; allocation by account; tax-treatment mix (pre-tax / Roth / HSA); contributions by account (with the extra needed to hit your goal); balance history; **My retirement notes**; accounts table. Plus a **What if…** planner and a **(?)** explainer. |

## Hover for details

Every chart shows stats when you hover (or tap on mobile):

- **Line charts** (net worth, credit score, retirement projection and history): a crosshair snaps to the nearest point and lists each series plus month-over-month change, change since the start, debt-to-asset ratio, credit rating and points to the next band, or (for projections) % of target and the income that balance would support.
- **Pie/donut charts**: hover a slice *or* its legend row to highlight it — the center shows its value and share, and the tooltip adds rank, account type, transaction count, average and budget use.
- **Bar charts**: hover a category row for debit/credit split, share of spending, budget remaining or overspent, transaction count and last month's total.
- **Six-month columns**: debit vs credit, total, change vs the previous month, six-month average, budget gap and top category.
- **Progress ring and goal bars**: saved, target, remaining, monthly amount needed and pace.

## Net Worth: explainer, term definitions and how accounts are taxed

**(?) How your net worth is calculated.** Click the question-mark icon at the top right of the Net Worth page (or run **Net worth: How it’s calculated and how accounts are taxed**). It covers:
- **Each step with your own numbers:** assets by group, each debt, net worth, monthly snapshots and changes, debt-to-asset ratio, liquid assets, your emergency cushion (months of spending), and how the credit-score bands work.
- **How your accounts are taxed.** General U.S. federal rules, one card per kind of account, with yours listed on each card:
  - bank accounts & cash, taxable investments and crypto;
  - tax-deferred retirement, Roth and HSA accounts, and pensions;
  - your home & real estate, vehicles and personal property, and debts & interest.
  Each card says what the rules mean for your net worth and links to its IRS source.
- **Your estimated federal tax picture:** your bracket from this year’s brackets and standard deduction (choose single or married filing jointly), your likely long-term capital-gain rate, and an after-tax illustration for tax-deferred balances.
- **Things to keep in mind**, and **sources** with links. These are IRS tax topics and publications, the IRS limit and inflation-adjustment announcements, CFPB guides on credit scores and emergency funds, and myFICO's score ranges.

**Hover definitions** appear on the Net Worth page (and the Overview): net worth, assets, debts, 12-month change, snapshots, investments, cash, asset mix and credit score. Hover any **account type** in the accounts table, or in the account manager, to see how that account is taxed. Hover a **group** name for that group's tax summary.

**Adding an account.** Hover the (?) next to **Group** for definitions. Under **Account type**, a one-sentence summary of the selected type appears and updates as you change it. For example, *401(k): Employer retirement plan funded from your paycheck, usually before tax (up to $24,500 in 2026); withdrawals are taxed as income, generally with an extra 10% before 59½.*

## Tax rules: year, Refresh, and what they're used for

The plugin ships with **U.S. federal tax rules for 2026, gathered from IRS.gov on November 11, 2026**. The year and date appear wherever tax information is shown: the tax section of both (?) panels, the Retirement page's limits, the PDF, and Settings.

**What the tax rules are used for:**
- **Net Worth:** your estimated tax bracket and long-term capital-gain rate, the after-tax illustration, and all tax text.
- **Retirement:**
  - **Contribution-limit check:** shown on the *Annual contributions* card. It compares your IRAs (combined) and HSA against this year's limits, includes catch-ups based on your age, and shows how much room is left.
  - **Early-retirement warning:** shown if your target age is before 59½.
  - **Tax-rules section** in the (?) explainer: RMD age and early-withdrawal rules.
- **What-if:** warns when a scenario would put more into IRAs or an HSA than the limits allow. The warnings are also included in the PDF.

The net worth total, snapshots and the retirement projection itself are before tax and don't depend on these rules.

**Refresh tax rules.** The button is in both (?) panels and in Settings → Tax rules; there's also the command **Refresh tax rules from IRS.gov**. When you click it, the plugin:
1. Reads the IRS's [inflation-adjusted tax items by tax year](https://www.irs.gov/newsroom/inflation-adjusted-tax-items-by-tax-year) page to find the current year's announcements.
2. Reads those announcements and the relevant IRS pages:
   - contribution limits and catch-ups;
   - brackets and standard deduction;
   - RMD age;
   - home-sale exclusion;
   - capital-loss limit;
   - student-loan and car-loan interest deductions;
   - HSA limits.
3. Shows a pop-up with:
   - **what changed** (before → now);
   - **how it affects your dashboard** (bracket estimate, after-tax illustration, limits for you, What-if warnings, withdrawal ages), with changed items highlighted;
   - the status of every value: confirmed, updated, not confirmed (kept), or check manually;
   - any pages that couldn't be read;
   - a heads-up if next year's limits are already announced.
4. Applies the updates if you choose **Apply updates**, or leaves everything as it was with **Keep current values**.

Values it can't confirm (a page couldn't be read, or its wording changed) are kept, never guessed. Long-term capital-gain thresholds are only published in an IRS revenue procedure PDF, so they're marked *Check manually*. Every value can be edited in **Settings → Tax rules**, where you can also set your filing status or reset to the built-in values.

These are general U.S. federal rules for planning, not tax advice. State taxes and other countries differ.

## Retirement: explainer, term definitions, What-if planner and notes

> **These are predictions, not guarantees.** Every retirement figure is an estimate based on your inputs and steady average returns, in today's dollars. Real markets, taxes, fees and life changes will make actual results differ. It's for planning only, not financial advice. This notice appears on the Retirement page, the Overview's retirement card, the explainer, the What-if planner and every page of the PDF.

**(?) How it's calculated.** Click the question-mark icon at the top right of the Retirement page (or run **Retirement: How the projection is calculated**). The panel covers:
- **Each step of the math, with your own numbers:** target nest egg, real return, monthly growth, on-track check, estimated retirement, needed contribution, and how long the money lasts.
- **What could improve your outcome:** a table that changes one thing at a time and reruns your projection (save $100 or $500/mo more, retire 2 years later, spend 10% less, lower fees…). Each row has a **Try it** button that opens it in the What-if planner. General tips follow, such as the employer match, Social Security timing, fees and tax mix.
- **What the projection leaves out:** taxes, market swings, and so on.
- **Sources & further reading:** linked research and official pages behind each step. These include the Trinity study and Bengen's 4% research, Morningstar's withdrawal-rate research, the Fisher equation for real returns, historical returns (NYU Stern), CPI inflation data (BLS), Investor.gov material on compound interest, savings goals and fees, and Social Security estimates and delayed-retirement credits (SSA).

**Hover definitions.** Retirement terms with a dotted underline, or a small (?) icon, show a definition when you hover. Each includes how that term is used in your own plan (e.g. *Return / inflation → (1 + 7%) ÷ (1 + 2.5%) − 1 = 4.39% a year*). They appear on:
- the Retirement page's tiles, goals card and chart titles;
- the Overview's retirement card;
- the Edit goals form;
- the What-if planner.

**What if… planner.** Use the **What if…** button on the Retirement page (or **Retirement: What-if planner**) to test scenarios. It's a sandbox: nothing you enter changes your dashboard, accounts or predictions, and scenarios are saved so you can come back to them.
- **Create as many scenarios as you like.** Start blank, use a quick idea (e.g. "+$100/mo to Roth IRA", "Raise in 2 years", "Retire 2 years later", "Lower returns (5%)", "1-year career break"), or duplicate one.
- **Add changes**, each starting now, in N years, at an age, or on a date, with an optional end:
  - **Contribution change:** e.g. +$100/mo to your Roth IRA starting now, or +$300/mo to your 401(k) from age 42 to 55.
  - **Pay change:** a raise or new job (% or amount), plus the share of the change you'd save, into which account.
  - **One-time amount:** a bonus, inheritance or withdrawal.
  - **Pause contributions:** a career break.
  - **Market returns:** a different return for a period.
- **Change assumptions** for a scenario only: retirement age, desired income, Social Security/pension, withdrawal rate, expected return, inflation, and whether taxable investments count.
- **See the results against your current plan:** ready-to-retire age, projected balance, % funded and status, how long the money lasts, income it supports, and extra savings needed. There's also a chart of all scenarios (hide or show each with the eye icon) and a comparison table.
- **Save as PDF:** choose which scenarios to include. The PDF is saved to `Finance Dashboard/` in your vault and opens in a new tab. It contains the prediction disclaimer, your current plan, a comparison table and chart, each scenario's assumptions, changes, notes and results, how it's calculated, and clickable sources.

**My retirement notes.** A private notes box on the Retirement page for questions for an advisor, reminders and ideas. It saves automatically as you type, shows when it was last edited, and isn't used in any calculation.

## Income (guaranteed monthly, net and gross)

Income is treated as a **guaranteed amount per month**. It stays in effect until you record a change.

**Set up or update income:** use **Update income** on the Overview's Income card (or the command palette). Each change records:
- Effective date and what changed (starting income, raise, promotion, new job, cost-of-living adjustment, pay cut, hours change, other)
- Employer and job title
- Gross (before taxes and deductions) and net (take-home), entered **per month by default**. Switch **Amounts are** to *per year* or *per paycheck* (weekly, every two weeks, twice a month, monthly) if that's easier. What you've typed converts automatically, and everything is stored as monthly.
- For a raise, promotion, cost-of-living adjustment or pay cut, a **Raise or cut (%)** field fills in the new gross and net from your current pay.
- An optional note, which appears in that month's notes.

You can enter a change with a future date (e.g. a new job starting next month). It shows as **Upcoming** and takes effect on that date.

**The Overview Income card is static (no chart).** Its **Net / Gross / Both** toggle is remembered between sessions:
- **Net:** monthly take-home, per year, taxes and deductions per month, and how much is left after your average spending (with savings rate).
- **Gross:** monthly gross, per year, deductions per month and year, and take-home rate.
- **Both:** gross → net per month and per year, and the deduction rate.

Below the figures is the most recent change (e.g. "Raise on Jul 1: +$258/mo net (+3.8%)") and any upcoming one. The history icon opens **Income history**, where you can edit or delete any change. Bank CSV deposit rows (Income/Paycheck) are skipped on import, since income comes from your monthly amount.

## Notes

- **Transactions** and **income changes** have an optional note field.
- **Update balances** has a "What changed this time?" note, saved with today's date.
- You can also add a standalone note with **+ Note** (or the command **Add note**), for any date.

Notes appear in the month they belong to:

- **Overview:** this month's notes.
- **Spending & Savings:** a notes card for whichever month you're viewing, and a **Note** column in the transactions table.
- **Net Worth:** a notes card for one month at a time, with that month's net worth and change. It opens on the current month; use ◀ ▶ to step through months, or click a month on the net-worth chart. Dots on the chart's axis mark months with notes, and hovering a month shows them.

Click any note to edit it.

## Investments: growth, past balances and estimated return

- **Monthly account history.** Every time you update balances, each investment and retirement account's balance is saved for the month. Deleted accounts keep their history.
- **Past balances.** Use **Past balances** on the Investments page (or the Retirement history card, Settings, or the command *Investments: Add past balances*). Pick a month and type each account's balance from old statements; leave an account blank if you didn't have it yet. Changing the month loads what's already saved. You can also update that month's net-worth snapshot so the Net Worth and Retirement charts match. **Monthly history** lists every month so you can edit or delete one. Clicking a month on the growth chart opens it too.
- **Money put in vs market growth.** Money put in is estimated from each account's yearly contribution (÷ 12 per month), plus accounts that were opened or rolled in, minus accounts closed. Market growth is the rest: ending − starting − money put in. **Estimated return** uses the Modified Dietz method: growth ÷ (start + ½ × money put in). You can turn the contribution estimate off in Settings → Investments.
- **Hover** any chart, KPI, trend line or change cell for the numbers behind it; underlined terms explain themselves; the **(?)** explainer shows each step with your numbers, notes on TOD and rollover accounts, and sources (Modified Dietz, Investor.gov, FINRA, IRS).
- **Hide the tab** from the gear icon (**Dashboard pages → Investments tab**) or Settings → Investments if you don't want to track it. History keeps being saved, so nothing is lost if you turn it back on.
- **Account types:** *TOD Individual* (investment) — an individual brokerage account with a transfer-on-death beneficiary, taxed like any brokerage account — and *Rollover IRA* (retirement) — a traditional IRA holding money rolled over from an employer plan, taxed when withdrawn.

## Managing accounts (gear icon)

Click the **gear icon** at the top right of the dashboard (or **Manage** on the Net Worth page's Accounts card, or the command **Manage accounts & assets**) to open the account manager:

- See account count, assets, debts and net worth at a glance; search by name or type and filter by group.
- **Dashboard pages:** show or hide the **Investments** tab.
- **Edit balances and yearly contributions inline** — changes save when you press Enter or leave the field (invalid entries are outlined in red, saved ones flash green).
- **Edit** (pencil) to rename or change group/type; **Delete** (trash) with a confirmation. Past monthly snapshots are kept when you delete.
- **Add account** at the top, or the **+** beside a group heading to add one already set to that group.
- **Categories, currency & data** jumps to the plugin's settings.

## Adding accounts

Pick a **Group** first — the **Account type** list updates to match (e.g. Retirement → 401(k), Roth IRA, HSA…; Debt → Credit card, Mortgage, Student loan…). Choose *Other* to type your own. The yearly contribution field only appears for retirement and investment accounts, and the balance field becomes *Amount owed* for debts.

## How the numbers work

- **Snapshots:** every time balances change, the current month's assets/debts/net worth is saved. To backfill history, use the pencil icon on the Net worth trend card.
- **Account groups:** *On-budget* (checking, savings, cash), *Investment* (taxable), *Retirement*, *Property*, *Debt*. Debts are entered as positive amounts owed. Retirement accounts are grouped by type into tax-deferred, Roth, HSA and pension for the tax-treatment chart.
- **Retirement projection** (today's dollars): target nest egg = (desired income − Social Security/pension) ÷ withdrawal rate. Balances grow at (return − inflation) with each retirement account's yearly contribution added monthly. **On track** = projected balance at your target age ≥ target; **Slightly behind** = 85–99%; **Off track** = below 85%. Estimated retirement age is when the projection first reaches the target.
- Spending vs last month compares month-to-date against the same day last month.

## Importing transactions (CSV)

**Import CSV** accepts most bank exports. Recognized columns (header names are matched loosely): `date`, `description`, `amount`, `category`, `source` (debit/credit), `card`, `note`. Only `date` and `amount` are required. Dates can be `YYYY-MM-DD` or `MM/DD/YYYY`. Choose how amount signs work for your bank, and Income / Paycheck deposits, Transfer / Payment rows and exact duplicates are skipped. New categories are added automatically. See `sample-transactions.csv`.

## Link to the dashboard from a note

Put a clickable link in any note that opens the dashboard in a new tab. Run **Insert dashboard link in this note** from the command palette, or paste:

````
```finance-link
label: Finance dashboard
```
````

Optional lines (each one overrides the default from settings):

| Option | Example | What it does |
|---|---|---|
| `label` | `label: My money` | Text on the link |
| `tab` | `tab: spending` | Page to open: `overview`, `networth`, `investments`, `spending` or `retirement` |
| `size` | `size: large` | `tiny`, `small`, `medium`, `large`, `xl`, `xxl`, a multiplier (`1.5`), a percent (`150%`) or pixels (`22px`). The whole link scales together |
| `style` | `style: button` | `card` (picture, title, subtitle), `button` (compact pill) or `icon` (picture only) |
| `align` | `align: center` | `left`, `center` or `right` on its line |
| `float` | `float: right` | Sit beside the following text, which wraps around it (`left` or `right`) |
| `width` | `width: full` | Stretch the card across the note |
| `icon` | `icon: piggy-bank` | Any [Lucide](https://lucide.dev) icon name |
| `image` | `image: [[Attachments/money.png]]` | A picture from your vault (path or wikilink) or an image URL |
| `subtitle` | `subtitle: Check my budget` | Second line on the card style |

### Inline links (anywhere in a sentence)

To put the link *inside* text (a sentence, list item, callout or table cell), use inline code. Run **Insert inline dashboard link (inside a sentence)** from the command palette, or type:

```
Before paying bills, check my `finance-link: label=budget; tab=spending` first.
```

Options use `key=value` separated by `;` (or `|`), and are the same as above. `size` works too, and inline links default to the compact button that matches the surrounding text. Plain `` `finance-link` `` uses your defaults, and `` `finance-link: My money` `` sets just the label.

Inline links render in Reading view and in Live Preview. In Live Preview, put your cursor on the link's text to edit its code.

**Default icon and picture.** The default is a wallet icon. To change it for every link, go to **Settings → Finance Dashboard → Dashboard link**. There you can:
- Set a different icon name and the default size and style.
- **Choose…** a picture already in your vault.
- **Upload…** one from your computer (saved to `Finance Dashboard/link-picture.*` in your vault).
- Paste a path or URL.

The preview at the top updates as you go, and links already in your notes update too. If a picture can't be found, the link falls back to the icon.

**New tab behavior.** Clicking opens the dashboard in a new tab. If it's already open, the link switches to that tab instead; turn on **Always open a new tab** if you'd rather get a fresh tab every time.

**Plain Markdown links.** These also work: `[Finances](obsidian://finance-dashboard)` or `[Budget](obsidian://finance-dashboard?tab=spending)`.

## Embed a page in a note

````
```finance-dashboard
tab: overview
```
````

`tab` can be `overview`, `networth`, `investments`, `spending` or `retirement`.

## Commands

Open dashboard (or a specific page) · Add transaction · Update income (raise, promotion or new job) · Income history · Add note · Insert dashboard link in this note · Retirement: What-if planner · Retirement: How the projection is calculated · Net worth: How it’s calculated and how accounts are taxed · Refresh tax rules from IRS.gov · Insert inline dashboard link · Update account balances · Add credit score · Add account · Add savings goal · Import transactions from CSV.

## Settings

Currency (e.g. USD, EUR, ISK) and number locale; spending categories with monthly budgets; export a JSON backup + transactions CSV into your vault; load sample data; reset.

*Projections are estimates for planning, not financial advice.*
