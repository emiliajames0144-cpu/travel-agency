import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BLOG_FILE = join(ROOT, 'data', 'blogs.js');
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const API_KEY = process.env.GEMINI_API_KEY;
const MAX_ATTEMPTS = 2;

if (!API_KEY) throw new Error('Missing GEMINI_API_KEY. Add a Google AI Studio API key as a GitHub Actions repository secret.');

function siteDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readPosts(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  if (!Array.isArray(sandbox.window.SEREIN_BLOGS)) throw new Error('data/blogs.js does not expose window.SEREIN_BLOGS.');
  return sandbox.window.SEREIN_BLOGS;
}

function uniquePhotoPool(posts) {
  const photos = new Map();
  for (const post of posts) {
    for (const image of [post.heroImage, ...(post.gallery || [])]) {
      if (image?.src && image?.alt && !photos.has(image.src)) {
        photos.set(image.src, { src: image.src, alt: image.alt, caption: image.caption || '' });
      }
    }
  }
  return [...photos.values()];
}

function wordCount(article) {
  const text = [article.intro, article.conclusionTitle, article.conclusion,
    ...article.sections.flatMap(section => [section.heading, ...section.paragraphs]),
    article.feature.title, article.feature.text, article.feature.quote, article.feature.credit,
    ...article.feature.items, ...article.feature.practicalItems.flatMap(item => [item.label, item.value])
  ].filter(Boolean).join(' ');
  return text.trim().split(/\s+/).length;
}

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

function validate(article, posts, photos) {
  const count = wordCount(article);
  if (count < 800 || count > 1200) throw new Error(`Article is ${count} words; it must be 800–1,200.`);
  if (article.sections.length < 5 || article.sections.length > 7) throw new Error('Article must have 5–7 sections.');
  if (article.sections.some(section => section.paragraphs.length < 2)) throw new Error('Each section needs at least two paragraphs.');
  if (new Set(article.sections.map(section => section.heading.toLowerCase())).size !== article.sections.length) throw new Error('Section headings must be unique.');
  if (article.heroImageIndex === article.galleryImageIndices[0] || article.heroImageIndex === article.galleryImageIndices[1] || article.galleryImageIndices[0] === article.galleryImageIndices[1]) {
    throw new Error('Choose three different photographs for the article.');
  }
  if (![article.heroImageIndex, ...article.galleryImageIndices].every(index => Number.isInteger(index) && photos[index])) throw new Error('The article selected an unavailable photograph.');
  const title = article.title.trim().toLowerCase();
  if (posts.some(post => post.title.trim().toLowerCase() === title)) throw new Error('The article title duplicates an existing post.');
  if (article.feature.afterSection < 1 || article.feature.afterSection > article.sections.length) throw new Error('Feature placement must be inside the article sections.');
  if (article.feature.type === 'list' && article.feature.items.length < 3) throw new Error('The featured list needs at least three items.');
  if (article.feature.type === 'practical' && article.feature.practicalItems.length < 3) throw new Error('The practical information box needs at least three entries.');
  return count;
}

function makeSchema(photoCount, categories) {
  const photoIndex = { type: 'integer', enum: Array.from({ length: photoCount }, (_, index) => index) };
  const stringList = { type: 'array', items: { type: 'string' } };
  return {
    type: 'object', additionalProperties: false,
    required: ['title', 'subtitle', 'category', 'tags', 'intro', 'sections', 'feature', 'conclusionTitle', 'conclusion', 'heroImageIndex', 'galleryImageIndices', 'galleryCaptions'],
    properties: {
      title: { type: 'string' }, subtitle: { type: 'string' }, category: { type: 'string', enum: categories },
      tags: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
      intro: { type: 'string' },
      sections: {
        type: 'array', minItems: 5, maxItems: 7,
        items: {
          type: 'object', additionalProperties: false, required: ['heading', 'paragraphs'],
          properties: { heading: { type: 'string' }, paragraphs: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } } }
        }
      },
      feature: {
        type: 'object', additionalProperties: false,
        required: ['type', 'afterSection', 'title', 'text', 'quote', 'credit', 'items', 'practicalItems'],
        properties: {
          type: { type: 'string', enum: ['quote', 'callout', 'list', 'practical'] },
          afterSection: { type: 'integer', minimum: 1, maximum: 7 },
          title: { type: 'string' }, text: { type: 'string' }, quote: { type: 'string' }, credit: { type: 'string' },
          items: { ...stringList, minItems: 0, maxItems: 8 },
          practicalItems: {
            type: 'array', minItems: 0, maxItems: 6,
            items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: { type: 'string' }, value: { type: 'string' } } }
          }
        }
      },
      conclusionTitle: { type: 'string' }, conclusion: { type: 'string' },
      heroImageIndex: photoIndex,
      galleryImageIndices: { type: 'array', minItems: 2, maxItems: 2, items: photoIndex },
      galleryCaptions: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } }
    }
  };
}

function editorialBrief(date, posts, photos) {
  const recentTitles = posts.slice(0, 30).map(post => `- ${post.title}`).join('\n');
  const categories = [...new Set(posts.map(post => post.category))];
  const imageList = photos.map((photo, index) => `${index}: ${photo.alt}${photo.caption ? ` — ${photo.caption}` : ''}`).join('\n');
  return `Create one original Serein travel journal article for ${date}. Serein is a quiet luxury travel brand: considered, observant, useful, never salesy.

Avoid repeating these recent article titles or their main angles:
${recentTitles}

Use one of these existing categories: ${categories.join(', ')}.
Choose a fresh travel-planning or place-based angle that can be written responsibly without live research. Do not invent hotel or restaurant names, current opening hours, prices, transit timetables, safety rules, visa rules, or quotations from real people. Give practical advice as guidance to verify locally where details can change. Keep place facts conservative and familiar; do not fabricate sources.

Write 850–1,000 useful words (the finished post is checked at 800–1,200), with a strong lead, 5–7 distinct sections, at least two substantive paragraphs per section, and a specific conclusion. Avoid generic filler and repeated section titles. Vary the featured block type and its placement from recent posts. Use a list or practical box with genuinely useful details when appropriate.

The site already has these approved editorial photos. Select three different indices that suit the story; use one as the hero and two in the article. Never invent image URLs. Write a separate, accurate editorial caption for each gallery image.
${imageList}

Return only the requested structured article. Use concise SEO-friendly title and subtitle. Do not include markdown fences.`;
}

async function requestArticle(date, posts, photos, retryNote = '') {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You are the senior travel editor for Serein. Write original, polished, actionable travel journalism. Never invent live facts, citations, businesses, or quotations.' }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: `${editorialBrief(date, posts, photos)}\n\n${retryNote}` }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: makeSchema(photos.length, [...new Set(posts.map(post => post.category))]),
        maxOutputTokens: 12_000
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(payload.error || payload).slice(0, 1200)}`);
  const candidate = payload.candidates?.[0];
  const outputText = candidate?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!outputText) throw new Error(`Gemini did not return article text${candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : ''}.`);
  return JSON.parse(outputText);
}

function relatedTo(article, posts) {
  const wanted = new Set(article.tags.map(tag => tag.toLowerCase()));
  return posts.map(post => ({
    slug: post.slug,
    score: (post.category === article.category ? 2 : 0) + (post.tags || []).filter(tag => wanted.has(tag.toLowerCase())).length
  })).sort((a, b) => b.score - a.score).slice(0, 3).map(post => post.slug);
}

function toPost(article, posts, photos, date, count) {
  const slugBase = slugify(article.title);
  const existingSlugs = new Set(posts.map(post => post.slug));
  let slug = slugBase;
  if (existingSlugs.has(slug)) slug = `${slugBase}-${date}`;
  let suffix = 2;
  while (existingSlugs.has(slug)) slug = `${slugBase}-${date}-${suffix++}`;
  const image = photos[article.heroImageIndex];
  const gallery = article.galleryImageIndices.map((index, i) => ({
    src: photos[index].src,
    alt: photos[index].alt,
    caption: article.galleryCaptions[i]
  }));
  const blocks = [{ type: 'lead', text: article.intro }];
  const imageAfter = [Math.max(1, Math.floor(article.sections.length / 3)), Math.max(2, Math.floor(article.sections.length * 2 / 3))];
  article.sections.forEach((section, index) => {
    const sectionNumber = index + 1;
    blocks.push({ type: 'heading', level: 2, id: `${slug}-${slugify(section.heading)}`, title: section.heading });
    section.paragraphs.forEach(text => blocks.push({ type: 'paragraph', text }));
    if (sectionNumber === imageAfter[0]) blocks.push({ type: 'image', imageIndex: 0 });
    if (sectionNumber === article.feature.afterSection) {
      const feature = article.feature;
      if (feature.type === 'quote') blocks.push({ type: 'quote', text: feature.quote, credit: feature.credit });
      if (feature.type === 'callout') blocks.push({ type: 'callout', title: feature.title, text: feature.text });
      if (feature.type === 'list') blocks.push({ type: 'list', title: feature.title, ordered: false, items: feature.items });
      if (feature.type === 'practical') blocks.push({ type: 'practical', title: feature.title, items: feature.practicalItems });
    }
    if (sectionNumber === imageAfter[1]) blocks.push({ type: 'image', imageIndex: 1 });
  });
  blocks.push({ type: 'conclusion', title: article.conclusionTitle, text: article.conclusion });
  return {
    slug, title: article.title.trim(), subtitle: article.subtitle.trim(), category: article.category,
    tags: [...new Set(article.tags.map(tag => tag.trim()).filter(Boolean))], author: 'Serein Editorial',
    publishDate: date, readTime: `${Math.max(1, Math.ceil(count / 220))} min read`,
    heroImage: { src: image.src, alt: image.alt }, gallery, blocks,
    relatedPosts: relatedTo(article, posts), automationDate: date
  };
}

const date = siteDate();
const source = await readFile(BLOG_FILE, 'utf8');
const posts = readPosts(source);
if (posts.some(post => post.automationDate === date)) {
  console.log(`A daily article is already published for ${date}; no duplicate was created.`);
  process.exit(0);
}
const photos = uniquePhotoPool(posts);
if (photos.length < 3) throw new Error('At least three approved article photos are required before automation can publish.');

let article;
let count;
let retryNote = '';
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  article = await requestArticle(date, posts, photos, retryNote);
  try {
    count = validate(article, posts, photos);
    break;
  } catch (error) {
    if (attempt === MAX_ATTEMPTS) throw error;
    retryNote = `The previous draft failed validation: ${error.message}. Rewrite it so it passes every rule, especially the 800–1,200 word count. Do not mention this instruction in the article.`;
    console.warn(retryNote);
  }
}

const post = toPost(article, posts, photos, date, count);
const updated = [post, ...posts];
await writeFile(BLOG_FILE, `/* One source of truth for the Serein blog. Images are selected from the approved existing photo library. */\nwindow.SEREIN_BLOGS = ${JSON.stringify(updated, null, 2)};\n`, 'utf8');
console.log(`Created “${post.title}” (${count} words), dated ${date}.`);
