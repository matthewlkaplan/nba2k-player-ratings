import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

import { BASE_URL } from "./url.js";
import { CURRENT_TEAMS } from "./teams.js";
import { player } from "./player.js";
import { teamNamePrettier } from "./util.js";
import { parse } from "json2csv";

/**
 * Get each team's URL.
 */
function getTeamsUrl(team) {
  return `${BASE_URL}/teams/${team}`;
}

/**
 * Get all player URLs for a team.
 */
async function getPlayersUrlsFromEachTeam(team) {
  let playerUrls = [];
  const teamUrl = getTeamsUrl(team);

  try {
    const response = await axios.get(teamUrl, {
      headers: { "User-Agent": "request" },
    });

    const tbody = cheerio.load(response.data)("tbody");
    const table = tbody[0];
    const entries = cheerio.load(table)(".entry-font");

    for (let entry of entries) {
      const playerUrl = cheerio.load(entry)("a").attr("href");
      if (playerUrl) playerUrls.push(playerUrl);
    }

    return playerUrls.length > 0 ? playerUrls : null;
  } catch (error) {
    console.warn(`Failed to fetch players for team ${team}:`, error.message);
    return null;
  }
}

/**
 * Get each player's attribute details.
 */
async function getPlayerDetail(team, playerUrl) {
  try {
    const response = await axios.get(playerUrl, {
      headers: { "User-Agent": "request" },
    });
    const $ = cheerio.load(response.data);
    const p = new player();

    // Name
    p.name = $("h1").text().trim() || "Unknown";

    // Overall attribute
    p.overallAttribute = parseInt($(".attribute-box-player").text().trim()) || 0;

    // Team
    p.team = team;

    // Attributes list
    const attributes = $(".content .card .card-body .list-no-bullet li .attribute-box");

    const safeInt = (index) =>
      parseInt(attributes[index]?.children[0]?.data?.trim()) || 0;

    // Outside scoring
    p.closeShot = safeInt(0);
    p.midRangeShot = safeInt(1);
    p.threePointShot = safeInt(2);
    p.freeThrow = safeInt(3);
    p.shotIQ = safeInt(4);
    p.offensiveConsistency = safeInt(5);

    // Athleticism
    p.speed = safeInt(6);
    p.agility = safeInt(7);
    p.strength = safeInt(8);
    p.vertical = safeInt(9);
    p.stamina = safeInt(10);
    p.hustle = safeInt(11);
    p.overallDurability = safeInt(12);

    // Inside scoring
    p.layup = safeInt(13);
    p.standingDunk = safeInt(14);
    p.drivingDunk = safeInt(15);
    p.postHook = safeInt(16);
    p.postFade = safeInt(17);
    p.postControl = safeInt(18);
    p.drawFoul = safeInt(19);
    p.hands = safeInt(20);

    // Playmaking
    p.passAccuracy = safeInt(21);
    p.ballHandle = safeInt(22);
    p.speedWithBall = safeInt(23);
    p.passIQ = safeInt(24);
    p.passVision = safeInt(25);

    // Defense
    p.interiorDefense = safeInt(26);
    p.perimeterDefense = safeInt(27);
    p.steal = safeInt(28);
    p.block = safeInt(29);
    p.helpDefenseIQ = safeInt(30);
    p.passPerception = safeInt(31);
    p.defensiveConsistency = safeInt(32);

    // Rebounding
    p.offensiveRebound = safeInt(33);
    p.defensiveRebound = safeInt(34);

    // Badges
    const badgeRawData = $(".badge-count");
    const safeBadge = (i) => parseInt(badgeRawData[i]?.children[0]?.data) || 0;

    p.legendaryBadgeCount = safeBadge(0);
    p.purpleBadgeCount = safeBadge(1);
    p.goldBadgeCount = safeBadge(2);
    p.silverBadgeCount = safeBadge(3);
    p.bronzeBadgeCount = safeBadge(4);
    p.badgeCount = safeBadge(5);

    const parseBadgeTab = (selector) => {
      const text = $(selector).text();
      const match = text.match(/\((\d+)\)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    p.outsideScoringBadgeCount = parseBadgeTab("#pills-outscoring-tab");
    p.insideScoringBadgeCount = parseBadgeTab("#pills-inscoring-tab");
    p.playmakingBadgeCount = parseBadgeTab("#pills-playmaking-tab");
    p.defensiveBadgeCount = parseBadgeTab("#pills-defense-tab");
    p.reboundingBadgeCount = parseBadgeTab("#pills-rebounding-tab");
    p.generalOffenseBadgeCount = parseBadgeTab("#pills-genoffense-tab");
    p.allAroundBadgeCount = parseBadgeTab("#pills-allaround-tab");

    // Height + position
    const header = $(".header-subtitle")[0]?.children || [];
    p.height = header?.[6]?.children?.[1]?.children?.[0]?.data || "N/A";
    p.position = header?.[4]?.children?.[1]?.children?.[0]?.data || "N/A";

    return p;
  } catch (error) {
    console.warn(`Failed to parse player at ${playerUrl}:`, error.message);
    return null;
  }
}

/**
 * Player sorting comparators
 */
function sortPlayersWithTeamGroupBy(a, b) {
  return a.team === b.team ? b.overallAttribute - a.overallAttribute : a.team.localeCompare(b.team);
}

function sortPlayersWithoutTeamGroupBy(a, b) {
  return b.overallAttribute - a.overallAttribute;
}

/**
 * Save data to CSV
 */
function saveData(db, suffix = "team") {
  const today = new Date();
  const csvData = parse(db);
  const filePath = `./data/2kroster_${suffix}_${today.toDateString()}.csv`;

  fs.writeFile(filePath, csvData, (error) => {
    if (!error) console.log(`Saved ${suffix} roster to disk.`);
    else console.log(`Failed to save ${suffix} roster:`, error);
  });
}

/**
 * Main scraper
 */
const main = async function () {
  const teams = CURRENT_TEAMS;
  const roster = new Map();
  const players = [];

  console.log("################ Fetching player URLs ... ################");

  // Fetch player URLs for each team
  await Promise.all(
    teams.map(async (team) => {
      const playerUrls = await getPlayersUrlsFromEachTeam(team);
      if (playerUrls) roster.set(team, playerUrls);
    })
  );

  console.log("################ Fetching player details ... ################");

  // Fetch player details for each team
  for (let team of teams) {
    const playerUrls = roster.get(team) || [];
    const prettiedTeamName = teamNamePrettier(team);

    console.log(`---------- ${prettiedTeamName} ----------`);

    // Fetch all players concurrently for this team
    const teamPlayers = await Promise.all(
      playerUrls.map((url) => getPlayerDetail(prettiedTeamName, url))
    );

    // Add only valid players
    players.push(...teamPlayers.filter((p) => p !== null));
  }

  console.log("################ Saving data to CSV ... ################");

  // Ensure the ./data folder exists
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(".", "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Save all players to a single CSV inside ./data
  const filePath = path.join(dir, "2kroster_latest.csv");
  const { parse } = require("json2csv");
  fs.writeFileSync(filePath, parse(players));

  console.log(`Saved roster to ${filePath}`);
  console.log("Done!");
};



main();
