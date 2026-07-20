# Hủ Tiếu Xào A Tiểu - atieu.com

Business website for **HỘ KINH DOANH HỦ TIẾU XÀO A TIỂU** — a Vietnamese household business (restaurant) at 86 Lạc Long Quân, Nha Trang, Khánh Hòa.

Built for **Meta Business Verification** — all displayed information exactly matches the business registration certificate.

## Pages

| URL | Description |
|-----|-------------|
| `/` | Home — hero, intro, opening hours, map |
| `/about.html` | About the restaurant |
| `/business-information.html` | 📋 Exact business registration details |
| `/contact.html` | Phone, email, address, map, contact form |
| `/privacy-policy.html` | Privacy policy |
| `/terms-of-service.html` | Terms of service |

## Tech Stack

- **Static HTML** (pure, no build step)
- **CSS** with custom properties, responsive design, mobile-first
- **Google Fonts**: Playfair Display (headings) + Inter (body)
- **JSON-LD** structured data (Restaurant + LocalBusiness schema)
- **WCAG AA** accessibility (skip link, ARIA labels, semantic HTML, keyboard nav)
- **SEO**: meta tags, OpenGraph, Twitter Cards, canonical, robots.txt, sitemap.xml

## SEO Features

- `<title>` + `<meta name="description">` on every page
- OpenGraph (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:locale`)
- Twitter Cards (`summary_large_image`)
- JSON-LD `Restaurant` + `LocalBusiness` + `BreadcrumbList`
- `robots.txt` with sitemap reference
- `sitemap.xml` (6 URLs with priority/lastmod)
- `canonical` link on every page
- Semantic HTML5 landmarks (`header`, `nav`, `main`, `section`, `footer`)
- `favicon.svg` + `favicon.ico` + `apple-touch-icon`

## Business Information (for Meta Verification)

| Field | Value |
|-------|-------|
| Legal Name | HỘ KINH DOANH HỦ TIẾU XÀO A TIỂU |
| Registration Number | 8302117087-001 |
| Business Type | Vietnam Household Business (Sole Proprietorship) |
| Registration Date | 16/04/2024 |
| Address | 86 Lạc Long Quân, Phường Phước Tân, Nha Trang, Khánh Hòa, Việt Nam |
| Phone | +84 905 321 039 |
| Email | contact@atieu.com |
| Website | https://atieu.com |

## Design

- Modern, minimal, professional restaurant style
- Dark hero header, clean white sections
- Red (#c0392b) + gold (#d4a017) brand palette
- Fully responsive (mobile, tablet, desktop)
- Fast loading (no framework, no heavy libraries)
- Accessibility AA compliant

## Deployment

### Option 1: Netlify (recommended)

1. Push to a Git repo
2. In Netlify: **Add new site → Import from Git**
3. Publish directory: `atieu.com` (root of the site folder)
4. Done — Netlify auto-detects `netlify.toml` and `_redirects`

### Option 2: Any static host

Upload the contents of `atieu.com/` to any web server.

### Option 3: Manual

Copy all files from `atieu.com/` to your web root on atieu.com.

## File Structure

```
atieu.com/
├── index.html                  # Home page
├── about.html                  # About page
├── business-information.html   # Business registration details
├── contact.html                # Contact page + form
├── privacy-policy.html         # Privacy policy
├── terms-of-service.html       # Terms of service
├── robots.txt                  # SEO robots
├── sitemap.xml                 # XML sitemap
├── netlify.toml                # Netlify deployment config
├── _redirects                  # URL redirect rules
├── css/
│   └── style.css               # Main stylesheet
├── js/
│   └── main.js                 # JavaScript
└── favicon/
    ├── favicon.svg             # SVG favicon
    ├── favicon.ico             # ICO favicon (16-48px)
    ├── favicon.png             # PNG favicon
    ├── apple-touch-icon.png    # iOS icon
    └── og-image.png            # OpenGraph social image
```

## Meta Verification Notes

When submitting for Meta Business Verification, ensure:

1. The website domain on Meta matches **exactly**: `atieu.com`
2. Business legal name matches **exactly**: `HỘ KINH DOANH HỦ TIẾU XÀO A TIỂU`
3. Registration number matches **exactly**: `8302117087-001`
4. The `/business-information.html` page displays all registration details
5. The JSON-LD structured data on the home page references the same registration info
6. Contact information (phone, email, address) is consistent across all pages
7. Verify the domain in Meta Business Manager via DNS TXT record or HTML file upload
