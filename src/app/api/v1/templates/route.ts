// ============================================================
// GET /api/v1/templates — list WhatsApp message templates
// (scope: templates:read)
//
// Lets an external caller (e.g. the Salon Billing app's Follow-ups
// "sync templates" button) discover which approved templates it can
// send by name via POST /api/v1/messages, without ever touching the
// dashboard. Defaults to APPROVED-only, since a PENDING/REJECTED
// template can't actually be sent - pass `?status=all` to see
// everything (useful for debugging why a template isn't showing up).
//
// The response spells out each template's variable shape (body
// variable count, header variable info, per-button URL variables) so
// a caller can build a "fill in the blanks" UI without having to
// parse `{{n}}` placeholders itself.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import type { MessageTemplate, TemplateButton } from '@/types';

function serializeButton(button: TemplateButton) {
  const base = { type: button.type, text: button.text };
  if (button.type === 'URL') {
    return {
      ...base,
      url: button.url,
      variable_count: extractVariableIndices(button.url).length,
    };
  }
  if (button.type === 'COPY_CODE') {
    return { ...base, example: button.example };
  }
  if (button.type === 'PHONE_NUMBER') {
    return { ...base, phone_number: button.phone_number };
  }
  return base;
}

function serializeTemplate(row: MessageTemplate) {
  const headerVarCount =
    row.header_type === 'text' && row.header_content
      ? extractVariableIndices(row.header_content).length
      : 0;

  return {
    id: row.id,
    name: row.name,
    language: row.language || 'en_US',
    category: row.category,
    status: row.status || 'DRAFT',
    body_text: row.body_text,
    body_variable_count: extractVariableIndices(row.body_text).length,
    header:
      row.header_type
        ? {
            type: row.header_type,
            content: row.header_type === 'text' ? row.header_content : undefined,
            variable_count: headerVarCount,
          }
        : null,
    footer_text: row.footer_text || null,
    buttons: (row.buttons || []).map(serializeButton),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'templates:read');
    const url = new URL(request.url);
    const statusParam = (url.searchParams.get('status') || 'approved').toLowerCase();

    let query = ctx.supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('name', { ascending: true });

    if (statusParam !== 'all') {
      query = query.eq('status', 'APPROVED');
    }

    const { data, error } = await query;
    if (error) {
      console.error('[api/v1/templates] list error:', error);
      return fail('internal', 'Failed to list templates', 500);
    }

    return ok((data ?? []).map((row) => serializeTemplate(row as MessageTemplate)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
