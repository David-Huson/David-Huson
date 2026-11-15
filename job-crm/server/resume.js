// Builds a ready-to-paste prompt for tailoring the user's resume to one posting.
// The CRM stays offline and key-free; the prompt carries everything Claude needs.
export function resumePrompt(job, profile, fit) {
  const resume = (profile.resume ?? '').trim();
  if (!resume) return { ok: false, reason: 'Add your resume text in Profile first — the prompt is built from it.' };
  if (!(job.description ?? '').trim()) return { ok: false, reason: 'This job has no description. Paste the posting into the job description first.' };

  const list = (items) => (items.length ? items.join(', ') : 'none identified');
  const lessons = fit.signals.filter((s) => s.n >= 2).map((s) =>
    `- ${s.label}: ${s.pos} advanced, ${s.neg} rejected in my past applications (${s.effect > 0 ? 'has gone well' : 'has gone badly'})`);
  const salary = fit.salaryMax ? `$${Math.round((fit.salaryMin ?? fit.salaryMax) / 1000)}k–$${Math.round(fit.salaryMax / 1000)}k` : '';
  const facts = [
    job.company && `Company: ${job.company}`, job.title && `Title: ${job.title}`, job.location && `Location: ${job.location}`,
    fit.mode && `Work mode: ${fit.mode}`, salary && `Salary: ${salary}`, fit.years != null && `Experience asked: ~${fit.years} years`,
  ].filter(Boolean).join('\n');

  const prompt = `You are an expert resume writer. Tailor my resume to the job posting below.

## Rules
- Use only facts that are in my resume. Never invent employers, titles, dates, degrees, skills, metrics or achievements. If a number would strengthen a bullet and I have not given one, leave a [bracketed placeholder] for me to fill in instead of guessing.
- Keep every employer, job title and date exactly as written.
- Reorder, cut and rephrase so the experience most relevant to this posting comes first and reads strongest. Drop or shorten what is irrelevant.
- Mirror the posting's wording for skills I actually have, so applicant tracking systems and recruiters see the match. Do not keyword-stuff.
- Lead bullets with strong verbs and concrete outcomes. Keep it to one page unless my resume already runs longer for good reason.
- Plain, ATS-safe formatting: standard section headings, no tables, columns, images or icons.

## What my tracker found about this posting
Skills the posting asks for that are on my profile: ${list(fit.matched)}
Skills the posting asks for that are NOT on my profile: ${list(fit.missing)}
${fit.missing.length ? `For the missing ones: if my resume shows real evidence of one (possibly under another name), surface it. Otherwise do not claim it; where honest, emphasise adjacent experience instead.\n` : ''}${lessons.length ? `\nPatterns from my own application history that apply here:\n${lessons.join('\n')}\nWeigh these when deciding what to emphasise or play down.\n` : ''}
## Output
1. The full tailored resume in Markdown, ready to paste.
2. "What I changed" — a short bullet list.
3. "Gaps" — requirements in the posting my resume does not support, with a suggestion for each (how to address it in a cover letter or interview, or what to add to my resume if I really do have the experience).
4. "Questions" — anything you need from me to make it stronger.

## Job posting
${facts}

<posting>
${job.description.trim()}
</posting>

## My resume
<resume>
${resume}
</resume>
`;
  return { ok: true, prompt };
}
