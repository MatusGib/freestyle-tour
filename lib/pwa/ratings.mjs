// Glicko-2 ratings over the events in date order, each event one rating period
// per division. Gives each rider's rating going into every event they entered,
// and how well those ratings predicted ladder heats.
import { newRider, ratePeriod, winChance } from "./glicko.mjs";
import { byText } from "./riders.mjs";

export const TUNING = { tau: [0.3, 0.5, 0.75, 1.0], newcomerRating: [1300, 1400, 1500], placingsWeight: [2, 4, 6] };
export const TUNE_SEASONS = [2014, 2021];
export const CHECK_SEASONS = [2022, 2026];
export const BAR = 0.65;

// Who beat whom in one division of an event: [{ winner, loser, weight, heat }].
// Ladder heats give games of weight 1, leaving out heats with an unmatched
// sailor. Without any, the final places give a game for every pair with
// different places, weighted so each rider's event counts like placingsWeight heats.
export function gamesFor(division, placingsWeight) {
  const games = [];
  for (const ladder of division.ladders) {
    for (const round of ladder.rounds) {
      for (const { riders, ranks } of round) {
        if (riders.some((r) => typeof r !== "string")) continue;
        riders.forEach((winner, i) => riders.forEach((loser, j) => {
          if (ranks[i] < ranks[j]) games.push({ winner, loser, weight: 1, heat: true });
        }));
      }
    }
  }
  if (games.length) return games;
  const { entries } = division;
  const weight = placingsWeight / (entries.length - 1);
  for (const a of entries) for (const b of entries) if (a.place < b.place) games.push({ winner: a.rider, loser: b.rider, weight, heat: false });
  return games;
}

// Runs the periods. events must be in date order (as resolveEvents returns
// them). Returns before[eventId][division] as a Map from rider id to rating,
// and one prediction per ladder game: the chance its winner was given.
export function runRatings(events, { tau, newcomerRating, placingsWeight }) {
  const current = { men: new Map(), women: new Map() };
  const before = {};
  const predictions = [];
  for (const event of events) {
    before[event.id] = {};
    for (const [name, division] of Object.entries(event.divisions)) {
      const ratings = current[name];
      const entering = new Map(division.entries.map((e) => [e.rider, ratings.get(e.rider) ?? newRider(newcomerRating)]));
      before[event.id][name] = entering;
      const played = new Map([...entering.keys()].map((id) => [id, []]));
      for (const game of gamesFor(division, placingsWeight)) {
        const winner = entering.get(game.winner);
        const loser = entering.get(game.loser);
        if (game.heat) predictions.push({ season: event.season, p: winChance(winner, loser) });
        played.get(game.winner).push({ opponent: loser, score: 1, weight: game.weight });
        played.get(game.loser).push({ opponent: winner, score: 0, weight: game.weight });
      }
      for (const [id, rider] of ratings) if (!entering.has(id)) ratings.set(id, ratePeriod(rider, [], tau));
      for (const [id, rider] of entering) ratings.set(id, ratePeriod(rider, played.get(id), tau));
    }
  }
  return { before, predictions };
}

// The predictions of the seasons from–to: how many, the share the favourite
// won (an even chance counts as half), and the mean log loss.
export function scorePredictions(predictions, [from, to]) {
  const chosen = predictions.filter((p) => p.season >= from && p.season <= to);
  if (!chosen.length) return { heats: 0, hitRate: 0, logLoss: 0 };
  const hits = chosen.reduce((sum, { p }) => sum + (p > 0.5 ? 1 : p === 0.5 ? 0.5 : 0), 0);
  const loss = chosen.reduce((sum, { p }) => sum - Math.log(p), 0);
  return { heats: chosen.length, hitRate: hits / chosen.length, logLoss: loss / chosen.length };
}

// The settings with the lowest log loss on the tuning seasons; ties go to the
// first in TUNING order.
export function tune(events) {
  let best = null;
  for (const tau of TUNING.tau) {
    for (const newcomerRating of TUNING.newcomerRating) {
      for (const placingsWeight of TUNING.placingsWeight) {
        const settings = { tau, newcomerRating, placingsWeight };
        const { logLoss } = scorePredictions(runRatings(events, settings).predictions, TUNE_SEASONS);
        if (!best || logLoss < best.logLoss) best = { settings, logLoss };
      }
    }
  }
  return best.settings;
}

const round = (value, digits) => Number(value.toFixed(digits));

// What goes into tour/ratings.json.
export function buildRatings(events) {
  const settings = tune(events);
  const { before, predictions } = runRatings(events, settings);
  const check = scorePredictions(predictions, CHECK_SEASONS);
  const out = {};
  for (const [eventId, divisions] of Object.entries(before)) {
    out[eventId] = {};
    for (const [name, ratings] of Object.entries(divisions)) {
      const ids = [...ratings.keys()].sort(byText);
      out[eventId][name] = Object.fromEntries(ids.map((id) => {
        const r = ratings.get(id);
        return [id, { rating: round(r.rating, 2), rd: round(r.rd, 2), volatility: round(r.volatility, 6) }];
      }));
    }
  }
  return { settings, check: { heats: check.heats, hitRate: round(check.hitRate, 4), logLoss: round(check.logLoss, 4) }, events: out };
}
