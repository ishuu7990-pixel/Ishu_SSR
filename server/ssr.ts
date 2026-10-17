/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { gigs, users, projects } from '../server.js';
import { slugify } from '../src/utils/slugify.js';

const PRIVATE_ROUTES = [
  'admin', 'messages', 'workstream', 'workstreams', 'workspace', 'orders', 'payments', 
  'wallet', 'settings', 'edit-profile', 'login', 'signup', 'forgot-password', 'verify', 
  'wishlist', 'notifications', 'switch-user', 'post-project', 'create-gig', 'support', 'freelancer'
];

const RESERVED_ROUTES = [
  ...PRIVATE_ROUTES,
  'gigs', 'projects', 'search-projects', 'project-search', 'freelance-jobs', 'categories', 'freelancers', 'search-freelancers', 'freelancer-search'
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
    
    const serverEntryFiles = fs.readdirSync(serverDist);
    const entryFile = serverEntryFiles.find(f => f.startsWith('entry-server') || f.endsWith('.js'));
    if (entryFile) {
      const ssrModule = await import(path.resolve(serverDist, entryFile));
      ssrRender = ssrModule.render;
    }
  }

  app.use('*', async (req: Request, res: Response, next) => {
    // Skip API routes
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }

    // Skip static assets only if they exist on disk
    const isStaticFile = (url: string) => {
      const pathname = url.split('?')[0];
      const ext = path.extname(pathname);
      if (!ext) return false;
      const publicPath = path.join(root, 'public', pathname);
      const distClientPath = path.join(root, 'dist/client', pathname);
      return fs.existsSync(publicPath) || fs.existsSync(distClientPath);
    };

    if (isStaticFile(req.originalUrl)) {
      return next();
    }

    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const [pathname, query] = req.originalUrl.split('?');
      const pathParts = pathname.split('/').filter(Boolean);

      let initialData: any = { query };
      let isPrivate = false;
      let notFound = false;

      const PUBLIC_GIGS = gigs.filter(g => g.status === 'published').slice(0, 24);
      const PUBLIC_USERS = users.map(u => ({
          id: u.id, name: u.name, username: u.username, title: u.title, avatar: u.avatar,
          rating: u.rating, hourlyRate: u.hourlyRate, skills: u.skills, status: u.status
      }));

      // 1. Check if route is private (including nested routes)
      const isPrivateRoute = (path: string) => {
        const parts = path.split('/').filter(Boolean);
        return parts.length > 0 && PRIVATE_ROUTES.some(pr => parts[0].toLowerCase() === pr.toLowerCase());
      };

      if (isPrivateRoute(pathname)) {
        isPrivate = true;
        initialData = { ...initialData, isPrivate: true, pageType: 'private' };
      } else if (pathname === '/' || pathname === '') {
        initialData = { ...initialData, pageType: 'home', gigs: PUBLIC_GIGS };
      } else if (pathname === '/gigs') {
        initialData = { ...initialData, pageType: 'gigs', gigs: PUBLIC_GIGS };
      } else if (pathname.startsWith('/categories/')) {
        initialData = { ...initialData, pageType: 'gigs', gigs: PUBLIC_GIGS };
      } else if (['/projects', '/search-projects', '/project-search', '/freelance-jobs'].includes(pathname)) {
        initialData = { ...initialData, pageType: 'projects', projects: projects };
      } else if (['/freelancers', '/search-freelancers', '/freelancer-search'].includes(pathname)) {
        initialData = { ...initialData, pageType: 'freelancers', users: PUBLIC_USERS };
      } else if (pathParts.length === 2 && pathParts[0].toLowerCase() === 'gigs') {
        const gigParam = pathParts[1].toLowerCase();
        const matchedGig = gigs.find(g => g.id.toLowerCase() === gigParam || (g.slug && g.slug.toLowerCase() === gigParam));
        if (matchedGig) {
          initialData = { ...initialData, gig: matchedGig, gigUrl: getGigUrl(matchedGig) };
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 2 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) {
        const usernameParam = pathParts[0].toLowerCase();
        const slugParam = pathParts[1].toLowerCase();

        const matchedGig = gigs.find(g => {
          const gUname = (g.freelancerUsername || slugify(g.freelancerName)).toLowerCase();
          const gSlug = (g.slug || slugify(g.title)).toLowerCase();
          return gUname === usernameParam && gSlug === slugParam;
        });

        if (matchedGig) {
          initialData = { ...initialData, gig: matchedGig, gigUrl: getGigUrl(matchedGig) };
        } else {
          notFound = true;
        }
      } else if (pathParts.length === 1 && !RESERVED_ROUTES.includes(pathParts[0].toLowerCase())) {
        const usernameParam = pathParts[0].toLowerCase();
        const matchedUser = users.find(u => (u.username && u.username.toLowerCase() === usernameParam) || slugify(u.name).toLowerCase() === usernameParam);
        if (matchedUser) {
          initialData = { ...initialData, profileUser: matchedUser };
        } else {
          notFound = true;
        }
      } else {
        notFound = true;
      }

      if (notFound) {
        initialData = { ...initialData, notFound: true };
      }

      let template = '';
      if (!isProd && vite) {
        template = fs.readFileSync(path.resolve(root, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
      } else {
        template = templateHtml;
      }

      // Remove existing head tags
      template = template
        .replace(/<title>.*?<\/title>/gi, '')
        .replace(/<meta\s+name=["']description["'].*?>/gi, '')
        .replace(/<meta\s+name=["']robots["'].*?>/gi, '')
        .replace(/<link\s+rel=["']canonical["'].*?>/gi, '')
        .replace(/<meta\s+property=["']og:.*?["'].*?>/gi, '')
        .replace(/<meta\s+name=["']twitter:.*?["'].*?>/gi, '');

      let renderFn = ssrRender;
      if (!isProd && vite) {
        const mod = await vite.ssrLoadModule('/src/entry-server.tsx');
        renderFn = mod.render;
      }

      const rendered = renderFn ? renderFn(pathname, initialData) : { html: '', head: '' };

      const finalHtml = template
        .replace('</head>', `${rendered.head}\n</head>`)
        .replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>\n<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, '\\u003c')};</script>`);

      const statusCode = notFound ? 404 : 200;
      return res.status(statusCode).set({ 'Content-Type': 'text/html' }).end(finalHtml);

    } catch (e: any) {
      if (!isProd && vite) {
        vite.ssrFixStacktrace(e);
      }
      console.error('SSR Error:', e);
      next(e);
    }
  });
}
