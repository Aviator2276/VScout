import { db } from '@/utils/db';
import { TeamComment } from '@/types/team';

/**
 * Tag definition for extracting structured data from comments.
 * Add new entries to COMMENT_TAGS to support additional tag types.
 */
interface CommentTagDef {
  /** The prefix used in comments, e.g. "TTFF" for "TTFF=1:50" */
  key: string;
  /** Human-readable label */
  label: string;
  /**
   * Parse the raw value string after the "=" sign.
   * Return the normalized string to store, or null if invalid.
   */
  parse: (raw: string) => string | null;
}

/**
 * Parse a time value in seconds:milliseconds format (e.g. "1:50" -> "1:50").
 * Accepts s:ms, s.ms, or plain number (treated as seconds).
 */
function parseTime(raw: string): string | null {
  const trimmed = raw.trim();
  // Format: s:ms or s.ms
  const colonMatch = trimmed.match(/^(\d+)[:\.](\d+)$/);
  if (colonMatch) {
    const seconds = parseInt(colonMatch[1], 10);
    const ms = colonMatch[2].padEnd(2, '0').substring(0, 2);
    return `${seconds}:${ms}`;
  }
  // Plain number (seconds only)
  const plainMatch = trimmed.match(/^(\d+)$/);
  if (plainMatch) {
    return `${plainMatch[1]}:00`;
  }
  return null;
}

// ──────────────────────────────────────────────────────
// TAG REGISTRY — add new tags here
// ──────────────────────────────────────────────────────
export const COMMENT_TAGS: CommentTagDef[] = [
  {
    key: 'TTFF',
    label: 'Time to First Fuel',
    parse: parseTime,
  },
  {
    key: 'TTCL',
    label: 'Time to Center Line',
    parse: parseTime,
  },
];

/**
 * Build a case-insensitive regex that matches all registered tag keys.
 * Captures: (TAG_KEY)=(VALUE)
 * VALUE runs until the next whitespace, comma, or end of string.
 */
function buildTagRegex(): RegExp {
  const keys = COMMENT_TAGS.map((t) => t.key).join('|');
  return new RegExp(`(${keys})\\s*=\\s*([^\\s,]+)`, 'gi');
}

/**
 * Extract all recognised tags from a single comment string.
 * Returns a map of tag key -> parsed value.
 * If a tag appears multiple times, the last occurrence wins.
 */
export function extractTagsFromComment(
  text: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = buildTagRegex();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawKey = match[1].toUpperCase();
    const rawValue = match[2];
    const def = COMMENT_TAGS.find((t) => t.key === rawKey);
    if (!def) continue;
    const parsed = def.parse(rawValue);
    if (parsed !== null) {
      result[rawKey] = parsed;
    }
  }

  return result;
}

/**
 * Extract tags from an array of comments.
 * Later comments override earlier ones for the same tag key,
 * giving the most recent value priority.
 */
export function extractTagsFromComments(
  comments: TeamComment[],
): Record<string, string> {
  const sorted = [...comments].sort((a, b) => a.created_at - b.created_at);
  const merged: Record<string, string> = {};
  for (const comment of sorted) {
    const tags = extractTagsFromComment(comment.comment);
    Object.assign(merged, tags);
  }
  return merged;
}

/**
 * Recompute comment tags for a single team and persist to teamInfo.
 * Call this after comments are added, downloaded, or on screen load.
 */
export async function updateCommentTagsForTeam(
  teamNumber: number,
): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  const existing = await db.teamInfo.get([compCode, teamNumber]);
  if (!existing) return;

  const comments = await db.teamComments
    .where('team_number')
    .equals(teamNumber)
    .sortBy('created_at');

  const tags = extractTagsFromComments(comments);
  await db.teamInfo.put({ ...existing, comment_tags: tags });
}

/**
 * Recompute comment tags for ALL teams in the current competition.
 * Intended to be called during the data-refresh cycle.
 */
export async function updateAllCommentTags(): Promise<void> {
  const compCode = (await db.config.get({ key: 'compCode' }))?.value;
  if (!compCode) return;

  const allComments = await db.teamComments.toArray();
  if (allComments.length === 0) return;

  // Group comments by team number
  const byTeam = new Map<number, TeamComment[]>();
  for (const c of allComments) {
    const arr = byTeam.get(c.team_number) || [];
    arr.push(c);
    byTeam.set(c.team_number, arr);
  }

  for (const [teamNumber, comments] of byTeam) {
    const existing = await db.teamInfo.get([compCode, teamNumber]);
    if (!existing) continue;

    const tags = extractTagsFromComments(comments);
    await db.teamInfo.put({ ...existing, comment_tags: tags });
  }

  console.log(`Comment tags updated for ${byTeam.size} teams`);
}
