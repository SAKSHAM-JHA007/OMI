import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolResult } from '../types';

export const fetchPageTool: AgentTool = {
  name: 'fetch_page',
  description: 'Fetch and extract the readable text content of an allowlisted web page URL for research and citation.',
  schema: z.object({
    url: z.string().url().describe('The absolute URL of the web page to fetch'),
  }),
  risk: 'read',
  returnsTrust: 'untrusted',
  timeoutMs: 15000, // 15s per PRD §5
  idempotent: true,
  async execute(args: { url: string }, ctx: ToolExecutionContext): Promise<ToolResult> {
    // PRD §7.3 Outbound allowlist for fetches:
    // fetch_page ONLY accepts URLs returned by web_search in the same run, or URLs the user typed.
    // Model-constructed URLs are rejected. This single rule closes query-string exfiltration.
    const isAllowlisted = ctx.allowedUrls.has(args.url) ||
      Array.from(ctx.allowedUrls).some((allowed) => {
        try {
          const u1 = new URL(allowed);
          const u2 = new URL(args.url);
          return u1.origin === u2.origin && u1.pathname === u2.pathname;
        } catch {
          return false;
        }
      });

    if (!isAllowlisted) {
      return {
        ok: false,
        error: 'REFUSED',
        message: `Security block: URL "${args.url}" is not on the outbound allowlist for this run. Only URLs discovered via search or provided directly by the user may be fetched.`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(args.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,text/plain',
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return {
          ok: false,
          error: 'TOOL_UNAVAILABLE',
          message: `Failed to fetch page. HTTP status: ${res.status}`,
        };
      }

      const rawHtml = await res.text();

      // PRD §7.3 Sanitization: Strip scripts, styles, comments, and injection markers
      let sanitized = rawHtml
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '') // remove HTML comments where prompt injections hide
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();

      // PRD §7.3 Structural separation: Delimiters stripped before wrapping
      sanitized = sanitized.replace(/`{3,}/g, "'''");

      // Truncate to reasonable context length (max ~8000 chars)
      if (sanitized.length > 8000) {
        sanitized = sanitized.slice(0, 8000) + '... [truncated]';
      }

      return {
        ok: true,
        data: {
          url: args.url,
          text: sanitized,
          fetchedAt: new Date().toISOString(),
        },
        trust: 'untrusted',
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        return { ok: false, error: 'TOOL_TIMEOUT', message: 'Page fetch timed out after 15s.' };
      }
      return { ok: false, error: 'TOOL_UNAVAILABLE', message: err.message || 'Page fetch failed.' };
    }
  },
};
