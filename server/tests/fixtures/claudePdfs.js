/**
 * Text fixtures that reproduce what `pdf-parse` actually returns for the three
 * Claude "Web Development Lead List" PDFs.
 *
 *  - HOWRAW_GYMS_PDF      -> Howrah_Gym_Leads.pdf
 *  - INDORE_MANGALURU_PDF -> web_dev_leads_indore_mangaluru.pdf
 *  - WEB_DEV_LEADS_PDF    -> web_dev_leads.pdf
 */

/* ---------------------------------------------------------------------------
 * FORMAT 1 : Howrah_Gym_Leads.pdf
 * Column order: # | Business | Category | Google Rating | Phone | Address | Website
 * One city section, wrapped name + wrapped PIN, `* ` prefixed ratings.
 * ------------------------------------------------------------------------- */
export const HOWRAH_GYMS_PDF = `Web Development Lead List
Howrah Gyms
Compiled 12 March 2025 from Google Business Profile listings.

# | Business | Category | Google Rating | Phone | Address | Website
1 | Fitness Addiction Xtreme | Gym | * 4.8 (763) | 062908 79580 | 42, Sarat Banerjee Road, Salkia,
Howrah, West Bengal 711102 | No website shown
2 | Iron Temple Fitness Studio | Gym | 4.9 (78) | 098269 63500 | 12/3 G.T. Road, Shibpur,
Howrah, West Bengal | WEBSITE BUTTON PRESENT - may already have one
3 | Star Iron Gym & Health Club | Gym | 4.5 (1.2K) | 076048 61188 | 88, Jagadish Chandra Bose Road,
Shibpur, Howrah, West Bengal 711102 | No website shown
4 | Body Zone Fitness Centre | Gym | 4.7 (302) | 033 2499 7526 | 5, Mallik Ghat, Strand Road,
Howrah, West Bengal 700007 | No website shown

All 10 businesses above have a Google Business Profile but no working website button.
Notes for Outreach
Before you pitch, mention their review count - it is the fastest rapport opener.
Page 1
`;

/* ---------------------------------------------------------------------------
 * FORMAT 2 : web_dev_leads_indore_mangaluru.pdf
 * Column order: # | Business | Phone | Address | Category | Google Rating | Website
 * Two city sections (niche inferred from the section header).
 * Contains a MERGED ROW: rows 3 and 4 lost row-4's `4 |` marker in extraction.
 * ------------------------------------------------------------------------- */
export const INDORE_MANGALURU_PDF = `Web Development Lead List
Indore Plumbers
# | Business | Phone | Address | Category | Google Rating | Website
1 | Shri Ram Plumbing Works | 093200 41276 | 22, Annapurna Road, Vijay Nagar, Indore,
Madhya Pradesh 452010 | Plumber | 4.6 (188) | No website shown
2 | Quick Fix Plumber | 098277 10542 | 3, Sarafa Bazaar, Indore, Madhya Pradesh 452002
| Plumber | * 4.4 (52) | WEBSITE BUTTON PRESENT may already have one
3 | Star Iron Gym | 076048 61188 | 44, Rajwada, Indore, Madhya Pradesh | Plumber | 4.5
(1.2K) | No website shown
4 | Sagar Pipes & Sanitary | 044 2499 7526 | 7, M.G. Road, Indore, Madhya Pradesh
452017 | Plumber | 4.9 (78) | No website shown
5 | Goyal Electrical & Plumbing | 099911 22880 | Address not visible in screenshot | Plumber |
4.3 (21) | Unverified (top of listing cropped)

13 businesses across Indore and Mangaluru.
Page 1
Mangaluru Plumbers
# | Business | Phone | Address | Category | Google Rating | Website
6 | Coastal Plumbing Solutions | 0825 2499 7526 | 14, Hampankatta, Mangaluru, Karnataka
575001 | Plumber | 4.8 (1.7K) | Website button links to Instagram/YouTube only
7 | Ace Plumbers Mangaluru | 094440 33118 | 2, Falnir Road, Mangaluru, Karnataka 575001 |
Plumber | 4.2 (9) | No website shown
8 | Mandavi Pipe Works | 089113 44772 | 55, Bejai Road, Mangaluru, Karnataka 575003 |
Plumber | 4.9 (413) | WEBSITE BUTTON PRESENT - may already have one
9 | Modern Bath & Pipe | 079411 99302 | 9, Vidyagiri, Mangaluru, Karnataka 575001 | Plumber
| 4.1 (5) | No website shown
`;

/* ---------------------------------------------------------------------------
 * FORMAT 3 : web_dev_leads.pdf
 * Column order: # | Business | Phone | Address | Category | Google Rating | Website
 * Three sections with Niche SUB-LABELS, two header rows, `K` ratings,
 * heavy wrapping on names, addresses and the Website column.
 * ------------------------------------------------------------------------- */
export const WEB_DEV_LEADS_PDF = `Web Development Lead List

Boutiques
# | Business | Phone | Address | Niche | Google Rating | Website
| Star | Rating | Status |
1 | Anusha J
Couture | 098269 63500 | 17, Netaji Subhas Road, Dum dum, Kolkata, West Bengal
700051 | Women's clothing store | 4.8 (1.7K) | No website shown
2 | Ziya
Fashion | 062908 79580 | 9, Rashbehari Avenue, Kolkata, West Bengal 700029 | Designer
clothing store | * 4.9 (78) | WEBSITE BUTTON PRESENT may already have one
3 | Saree Ghar | 098992 11445 | 4, B.T. Road, Kolkata, West Bengal 700002 | Dress store |
4.6 (233) | No website shown

Notes for Outreach
10 boutiques across Kolkata and Howrah were screened.
Page 1
Caterers
# | Business | Phone | Address | Niche | Google Rating | Website
4 | Sai Lakshmi
Catering Services | 093200 41276 | 61, Nimta, Kolkata, West Bengal 700049 | Catering food
& drink supplier | 4.4 (96) | Website button links to
Instagram/YouTube only
5 | Royal Rasoi | 033 2499 7526 | 23, Park Street, Kolkata, West Bengal 700016 |
Caterer | 4.9 (1.1K) | No website shown
6 | Annapurna Food Service | 076048 61188 | 82, Barrackpore Trunk Road, Kolkata, West Bengal,
700035 | Caterer | 4.2 (37) | Unverified (top of listing cropped)
Plumbers
# | Business | Phone | Address | Niche | Google Rating | Website
7 | New Kolkata
Plumbing | 089113 44772 | 5, Jessore Road, Kolkata, West Bengal 700050 | Plumber | 4.8 (763)
| No website shown
8 | Aspiring
Home
Services | 094440 33118 | 77, Lake Town, Kolkata, West Bengal 700042 | Plumber | 4.1
(8) | WEBSITE BUTTON PRESENT may already have one
9 | Baba Pipe & Sanitation | 098265 55610 | 31, Belgharia Road, Kolkata, West Bengal
700056 | Plumber | 4.5 (140) | No website shown

Businesses with no website across all three categories.
Page 2
`;

/** Wrapped row that keeps its marker - the well-behaved variant. */
export const MERGED_ROW_WITH_MARKER_PDF = `Plumbers
# | Business | Phone | Address | Niche | Google Rating | Website
3 | Star Iron Gym | 076048 61188 | 44, Rajwada, Kolkata, West Bengal 700001 | Plumber |
4.5 (1.2K) | No website shown
4 | Sagar Pipes & Sanitary | 044 2499 7526 | 7, M.G. Road, Kolkata, West Bengal 700017 |
Plumber | 4.9 (78) | No website shown
`;
