/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { gigs } from '../server.js';
import { slugify } from '../src/utils/slugify.js';

const RESERVED_ROUTES = [
  'gigs', 'projects', 'search-projects', 'project-search', 'freelance-jobs', 'categories', 'orders', 'messages', 'create-gig', 'post-project', 
  'admin', 'profile', 'payments', 'freelancers', 'search-freelancers', 'freelancer-search', 'freelance-activity', 'support', 
  'settings', 'login', 'signup', 'forgot-password', 'verify', 'wishlist', 'notifications', 'switch-user',
  'edit-profile', 'freelancer'
];

function getGigUrl(gig: any) {
  const uname = (gig.freelancerUsername || slugify(gig.freelancerName)).toLowerCase();
  const gslug = (gig.slug || slugify(gig.title)).toLowerCase();
  return `/${uname}/${gslug}`;
}

export async function setupSSR(app: Express, isProd: boolean, root: string) {
  let vite: any;
  let templateHtml: string;
  let ssrRender: any;

  if (!isProd) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root,
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(root, 'dist');
    const clientDist = path.resolve(distPath, 'client');
    const serverDist = path.resolve(distPath, 'server');
    
    app.use(express.static(clientDist, { index: false }));
    templateHtml = fs.readFileSync(path.resolve(clientDist, 'index.html'), 'utf-8');
    
    // Find server entry in serverDist
    const serverEntryFiles = fs.readdirSync(serverDist);
    const entryFile = serverEntryFiles.find(f => f.startsWith('entry-server') || f.endsWith('.js'));
    if (entryFile) {
      const ssrModule = await import(path.resolve(serverDist, entryFile));
      ssrRender = ssrModule.render;
    }
  }

  app.use('*', async (req: Request, res: Response, next) => {
    // Exclude API routes and static assets
    if (req.originalUrl.startsWith('/api') || req.originalUrl.includes('.')) {
      return next();
    }

    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const url = req.originalUrl;
      const pathParts = url.split('?')[0].split('/').filter(Boolean);

      let matchedGig: any = null;
      let isGigRoute = false;
      let notFound = false;

      // Check if route matches gig detail: /:username/:slug OR /gigs/:id
      if (pathParts.length === 2 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) {
        const usernameParam = pathParts[0].toLowerCase();
        const slugParam = pathParts[1].toLowerCase();
        isGigRoute = true;

        matchedGig = gigs.find(g => {
          const gUname = (g.freelancerUsername || slugify(g.freelancerName)).toLowerCase();
          const gSlug = (g.slug || slugify(g.title)).toLowerCase();
          return gSlug === slugParam || g.id === slugParam || gSlug.includes(slugParam.slice(0, 10)) || gUname.includes(usernameParam);
        });

        if (!matchedGig) {
          notFound = true;
        }
      } else if (pathParts.length >= 2 && pathParts[0].toLowerCase() === 'gigs') {
        const gigIdParam = pathParts[1].toLowerCase();
        isGigRoute = true;
        matchedGig = gigs.find(g => g.id === gigIdParam || (g.slug && g.slug.toLowerCase() === gigIdParam));
        if (!matchedGig) {
          notFound = true;
        }
      }

      // If it's not a public gig route (private routes, home, lists, etc.), serve normal SPA index.html with noindex, nofollow
      if (!isGigRoute) {
        let template = '';
        if (!isProd && vite) {
          template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
        } else {
          template = templateHtml;
        }

        const headReplacement = `
          <title>Work Per Hour | Freelance Marketplace & Escrow Platform</title>
          <meta name="robots" content="noindex, nofollow" />
          <meta name="description" content="A feature-rich PeoplePerHour clone with gig marketplace, custom project proposals, escrow payments, real-time messaging, and buyer/seller dashboards." />
        `;
        const html = template.replace('</head>', `${headReplacement}\n</head>`);
        return res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      }

      // If gig route but not found
      if (notFound) {
        let template = '';
        if (!isProd && vite) {
          template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
        } else {
          template = templateHtml;
        }

        let renderFn = ssrRender;
        if (!isProd && vite) {
          const mod = await vite.ssrLoadModule('/src/entry-server.tsx');
          renderFn = mod.render;
        }

        const initialData = { notFound: true };
        const rendered = renderFn ? renderFn(url, initialData) : { html: '', head: '<title>Not Found</title><meta name="robots" content="noindex" />' };
        
        const finalHtml = template
          .replace('</head>', `${rendered.head}\n</head>`)
          .replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>\n<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script>`);

        return res.status(404).set({ 'Content-Type': 'text/html' }).end(finalHtml);
      }

      // Load template
      let template = '';
      if (!isProd && vite) {
        template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
      } else {
        template = templateHtml;
      }

      let renderFn = ssrRender;
      if (!isProd && vite) {
        const mod = await vite.ssrLoadModule('/src/entry-server.tsx');
        renderFn = mod.render;
      }

      const initialData = {
        gig: matchedGig,
        gigUrl: getGigUrl(matchedGig)
      };

      const rendered = renderFn ? renderFn(url, initialData) : { html: '', head: '' };

      const finalHtml = template
        .replace('</head>', `${rendered.head}\n</head>`)
        .replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>\n<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script>`);

      return res.status(200).set({ 'Content-Type': 'text/html' }).end(finalHtml);

    } catch (e: any) {
      if (!isProd && vite) {
        vite.ssrFixStacktrace(e);
      }
      console.error('SSR Error:', e);
      next(e);
    }
  });
}
