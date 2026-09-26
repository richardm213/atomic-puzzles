export type AtomicChessLeagueRoundResult = {
  result: "Win" | "Loss";
  score: string;
};

export type AtomicChessLeagueTeam = {
  rank: number;
  name: string;
  captain: string;
  players: readonly string[];
  wins: number;
  rounds: readonly AtomicChessLeagueRoundResult[];
};

export type AtomicChessLeagueDivision = {
  id: "elite" | "challenger";
  name: string;
  teams: readonly AtomicChessLeagueTeam[];
};

export type AtomicChessLeagueSeason = {
  number: 1 | 2;
  year: number;
  dates: string;
  boardCount: number;
  timeControls: readonly string[];
  scoring: string;
  resultsUrl: string;
  teamsUrl: string;
  divisions: readonly AtomicChessLeagueDivision[];
};

const result = (resultValue: "Win" | "Loss", score: string): AtomicChessLeagueRoundResult => ({
  result: resultValue,
  score,
});

export const atomicChessLeagueSeasons: readonly AtomicChessLeagueSeason[] = [
  {
    number: 2,
    year: 2026,
    dates: "February–March 2026",
    boardCount: 5,
    timeControls: ["3+2", "3+0", "1+2", "1+0", "½+0"],
    scoring: "Team matches were decided by average game win rate across five boards.",
    resultsUrl:
      "https://lichess.org/@/HowlinD/blog/results-of-the-atomic-chess-league-season-2/7gpFMA6k",
    teamsUrl:
      "https://lichess.org/forum/team-the-atomic-chess-league/acl-season-2-registration?page=8",
    divisions: [
      {
        id: "elite",
        name: "Elite League",
        teams: [
          {
            rank: 1,
            name: "Hyper Addicts",
            captain: "JakeStateFarm",
            players: ["JakeStateFarm", "RKROUNIT", "Maracker", "StUdIeB"],
            wins: 3,
            rounds: [result("Win", "52%"), result("Win", "61%"), result("Win", "61%")],
          },
          {
            rank: 2,
            name: "The JBTEAM",
            captain: "JudeBaeTorrens",
            players: ["JudeBaeTorrens", "HowlinD", "arinor0109", "AtomicBlunder"],
            wins: 2,
            rounds: [result("Win", "61%"), result("Loss", "39%"), result("Win", "52%")],
          },
          {
            rank: 3,
            name: "Natso and random 2200s",
            captain: "Natso",
            players: ["Natso", "Rechesster", "Quasabianth", "StinkyPotato"],
            wins: 1,
            rounds: [result("Loss", "39%"), result("Win", "56%"), result("Loss", "39%")],
          },
          {
            rank: 4,
            name: "Team Death",
            captain: "MaxwellsSilvrHammer",
            players: ["MaxwellsSilvrHammer", "NitroColoraze", "sircachetes", "RabbieR"],
            wins: 0,
            rounds: [result("Loss", "48%"), result("Loss", "44%"), result("Loss", "48%")],
          },
        ],
      },
      {
        id: "challenger",
        name: "Challenger League",
        teams: [
          {
            rank: 1,
            name: "Orca",
            captain: "Orcinus_Orca",
            players: [
              "Orcinus_Orca",
              "AbsolutelyTrash",
              "KNIGHTBLADE_123",
              "MarcoTheTiger",
              "F55555",
              "I-WIN-00",
            ],
            wins: 3,
            rounds: [result("Win", "51%"), result("Win", "55%"), result("Win", "54%")],
          },
          {
            rank: 2,
            name: "Atomic Storm",
            captain: "cycl1one",
            players: [
              "cycl1one",
              "imjustanotherbot",
              "RaviharaV",
              "gage12",
              "BobbyOppenheimer1945",
            ],
            wins: 2,
            rounds: [result("Win", "57%"), result("Loss", "45%"), result("Win", "54%")],
          },
          {
            rank: 3,
            name: "Pythons",
            captain: "ArjanZS",
            players: ["ArjanZS", "T-R-I-D-E-N-T", "BlackJack84", "JuanC95", "BoldyNeutral"],
            wins: 1,
            rounds: [result("Loss", "43%"), result("Win", "55%"), result("Loss", "46%")],
          },
          {
            rank: 4,
            name: "Team Cowboy",
            captain: "DanDan2016",
            players: ["DanDan2016", "JanMeLons", "StealYourKidney", "francothefalcon", "accaesar"],
            wins: 0,
            rounds: [result("Loss", "49%"), result("Loss", "45%"), result("Loss", "46%")],
          },
        ],
      },
    ],
  },
  {
    number: 1,
    year: 2025,
    dates: "July–August 2025",
    boardCount: 4,
    timeControls: ["3+2", "3+0", "1+0", "½+0"],
    scoring: "Each board counted as a win, draw, or loss; a 2–2 team tie used game win rate.",
    resultsUrl:
      "https://lichess.org/@/HowlinD/blog/results-of-the-atomic-chess-league-season-1/diOodYbX",
    teamsUrl: "https://lichess.org/forum/team-the-atomic-chess-league/atomic-league-season-1",
    divisions: [
      {
        id: "elite",
        name: "Elite League",
        teams: [
          {
            rank: 1,
            name: "Team NeverofZero / Natso",
            captain: "Natso",
            players: ["NeverofZero", "Natso", "Rechesster", "RKROUNIT"],
            wins: 3,
            rounds: [result("Win", "4–0"), result("Win", "2–2 TB"), result("Win", "3–1")],
          },
          {
            rank: 2,
            name: "Team Ihatespammers",
            captain: "ihatespammers",
            players: ["ihatespammers", "rabidknight", "RookGameStrategy", "JudeBaeTorrens"],
            wins: 2,
            rounds: [result("Win", "3–1"), result("Loss", "2–2 TB"), result("Win", "2½–1½")],
          },
          {
            rank: 3,
            name: "Team Wolfram_EP",
            captain: "Wolfram_EP",
            players: ["Wolfram_EP", "TAiSThuban", "Statham_13", "Maracker"],
            wins: 1,
            rounds: [result("Loss", "1–3"), result("Win", "4–0"), result("Loss", "1–3")],
          },
          {
            rank: 4,
            name: "Team RandoomPlayer",
            captain: "RandoomPlayer",
            players: ["RandoomPlayer", "HowlinD", "MaxwellsSilvrHammer", "JakeStateFarm"],
            wins: 0,
            rounds: [result("Loss", "0–4"), result("Loss", "0–4"), result("Loss", "1½–2½")],
          },
        ],
      },
      {
        id: "challenger",
        name: "Challenger League",
        teams: [
          {
            rank: 1,
            name: "Team RabbieR",
            captain: "RabbieR",
            players: ["RabbieR", "DanDan2016", "StUdIeB", "bercerk_atim", "Jmilie"],
            wins: 3,
            rounds: [result("Win", "2½–1½"), result("Win", "3–1"), result("Win", "3–1")],
          },
          {
            rank: 2,
            name: "Team ekulxam",
            captain: "ekulxam",
            players: ["seaside_tiramisu", "ekulxam", "StealYourKidney", "mike-bear", "JurrYan"],
            wins: 2,
            rounds: [result("Win", "2½–1½"), result("Loss", "1–3"), result("Win", "2–2 TB")],
          },
          {
            rank: 3,
            name: "Team F55555",
            captain: "F55555",
            players: ["F55555", "puddingbirne", "milky_way12", "fettuccini", "fji-467"],
            wins: 1,
            rounds: [result("Loss", "1½–2½"), result("Win", "2–2 TB"), result("Loss", "2–2 TB")],
          },
          {
            rank: 4,
            name: "Team average200",
            captain: "average200",
            players: [
              "timetoplayatomic",
              "bijiy",
              "average200",
              "sircachetes",
              "always_play_atomic",
            ],
            wins: 0,
            rounds: [result("Loss", "1½–2½"), result("Loss", "2–2 TB"), result("Loss", "1–3")],
          },
        ],
      },
    ],
  },
];

export const getAtomicChessLeagueSeason = (seasonNumber: number): AtomicChessLeagueSeason =>
  atomicChessLeagueSeasons.find((season) => season.number === seasonNumber) ??
  atomicChessLeagueSeasons[0]!;
