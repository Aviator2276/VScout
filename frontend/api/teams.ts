import { Team, TeamInfo } from "@/types/team";
import { apiRequest } from "@/utils/api";
import { db } from "@/utils/db";

export class NoCompetitionCodeError extends Error {
  constructor() {
    super("No competition code set");
    this.name = "NoCompetitionCodeError";
  }
}

export class NoTeamNumberError extends Error {
  constructor() {
    super("No team number provided");
    this.name = "NoTeamNumberError";
  }
}

/**
 * Cache teams from API to IndexedDB.
 * Should be called once during app initialization or manually to refresh data.
 * @returns The cached teams
 */
export async function cacheTeams(): Promise<Team[]> {
  const competitionCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!competitionCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    const teams = await apiRequest<Team[]>(
      `/api/competitions/${competitionCode}/teams`,
    );

    // Add competitionCode to each team for indexing
    const teamsWithCompCode = teams.map((team) => ({
      ...team,
      competitionCode,
    }));

    // Clear existing teams for this competition and store new ones
    await db.teams.where("competitionCode").equals(competitionCode).delete();
    await db.teams.bulkPut(teamsWithCompCode);

    return teams;
  } catch (error) {
    console.error("Failed to cache teams:", error);
    throw error;
  }
}

/**
 * Get a team's name by team number from IndexedDB cache.
 * @param teamNumber - The team number to look up
 * @returns The team name or null if not found
 */
export async function getTeamName(teamNumber: number): Promise<string | null> {
  const competitionCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!competitionCode) {
    return null;
  }

  try {
    const team = await db.teams
      .where("[competitionCode+number]")
      .equals([competitionCode, teamNumber])
      .first();

    return team?.name || null;
  } catch (error) {
    console.error("Failed to get team name from cache:", error);
    return null;
  }
}

/**
 * Get all teams for a competition from IndexedDB cache.
 * @returns Array of teams at the competition
 * @throws NoCompetitionCodeError if no competition code is set
 */
export async function getTeams(): Promise<Team[]> {
  const competitionCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!competitionCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    const teams = await db.teams
      .where("competitionCode")
      .equals(competitionCode)
      .toArray();

    return teams;
  } catch (error) {
    console.error("Failed to get teams from cache:", error);
    throw error;
  }
}

/**
 * Cache team info for all teams from API to IndexedDB.
 * Should be called once during app initialization or manually to refresh data.
 * @returns The cached team info array
 */
export async function cacheTeamInfo(): Promise<TeamInfo[]> {
  const competitionCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!competitionCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    // First get all teams to know which team info to fetch
    const teams = await db.teams
      .where("competitionCode")
      .equals(competitionCode)
      .toArray();

    // Fetch team info for all teams (API returns array)
    const teamInfoPromises = teams.map((team) =>
      apiRequest<TeamInfo[]>(
        `/api/team-info?team_number=${team.number}&competition_code=${competitionCode}`,
      ),
    );

    const teamInfoResults = await Promise.allSettled(teamInfoPromises);

    // Filter out failed requests, extract first element from array response, and validate
    const teamInfoArray = teamInfoResults
      .filter(
        (result): result is PromiseFulfilledResult<TeamInfo[]> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value[0])
      .filter(
        (info): info is TeamInfo =>
          info !== undefined &&
          info.team_number !== undefined &&
          info.competition?.code !== undefined,
      )
      .map((info) => ({
        ...info,
        competitionCode,
      }));

    // Clear existing team info for this competition and store new ones
    await db.teamInfo.where("competitionCode").equals(competitionCode).delete();
    if (teamInfoArray.length > 0) {
      await db.teamInfo.bulkPut(teamInfoArray);
      console.log("Successfully stored team info");
    } else {
      console.log("No valid team info to store");
    }

    return teamInfoArray;
  } catch (error) {
    console.error("Failed to cache team info:", error);
    throw error;
  }
}

/**
 * Get all team info for a competition from IndexedDB cache.
 * @returns Array of team info sorted by rank
 * @throws NoCompetitionCodeError if no competition code is set
 */
export async function getAllTeamInfo(): Promise<TeamInfo[]> {
  const competitionCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!competitionCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    const teamInfo = await db.teamInfo
      .where("competitionCode")
      .equals(competitionCode)
      .toArray();

    return teamInfo.sort((a, b) => a.rank - b.rank);
  } catch (error) {
    console.error("Failed to get all team info from cache:", error);
    throw error;
  }
}

/**
 * Get detailed information for a specific team at a competition from IndexedDB cache.
 * @param teamNumber - The team number to get info for
 * @param competitionCode - Optional competition code (uses stored code if not provided)
 * @returns Detailed team information including stats
 * @throws NoTeamNumberError if no team number is provided
 * @throws NoCompetitionCodeError if no competition code is set or provided
 */
export async function getTeamInfo(
  teamNumber: number,
  competitionCode?: string,
): Promise<TeamInfo | undefined> {
  if (!teamNumber) {
    throw new NoTeamNumberError();
  }

  let compCode = competitionCode;

  if (!compCode) {
    compCode = (await db.config.get({ key: "compCode" }))?.value;
  }

  if (!compCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    const teamInfo = await db.teamInfo
      .where("[competitionCode+team_number]")
      .equals([compCode, teamNumber])
      .first();

    return teamInfo;
  } catch (error) {
    console.error("Failed to get team info from cache:", error);
    throw error;
  }
}
