# Recon

Recon checks a shop before we write a provider.
It uses the patterns from the scraperecon tool.
The code lives in `discovery/src/recon.ts`.

## What recon tells you

**Vendor.** The bot protection vendor.
We skip Akamai shops. Akamai blocks every scraper.
We pace the shops that use Cloudflare.

**Challenge.** Whether the page is a bot verification page.
A challenge page is not the real shop page.
Do not parse a challenge page.

**Embedded data.** The data formats inside the page.
JSON-LD, Next.js, Nuxt, Apollo, Redux.
These formats often hide the product data.

**Robots.** The number of sitemap lines in robots.txt.
It estimates the catalog size.

## How to run recon

```sh
cd discovery
npm run recon -- https://example.com
```

Example output:

```
recon https://pl.holy.com/
  status      200
  vendor      none
  challenged  no
  embedded    jsonld
  sitemaps    3
```

## When to use recon

Run recon when you add a new shop.
It is faster than a manual curl.
It answers the first three questions:
is the shop blocked, who blocks it, and where is the data.
