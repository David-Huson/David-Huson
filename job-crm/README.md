# Job CRM

Local-first CRM for a job search: pipeline board, contacts, follow-ups, a fit score that learns from your
rejections and advancements, and a Chrome extension that clips postings from any job page.

No dependencies, no accounts, no cloud. Data lives in `data/crm.db` (SQLite) on your machine.

## Run

Requires Node 22.13+.

```bash
cd job-crm
npm start
```

Open http://localhost:4319, go to **Profile**, and fill in skills, target titles, years, locations and minimum
salary. Fit scores are meaningless until you do.

`PORT` and `CRM_DB` environment variables override the port and database path. `npm test` runs the tests.

## Chrome extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `job-crm/extension`.
3. On a job posting, click the extension (or `Alt+Shift+S`). It reads the posting, shows the fit score and
   matched/missing skills, and saves it with one click. Already-tracked postings are detected by URL.

Extraction tries, in order: schema.org `JobPosting` data (most ATS pages), selectors for LinkedIn, Indeed,
Greenhouse, Lever, Ashby, Workday, Glassdoor and Wellfound, then generic page heuristics. If a page comes out
wrong, select the posting text on the page before opening the popup — the selection is used as the description —
or edit the fields in the popup. The CRM server must be running.

## How the fit score works

**Profile match (baseline).** Each posting is scored against your profile: skills mentioned vs. skills you have
(40%), title vs. target titles (25%), required experience vs. yours (20%), work mode/location (10%), salary (5%).
Unknown components are left out rather than guessed. A dealbreaker phrase caps the score at 15.

**Learning from outcomes.** Every job with an outcome becomes a training example:

| Outcome | Signal |
| --- | --- |
| Reached screen or later (even if rejected afterwards) | Positive, stronger the further it went |
| Rejected before a screen | Negative |
| Marked ghosted | Weaker negative |
| Sitting in Applied for 30+ days | Weak negative |
| Saved, recently applied, or withdrawn early | Ignored |

A regularised logistic model is retrained on every change, with the baseline as its starting point. It learns
which traits of a posting — skills mentioned, level, role family, work mode, source, and how much each part of
the profile match actually matters — go with advancing vs. being rejected *for you*, and shifts future scores
accordingly. With no history the score equals the baseline; a trait needs at least two outcomes before it counts.
The job view shows the baseline, the learned adjustment and the reasons; **Insights** shows everything learned.

The score ranks postings relative to each other. Once there are 8+ outcomes of both kinds, the job view also
shows an estimated chance of getting a response.

## Tailored resumes

Paste your resume into **Profile** once. On any job, **Tailor resume** builds a prompt containing your resume,
the posting, the skills you match and miss, and what your past outcomes say about similar postings. Copy it
into Claude, then paste the result back to keep the exact version you sent with that application.

The prompt tells Claude to use only facts from your resume and to list gaps rather than paper over them.

Once a resume is saved on a job, **Download .docx** exports it as a Word document and **Print / PDF** opens a
print-ready page (choose "Save as PDF"). Headings, bullets, bold and italic from Claude's Markdown carry over.

## Labels

Free-form tags that sit alongside the stage, e.g. `needs-triage`, `referral`, `dream-job`. Add or remove them in
a job's detail view; they show on cards and in the list, and the label bar above the board filters by one.
Labels are normalised to lowercase-with-dashes. The extension tags clipped postings `needs-triage` by default;
change the field in the popup and it remembers your choice.

## Layout

```
server/     HTTP API + static hosting (index.js), SQLite storage (db.js), fit engine (fit.js)
public/     Web UI (vanilla JS)
extension/  Chrome MV3 clipper
test/       node:test suites
```

The API only listens on 127.0.0.1 and rejects requests from other websites.
