/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { isGigPublic, sanitizePublicGig, isUserPublic, sanitizePublicUser, isProjectPublic, sanitizePublicProject } from './publicData.js';
import { slugify } from '../src/utils/slugify.js';
import { PRIVATE_ROUTES, RESERVED_ROUTES } from '../src/shared/routes.js';

function getGigUrl(gig: any) {
  const uname = (gig.freelancerUsername || slugify(gig.freelancerName)).toLowerCase();
  const gslug = (gig.slug || slugify(gig.title)).toLowerCase();
  return `/${uname}/${gslug}`;
}

export async function setupSSR(
  app: Express,
  isProd: boolean,
  root: string,
  getData: () => { gigs: any[]; users: any[]; projects: any[]; categories: any[] }
) {
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

    const serverEntryFiles = fs.readdirSync(serverDist);
    const entryFile = serverEntryFiles.find(f => f.startsWith('entry-server') || f.endsWith('.js'));
    if (entryFile) {
      const ssrModule = await import(path.resolve(serverDist, entryFile));
      ssrRender = ssrModule.render;
    }
  }

  // Single SSR Flow: Express gets request -> loads current PUBLIC data -> React SSR renders full HTML
  app.use('*', async (req: Request, res: Response, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }

    const pathname = req.originalUrl.split('?')[0];
    const ext = path.extname(pathname);
    if (ext) {
      const publicPath = path.join(root, 'public', pathname);
      const distClientPath = path.join(root, 'dist/client', pathname);
      if (fs.existsSync(publicPath) || fs.existsSync(distClientPath)) {
        return next();
      }
    }

    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      const [, query] = req.originalUrl.split('?');
      const pathParts = pathname.split('/').filter(Boolean);

      // 1. Load current PUBLIC data
      const rawData = getData();
      const PUBLIC_GIGS = rawData.gigs.filter(isGigPublic).map(sanitizePublicGig);
      const PUBLIC_USERS = rawData.users.filter(isUserPublic).map(sanitizePublicUser);
      const PUBLIC_PROJECTS = rawData.projects.filter(isProjectPublic).map(sanitizePublicProject);
      const PUBLIC_CATEGORIES = rawData.categories || [];

      let initialData: any = {
        query,
        gigs: PUBLIC_GIGS,
        users: PUBLIC_USERS,
        projects: PUBLIC_PROJECTS,
        categories: PUBLIC_CATEGORIES
      };

      let notFound = false;
      let isPrivate = false;

      // 2. Determine pageType and matching entity
      const isPrivateRoute = (p: string) => {
        const parts = p.split('/').filter(Boolean);
        return parts.length > 0 && PRIVATE_ROUTES.some(pr => parts[0].toLowerCase() === pr.toLowerCase());
      };

      if (isPrivateRoute(pathname)) {
        isPrivate = true;
        initialData.isPrivate = true;
        initialData.pageType = 'private';
      } else if (pathname === '/' || pathname === '') {
        initialData.pageType = 'home';
      } else if (pathname === '/gigs') {
        initialData.pageType = 'gigs';
      } else if (pathname.startsWith('/categories/')) {
        initialData.pageType = 'gigs';
      } else if (['/projects', '/search-projects', '/project-search', '/freelance-jobs'].includes(pathname)) {
        initialData.pageType = 'projects';
      } else if (['/freelancers', '/search-freelancers', '/freelancer-search'].includes(pathname)) {
        initialData.pageType = 'freelancers';
      } else if (pathParts.length === 2 && (pathParts[0].toLowerCase() === 'projects' || pathParts[0].toLowerCase() === 'project')) {
        const slugParam = pathParts[1].toLowerCase();
        const matchedProject = PUBLIC_PROJECTS.find(p => (p.slug && p.slug.toLowerCase() === slugParam) || p.id.toLowerCase() === slugParam);
        if (matchedProject) {
          initialData.pageType = 'project-detail';
          initialData.project = matchedProject;
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 2 && (pathParts[0].toLowerCase() === 'freelancers' || pathParts[0].toLowerCase() === 'profile')) {
        const usernameParam = pathParts[1].toLowerCase();
        const matchedUser = PUBLIC_USERS.find(u => (u.username && u.username.toLowerCase() === usernameParam) || slugify(u.name).toLowerCase() === usernameParam);
        if (matchedUser) {
          initialData.pageType = 'profile';
          initialData.profileUser = matchedUser;
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 2 && pathParts[0].toLowerCase() === 'gigs') {
        const gigParam = pathParts[1].toLowerCase();
        const matchedGig = PUBLIC_GIGS.find(g => g.id.toLowerCase() === gigParam || (g.slug && g.slug.toLowerCase() === gigParam));
        if (matchedGig) {
          initialData.pageType = 'gig-detail';
          initialData.gig = matchedGig;
          initialData.gigUrl = getGigUrl(matchedGig);
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 2 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) {
        const usernameParam = pathParts[0].toLowerCase();
        const slugParam = pathParts[1].toLowerCase();

        const matchedGig = PUBLIC_GIGS.find(g => {
          const gUname = (g.freelancerUsername || slugify(g.freelancerName)).toLowerCase();
          const gSlug = (g.slug || slugify(g.title)).toLowerCase();
          return gUname === usernameParam && gSlug === slugParam;
        });

        if (matchedGig) {
          initialData.pageType = 'gig-detail';
          initialData.gig = matchedGig;
          initialData.gigUrl = getGigUrl(matchedGig);
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 1 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) {
        const usernameParam = pathParts[0].toLowerCase();
        const matchedUser = PUBLIC_USERS.find(u => (u.username && u.username.toLowerCase() === usernameParam) || slugify(u.name).toLowerCase() === usernameParam);
        if (matchedUser) {
          initialData.pageType = 'profile';
          initialData.profileUser = matchedUser;
        } else {
          notFound = true;
        }
      } else {
        notFound = true;
      }

      if (notFound) {
        initialData.notFound = true;
      }

      // 3. Prepare HTML template
      let template = '';
      if (!isProd && vite) {
        template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
      } else {
        template = templateHtml;
      }

      // Clean existing head tags from template
      template = template
        .replace(/<title>.*?<\/title>/gi, '')
        .replace(/<meta\s+name=["']description["'].*?>/gi, '')
        .replace(/<meta\s+name=["']robots["'].*?>/gi, '')
        .replace(/<link\s+rel=["']canonical["'].*?>/gi, '')
        .replace(/<meta\s+property=["']og:.*?["'].*?>/gi, '')
        .replace(/<meta\s+name=["']twitter:.*?["'].*?>/gi, '');

      // 4. React SSR render full HTML
      let renderFn = ssrRender;
      if (!isProd && vite) {
        const mod = await vite.ssrLoadModule('/src/entry-server.tsx');
        renderFn = mod.render;
      }

      const rendered = renderFn ? renderFn(pathname, initialData) : { html: '', head: '' };

      const finalHtml = template
        .replace('</head>', `${rendered.head}\n</head>`)
        .replace(
          '<div id="root"></div>',
          `<div id="root">${rendered.html}</div>\n<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script>`
        );

      const statusCode = notFound ? 404 : 200;
      return res.status(statusCode).setHeader('Content-Type', 'text/html').end(finalHtml);

    } catch (e: any) {
      if (!isProd && vite) {
        vite.ssrFixStacktrace(e);
      }
      console.error('SSR Error:', e);
      next(e);
    }
  });
}
