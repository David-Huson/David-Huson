// Injected into the active tab by the popup. Returns the job posting found on the page.
// Order of trust: schema.org JobPosting JSON-LD -> known job-board selectors -> generic page heuristics.
// The user's text selection, if any, always wins as the description.
(() => {
  const text = (el) => (el?.innerText ?? el?.textContent ?? '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const q = (sel) => { try { return document.querySelector(sel); } catch { return null; } };
  const first = (sels) => { for (const s of sels) { const t = text(q(s)); if (t) return t; } return ''; };
  const meta = (name) => q(`meta[property="${name}"], meta[name="${name}"]`)?.content?.trim() ?? '';
  const htmlToText = (html) => {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    doc.querySelectorAll('script,style').forEach((b) => b.remove());
    doc.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    doc.querySelectorAll('p,li,div,h1,h2,h3,h4,tr').forEach((b) => b.append('\n'));
    doc.querySelectorAll('li').forEach((b) => b.prepend('• '));
    return doc.body.textContent.replace(/\n\s*\n\s*/g, '\n\n').trim();
  };

  function fromJsonLd() {
    const nodes = [];
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') { nodes.push(v); if (v['@graph']) walk(v['@graph']); }
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { walk(JSON.parse(s.textContent)); } catch { /* malformed block */ }
    }
    const jp = nodes.find((n) => [].concat(n['@type'] ?? []).includes('JobPosting'));
    if (!jp) return {};
    const loc = [].concat(jp.jobLocation ?? [])[0]?.address;
    const place = typeof loc === 'string' ? loc : [loc?.addressLocality, loc?.addressRegion, loc?.addressCountry?.name ?? loc?.addressCountry]
      .filter((p) => typeof p === 'string' && p).join(', ');
    const val = jp.baseSalary?.value;
    const yearly = !val?.unitText || /year|annual/i.test(val.unitText);
    const num = (n) => (Number(n) > 0 ? Math.round(Number(n)) : null);
    return {
      title: jp.title ?? jp.name ?? '',
      company: (typeof jp.hiringOrganization === 'string' ? jp.hiringOrganization : jp.hiringOrganization?.name) ?? '',
      location: place,
      remote_mode: /TELECOMMUTE/i.test(String(jp.jobLocationType ?? '')) ? 'remote' : '',
      salary_min: yearly ? num(val?.minValue ?? val?.value) : null,
      salary_max: yearly ? num(val?.maxValue ?? val?.value) : null,
      description: jp.description ? htmlToText(jp.description) : '',
    };
  }

  const SITES = [
    [/linkedin\.com$/, {
      title: ['.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title', '.topcard__title'],
      company: ['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link', '.top-card-layout__second-subline a'],
      location: ['.job-details-jobs-unified-top-card__primary-description-container .tvm__text', '.topcard__flavor--bullet'],
      description: ['#job-details', '.jobs-description__content', '.show-more-less-html__markup', '.description__text'],
    }],
    [/indeed\.com$/, {
      title: ['[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title'],
      company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]'],
      location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]'],
      description: ['#jobDescriptionText'],
    }],
    [/greenhouse\.io$/, {
      title: ['.job__title h1', '.app-title', 'h1'], company: ['.company-name'],
      location: ['.job__location', '.location'], description: ['.job__description', '#content'],
    }],
    [/lever\.co$/, {
      title: ['.posting-headline h2'], location: ['.posting-categories .location', '.posting-category.location'],
      description: ['[data-qa="job-description"]', '.posting-page .content', '.content'],
    }],
    [/ashbyhq\.com$/, { title: ['h1'], description: ['[class*="descriptionText"]', '[class*="_description"]'] }],
    [/myworkdayjobs\.com$/, {
      title: ['[data-automation-id="jobPostingHeader"]'], location: ['[data-automation-id="locations"] dd'],
      description: ['[data-automation-id="jobPostingDescription"]'],
    }],
    [/(wellfound|angel)\.co(m)?$/, { title: ['h1'], description: ['[class*="description"]'] }],
    [/glassdoor\.com$/, {
      title: ['[data-test="job-title"]', 'h1'], company: ['[data-test="employer-name"]'],
      location: ['[data-test="location"]'], description: ['[class*="JobDetails_jobDescription"]', '#JobDescriptionContainer'],
    }],
  ];

  function fromSite() {
    const rule = SITES.find(([re]) => re.test(location.hostname))?.[1];
    if (!rule) return {};
    return Object.fromEntries(Object.entries(rule).map(([k, sels]) => [k, first(sels)]));
  }

  function fromGeneric() {
    const rawTitle = meta('og:title') || text(q('h1')) || document.title;
    let title = text(q('h1')) || rawTitle;
    let company = meta('og:site_name');
    // "Title at Company", "Company - Title", "Title | Company"
    const at = [meta('og:title'), document.title].map((t) => t.match(/^(.{3,90}?)\s+(?:at|@)\s+(.{2,60}?)(?:\s*[|\-–—(].*)?$/i)).find(Boolean);
    if (at) { title = title || at[1]; company = company || at[2]; }
    else if (!company) {
      const parts = document.title.split(/\s+[|\-–—]\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) company = parts.find((p) => p !== title && !/jobs?|careers?|apply/i.test(p)) ?? '';
    }
    let best = null, bestLen = 0;
    for (const el of document.querySelectorAll('[class*="description" i], [id*="description" i], [class*="job-detail" i], [class*="posting" i], article, main, [role="main"]')) {
      const len = text(el).length;
      if (len > bestLen && len < 40000) [best, bestLen] = [el, len];
    }
    return { title, company, description: bestLen > 200 ? text(best) : text(document.body) };
  }

  function sourceName() {
    const h = location.hostname.replace(/^www\./, '');
    const known = ['linkedin', 'indeed', 'greenhouse', 'lever', 'ashbyhq', 'workday', 'glassdoor', 'wellfound', 'ziprecruiter', 'dice', 'builtin'];
    return known.find((k) => h.includes(k))?.replace('ashbyhq', 'ashby') ?? h;
  }

  function pageUrl() {
    const u = new URL(location.href);
    // LinkedIn search/collection pages show the posting in a side pane; link to the posting itself.
    const li = /linkedin\.com$/.test(u.hostname) && u.searchParams.get('currentJobId');
    if (li) return `https://www.linkedin.com/jobs/view/${li}/`;
    return location.href;
  }

  const layers = [fromJsonLd(), fromSite(), fromGeneric()];
  const pick = (k) => layers.map((l) => l[k]).find((v) => v != null && v !== '') ?? '';
  const selection = String(window.getSelection?.() ?? '').trim();
  return {
    title: pick('title').slice(0, 300),
    company: pick('company').replace(/\s*\n[\s\S]*/, '').slice(0, 200),
    location: pick('location').replace(/\s*\n[\s\S]*/, '').slice(0, 200),
    remote_mode: pick('remote_mode'),
    salary_min: pick('salary_min') || null,
    salary_max: pick('salary_max') || null,
    description: (selection.length > 200 ? selection : pick('description')).slice(0, 50000),
    url: pageUrl(),
    source: sourceName(),
    structured: Boolean(layers[0].title),
  };
})();
