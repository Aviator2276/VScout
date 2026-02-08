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
    const apiTeamInfoArray = teamInfoResults
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
      );

    // Get existing team info to preserve prescout data
    const existingTeamInfo = await db.teamInfo
      .where("competitionCode")
      .equals(competitionCode)
      .toArray();

    // Create a map of existing prescout data by team number
    const existingPrescoutMap = new Map(
      existingTeamInfo.map((info) => [info.team_number, {
        prescout_drivetrain: info.prescout_drivetrain,
        prescout_hopper_size: info.prescout_hopper_size,
        prescout_intake_type: info.prescout_intake_type,
        prescout_rotate_yaw: info.prescout_rotate_yaw,
        prescout_rotate_pitch: info.prescout_rotate_pitch,
        prescout_range: info.prescout_range,
        prescout_additional_comments: info.prescout_additional_comments,
        picture: info.picture,
      }])
    );

    // Merge API data with existing prescout data
    const teamInfoArray = apiTeamInfoArray.map((info) => {
      const existingPrescout = existingPrescoutMap.get(info.team_number);
      return {
        ...info,
        competitionCode,
        // Preserve existing prescout data if API returns null/empty
        prescout_drivetrain: info.prescout_drivetrain || existingPrescout?.prescout_drivetrain || "",
        prescout_hopper_size: info.prescout_hopper_size || existingPrescout?.prescout_hopper_size || 0,
        prescout_intake_type: info.prescout_intake_type || existingPrescout?.prescout_intake_type || "",
        prescout_rotate_yaw: info.prescout_rotate_yaw ?? existingPrescout?.prescout_rotate_yaw ?? false,
        prescout_rotate_pitch: info.prescout_rotate_pitch ?? existingPrescout?.prescout_rotate_pitch ?? false,
        prescout_range: info.prescout_range || existingPrescout?.prescout_range || "",
        prescout_additional_comments: info.prescout_additional_comments || existingPrescout?.prescout_additional_comments || "",
        picture: info.picture || existingPrescout?.picture || "",
      };
    });

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
 * Update prescout data for a specific team in IndexedDB.
 * @param teamNumber - The team number to update
 * @param prescoutData - The prescout data to save
 * @returns The updated team info
 */
export async function updateTeamPrescout(
  teamNumber: number,
  prescoutData: {
    prescout_drivetrain: string;
    prescout_hopper_size: number;
    prescout_intake_type: string;
    prescout_rotate_yaw: boolean;
    prescout_rotate_pitch: boolean;
    prescout_range: string;
    prescout_additional_comments: string;
    picture: string;
  },
): Promise<TeamInfo | undefined> {
  if (!teamNumber) {
    throw new NoTeamNumberError();
  }

  const compCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!compCode) {
    throw new NoCompetitionCodeError();
  }

  try {
    const existingTeamInfo = await db.teamInfo
      .where("[competitionCode+team_number]")
      .equals([compCode, teamNumber])
      .first();

    if (!existingTeamInfo) {
      console.error("Team info not found for team:", teamNumber);
      return undefined;
    }

    const updatedTeamInfo = {
      ...existingTeamInfo,
      ...prescoutData,
    };

    await db.teamInfo.put(updatedTeamInfo);

    return updatedTeamInfo;
  } catch (error) {
    console.error("Failed to update team prescout data:", error);
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

export interface PrescoutData {
  prescout_drivetrain: string;
  prescout_hopper_size: number;
  prescout_intake_type: string;
  prescout_rotate_yaw: boolean;
  prescout_rotate_pitch: boolean;
  prescout_range: string;
  prescout_additional_comments: string;
}

/**
 * Upload prescout data to the server via PATCH request.
 * @param teamNumber The team number to update
 * @param prescoutData The prescout data to upload
 * @returns The response from the server
 */
export async function uploadPrescout(
  teamNumber: number,
  prescoutData: PrescoutData,
): Promise<void> {
  const compCode = (await db.config.get({ key: "compCode" }))?.value;

  if (!compCode) {
    throw new NoCompetitionCodeError();
  }

  if (!teamNumber) {
    throw new NoTeamNumberError();
  }

  try {
    await apiRequest(
      `/api/team-info/prescouting?competition_code=${encodeURIComponent(compCode)}&team_number=${teamNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify(prescoutData),
      },
    );
  } catch (error) {
    console.error("Failed to upload prescout data:", error);
    throw error;
  }
}
