/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App.tsx';

function escapeHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function render(url: string, initialData?: any) {
  const html = renderToString(<App initialPath={url} initialData={initialData} />);
  
  let head = '';
  const gig = initialData?.gig;

  if (gig) {
    const title = `${escapeHtml(gig.title)} | Work Per Hour`;
    const desc = escapeHtml((gig.description || '').slice(0, 160));
    const image = escapeHtml(gig.image || '');
    const canonical = `https://workperhour.com${initialData?.gigUrl || ''}`;

    let jsonLd = {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": escapeHtml(gig.title),
      "description": escapeHtml(gig.description),
      "provider": {
        "@type": "Person",
        "name": escapeHtml(gig.freelancerName)
      },
      "offers": {
        "@type": "Offer",
        "price": gig.price,
        "priceCurrency": "USD"
      }
    };

    if (gig.reviewsCount > 0 && gig.rating) {
      (jsonLd as any).aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": gig.rating,
        "reviewCount": gig.reviewsCount
      };
    }

    head = `
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">
    ${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
    </script>
    `;
  } else if (initialData?.notFound) {
    head = `
    <title>Gig Not Found | Work Per Hour</title>
    <meta name="robots" content="noindex, nofollow" />
    <meta name="description" content="The requested gig could not be found." />
    `;
  } else {
    head = `
    <title>Work Per Hour | Freelance Marketplace & Escrow Platform</title>
    <meta name="robots" content="noindex, nofollow" />
    <meta name="description" content="A feature-rich PeoplePerHour clone with gig marketplace, custom project proposals, escrow payments, real-time messaging, and buyer/seller dashboards." />
    `;
  }

  return { html, head };
}
