import { useMemo } from 'react';
import { WorkstreamItem, WorkstreamFilter, WORKSTREAM_TAB_STATUSES } from '../../components/workstream/types';
import { Project } from '../../types';

export interface UseWorkstreamFiltersProps {
  hydratedWorkstreamItems?: WorkstreamItem[];
  workstreamTab?: WorkstreamFilter;
  starredWorkstreams?: string[];
  selectedPersonFilter?: string | null;
  projectFilterSearch?: string;
  workstreamSearch?: string;
  projects?: Project[];
}

/**
 * Hook responsible for filtering hydrated workstream items based on the active
 * tab, starred status, person filter, project filter search, and keyword search.
 */
export function useWorkstreamFilters({
  hydratedWorkstreamItems = [],
  workstreamTab = 'all',
  starredWorkstreams = [],
  selectedPersonFilter = null,
  projectFilterSearch = '',
  workstreamSearch = '',
  projects = []
}: UseWorkstreamFiltersProps = {}) {
  const filteredWorkstreamItems: WorkstreamItem[] = useMemo(() => {
    // If projectFilterSearch is a project ID, find the corresponding project title
    const selectedProject = projects.find(p => p.id === projectFilterSearch || p.id.toLowerCase() === projectFilterSearch.toLowerCase());
    const targetProjectTitle = selectedProject?.title.toLowerCase();

    return hydratedWorkstreamItems.filter(w => {
      // Tab filter
      if (workstreamTab === 'inbox' && !(WORKSTREAM_TAB_STATUSES.inbox as readonly string[]).includes(w.status)) return false;
      if (workstreamTab === 'in_progress' && !(WORKSTREAM_TAB_STATUSES.in_progress as readonly string[]).includes(w.status)) return false;
      if (workstreamTab === 'delivered' && !(WORKSTREAM_TAB_STATUSES.delivered as readonly string[]).includes(w.status)) return false;
      if (workstreamTab === 'completed' && !(WORKSTREAM_TAB_STATUSES.completed as readonly string[]).includes(w.status)) return false;
      if (workstreamTab === 'starred' && !starredWorkstreams.includes(w.id)) return false;
      if (workstreamTab === 'escrow' && (w.amount <= 0 || w.status === 'cancelled' || w.status === 'completed')) return false;
      if (workstreamTab === 'archived' && !(WORKSTREAM_TAB_STATUSES.archived as readonly string[]).includes(w.status)) return false;

      // Person filter
      if (selectedPersonFilter && w.sellerId !== selectedPersonFilter && w.buyerId !== selectedPersonFilter) return false;

      // Project filter: match against w.projectId, w.title, w.serviceTitle, or the selected project's title
      if (projectFilterSearch) {
        const pf = projectFilterSearch.toLowerCase();
        const matchesProjectId = Boolean(w.projectId && (w.projectId === projectFilterSearch || w.projectId.toLowerCase() === pf));
        const matchesTitle = w.title.toLowerCase().includes(pf);
        const matchesServiceTitle = Boolean((w as any).serviceTitle && (w as any).serviceTitle.toLowerCase().includes(pf));
        const matchesProjectTitle = Boolean(targetProjectTitle && (w.title.toLowerCase().includes(targetProjectTitle) || (w as any).serviceTitle?.toLowerCase().includes(targetProjectTitle)));

        if (!matchesProjectId && !matchesTitle && !matchesServiceTitle && !matchesProjectTitle) return false;
      }

      // 18: Search query - Expand search to include metadata, buyer/seller name, and potential message preview content
      if (workstreamSearch) {
        const q = workstreamSearch.toLowerCase();
        const matchesTitle = w.title.toLowerCase().includes(q);
        const matchesId = w.id.toLowerCase().includes(q);
        const matchesSeller = w.seller?.name.toLowerCase().includes(q);
        const matchesBuyer = w.buyer?.name.toLowerCase().includes(q);
        const matchesMetadata = (w.requirements || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesId && !matchesSeller && !matchesBuyer && !matchesMetadata) return false;
      }

      return true;
    });
  }, [hydratedWorkstreamItems, workstreamTab, starredWorkstreams, selectedPersonFilter, projectFilterSearch, workstreamSearch, projects]);

  return {
    filteredWorkstreamItems
  };
}
