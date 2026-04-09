import { TeamComment } from '@/types/team';
import { apiRequest } from '@/utils/api';
import { db } from '@/utils/db';

/**
 * Fetch all comments for a team from the server and cache locally.
 */
export async function fetchTeamComments(
  teamNumber: number,
): Promise<TeamComment[]> {
  const comments = await apiRequest<TeamComment[]>(
    `/api/teams/${teamNumber}/comments`,
  );

  // Sync local cache: clear existing and store fresh
  await db.teamComments.where('team_number').equals(teamNumber).delete();
  if (comments.length > 0) {
    await db.teamComments.bulkPut(comments);
  }

  return comments;
}

/**
 * Get cached comments for a team from IndexedDB.
 */
export async function getCachedTeamComments(
  teamNumber: number,
): Promise<TeamComment[]> {
  return db.teamComments
    .where('team_number')
    .equals(teamNumber)
    .sortBy('created_at');
}

/**
 * Create a new comment for a team via the API, then cache it locally.
 */
export async function createTeamComment(
  teamNumber: number,
  comment: string,
): Promise<TeamComment> {
  const created = await apiRequest<TeamComment>(
    `/api/teams/${teamNumber}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ comment }),
    },
  );

  await db.teamComments.put(created);
  return created;
}

/**
 * Delete a comment by ID via the API and remove from local cache.
 */
export async function deleteTeamComment(
  teamNumber: number,
  commentId: number,
): Promise<void> {
  await apiRequest(`/api/teams/${teamNumber}/comments/${commentId}`, {
    method: 'DELETE',
  });

  await db.teamComments.delete(commentId);
}
