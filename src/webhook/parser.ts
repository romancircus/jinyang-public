export interface LinearWebhookPayload {
  action: 'create' | 'update';
  type: 'Issue';
  data: {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    state: { name: string };
    labels: { nodes: Array<{ name: string }> };
    project?: { name: string };
    delegate?: { name: string } | null;
  };
  updatedFrom?: {
    delegate?: { name: string } | null;
    labelIds?: string[];
  };
}

/**
 * Normalize labels from different formats:
 * - Real Linear webhooks: labels as flat array [{ id, name }]
 * - GraphQL API / test payloads: labels as { nodes: [{ name }] }
 * - Missing: default to { nodes: [] }
 */
function normalizeLabels(labels: unknown): { nodes: Array<{ name: string }> } {
  if (!labels) {
    return { nodes: [] };
  }

  // Already in { nodes: [...] } format (GraphQL / test payloads)
  if (typeof labels === 'object' && !Array.isArray(labels) && (labels as any).nodes) {
    return labels as { nodes: Array<{ name: string }> };
  }

  // Flat array format (real Linear webhooks)
  if (Array.isArray(labels)) {
    return { nodes: labels.map((l: any) => ({ name: l.name || l })) };
  }

  return { nodes: [] };
}

export function parseLinearPayload(body: any): LinearWebhookPayload {
  return {
    action: body.action || 'unknown',
    type: body.type || 'Issue',
    data: {
      id: body.data?.id || '',
      identifier: body.data?.identifier || '',
      title: body.data?.title || '',
      description: body.data?.description,
      state: body.data?.state || { name: '' },
      labels: normalizeLabels(body.data?.labels),
      project: body.data?.project,
      delegate: body.data?.delegate
    },
    updatedFrom: body.updatedFrom
  };
}
