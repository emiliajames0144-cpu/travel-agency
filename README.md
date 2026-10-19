# Serein — considered travel, carefully imagined

A responsive, static luxury travel website concept. It uses a small, beginner-friendly structure: `index.html` for page content, `assets/site.css` for styling and `assets/site.js` for interactions. There is no framework, paid plugin, API key or build step.

## Preview

Open `index.html` in a modern browser. Google Fonts and destination photography load from Google Fonts and Unsplash; offline, the site falls back to system fonts and images may be unavailable.

## Make it yours before launch

Serein, the copy, destinations, sample editorial, and `journeys@serein.travel` are concept content. Replace them with your real brand, approved photography, accurate trip details, contact address, and privacy or booking information before publishing. The enquiry form opens an email draft and does not receive, store, or submit information online. Connect a form handler if you need online enquiries.

## Add a journal story

Blog content lives in `data/blogs.js` as `window.SEREIN_BLOGS`. Add a post object to that array using the existing shape (`slug`, `title`, `subtitle`, category, tags, author, date, hero image, gallery, content blocks, and related post slugs). The listing, rotating home feature, and reusable article view read from this one data source.

## Free GitHub Pages deployment

1. Create a free GitHub account and a new public repository.
2. Put the **contents** of this project folder in the repository root, including the hidden `.github` folder, `scripts`, `data`, `assets`, and `index.html`. GitHub Desktop is the simplest way to upload a complete folder.
3. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the publishing source.
4. Run the **Write and publish a daily blog** workflow once from the repository's **Actions** tab. It will publish the site and show its address in **Settings → Pages**.

The site itself needs no server, database, paid plugin, API key or paid hosting. A custom domain is optional and may have a separate registrar cost.

## Daily AI blog publishing

The repository includes `.github/workflows/daily-blog.yml` and `scripts/publish-daily-blog.mjs`. Once set up, the workflow generates one article each day at 10:17 a.m. Pakistan time, adds it to `data/blogs.js`, and deploys the site to GitHub Pages. It checks the article length and structure, avoids duplicate daily posts, and chooses images from the existing approved photo library. It uses Gemini `gemini-3.5-flash-lite` by default; the model can be changed with the workflow's `GEMINI_MODEL` environment value.

### One-time setup

1. Put this project in a GitHub repository and push the files to its default branch. The scheduled workflow only runs after it is on that branch.
2. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the publishing source.
3. Create a Gemini API key in Google AI Studio. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**, name it `GEMINI_API_KEY`, and paste the key there. Never place the key in `index.html`, `assets/site.js`, or `data/blogs.js`.
4. Open the repository's **Actions** tab, select **Write and publish a daily blog**, then choose **Run workflow** to test it. A successful run will commit the new post and deploy the updated site. The daily schedule then continues automatically.

**Cost and editorial note:** GitHub-hosted standard runners are free for public repositories. Gemini API quotas and pricing depend on the selected model and Google AI Studio project; check the current limits and terms before enabling daily runs. The workflow uses `gemini-3.5-flash-lite` by default, and you can change it with the workflow's `GEMINI_MODEL` environment value. The workflow writes evergreen travel guidance and avoids deliberately inventing live prices or schedules, but AI-generated travel content can still contain mistakes; check the generated post and image rights regularly. Scheduled GitHub Actions can run late during busy periods, so the post is daily but not guaranteed to publish at an exact minute.

Daily automated writing and publishing are prepared in the project, but are **not active or tested against your accounts** until the repository is on GitHub, Pages is enabled, and the `GEMINI_API_KEY` secret is added.
