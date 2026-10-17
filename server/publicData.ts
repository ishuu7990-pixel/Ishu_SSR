/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserAccount, Gig, Project } from '../types';

export function isUserPublic(u: any): boolean {
  return u.status === 'active' && u.role !== 'admin' && u.role !== 'super_admin' && !u.isFlagged;
}

export function sanitizePublicUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    title: user.title,
    avatar: user.avatar,
    rating: user.rating,
    reviewsCount: user.reviewsCount,
    hourlyRate: user.hourlyRate,
    skills: user.skills,
    location: user.location,
    countryFlag: user.countryFlag,
    responseTime: user.responseTime,
    category: user.category,
    subcategory: user.subcategory,
    languages: user.languages,
    certifications: user.certifications,
    isAvailableNow: user.isAvailableNow
  };
}

export function isGigPublic(g: Gig): boolean {
  return g.status === 'published' && (!g.moderationStatus || g.moderationStatus === 'approved');
}

export function sanitizePublicGig(g: Gig) {
  const { moderationStatus, moderationNotes, ...publicGig } = g;
  return publicGig;
}

export function isProjectPublic(p: Project): boolean {
  return (p.status === 'open' || p.status === 'published') && (!p.moderationStatus || p.moderationStatus === 'approved');
}

export function sanitizePublicProject(p: Project) {
  const { moderationStatus, moderationNotes, ...publicProject } = p;
  return publicProject;
}
