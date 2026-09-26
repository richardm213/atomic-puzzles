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

export type AtomicChessLeagueBoardMatch = {
  timeControl: string;
  player1: string;
  player2: string;
  score1: string;
  score2: string;
  matchId?: string;
  status?: "declared" | "forfeit" | "unplayed" | "unarchived";
};

export type AtomicChessLeagueTeamMatch = {
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  tiebreak: boolean;
  boards: readonly AtomicChessLeagueBoardMatch[];
};

export type AtomicChessLeagueRound = {
  number: 1 | 2 | 3;
  matchups: readonly AtomicChessLeagueTeamMatch[];
};

export type AtomicChessLeagueDivision = {
  id: "elite" | "challenger";
  name: string;
  teams: readonly AtomicChessLeagueTeam[];
  rounds: readonly AtomicChessLeagueRound[];
};

export type AtomicChessLeagueSeason = {
  number: 1 | 2;
  year: number;
  startDate: string;
  endDate: string;
  boardCount: number;
  timeControls: readonly string[];
  resultsUrl: string;
  teamsUrl: string;
  divisions: readonly AtomicChessLeagueDivision[];
};

const aclMainAliases: Readonly<Record<string, string>> = {
  chrissical: "judebaetorrens",
  nitrocoloraze: "lesha2002",
  rookgamestrategy: "opabinia",
  taisthuban: "thuban",
  timetoplayatomic: "quasabianth",
};

export const getAtomicChessLeaguePlayerName = (player: string): string => {
  const normalized = player.trim().toLowerCase();
  return aclMainAliases[normalized] ?? normalized;
};

const result = (resultValue: "Win" | "Loss", score: string): AtomicChessLeagueRoundResult => ({
  result: resultValue,
  score,
});

const aclRoundData: Readonly<Record<string, readonly AtomicChessLeagueRound[]>> = {
  "2-elite": [
    {
      number: 1,
      matchups: [
        {
          team1: "Natso and random 2200s",
          team2: "The JBTEAM",
          score1: "39%",
          score2: "61%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "stinkypotato",
              player2: "JudeBaeTorrens",
              score1: "1",
              score2: "5",
              matchId: "4hYonO6j",
            },
            {
              timeControl: "3+0",
              player1: "Natso",
              player2: "HowlinD",
              score1: "5.5",
              score2: "2.5",
              status: "unarchived",
            },
            {
              timeControl: "1+0",
              player1: "Rechesster",
              player2: "arinor0109",
              score1: "3",
              score2: "11",
              matchId: "mmmdW8Sg",
            },
            {
              timeControl: "½+0",
              player1: "Quasabianth",
              player2: "AtomicBlunder",
              score1: "15",
              score2: "15",
              matchId: "mA4lngX1",
            },
          ],
        },
        {
          team1: "Hyper Addicts",
          team2: "Team Death",
          score1: "52%",
          score2: "48%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "JakeStateFarm",
              player2: "RabbieR",
              score1: "6",
              score2: "0",
              matchId: "WtKxG2jG",
            },
            {
              timeControl: "3+0",
              player1: "Maracker",
              player2: "NitroColoraze",
              score1: "2",
              score2: "6",
              matchId: "tiPlLQEE",
            },
            {
              timeControl: "1+0",
              player1: "StUdIeB",
              player2: "sircachetes",
              score1: "5.5",
              score2: "10.5",
              matchId: "99sg0e0k",
            },
            {
              timeControl: "½+0",
              player1: "RKROUNIT",
              player2: "MaxwellsSilvrHammer",
              score1: "14.5",
              score2: "15.5",
              matchId: "oGLvWd3m",
            },
          ],
        },
      ],
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Hyper Addicts",
          team2: "The JBTEAM",
          score1: "61%",
          score2: "39%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "JakeStateFarm",
              player2: "HowlinD",
              score1: "5",
              score2: "3",
              matchId: "0heNhomf",
            },
            {
              timeControl: "3+0",
              player1: "StUdIeB",
              player2: "JudeBaeTorrens",
              score1: "5",
              score2: "5",
              matchId: "4zSLyq1b",
            },
            {
              timeControl: "1+0",
              player1: "Maracker",
              player2: "arinor0109",
              score1: "10.5",
              score2: "3.5",
              matchId: "LpnCSmlx",
            },
            {
              timeControl: "½+0",
              player1: "RKROUNIT",
              player2: "AtomicBlunder",
              score1: "16",
              score2: "12",
              matchId: "zTbFzhBh",
            },
          ],
        },
        {
          team1: "Natso and random 2200s",
          team2: "Team Death",
          score1: "56%",
          score2: "44%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Natso",
              player2: "MaxwellsSilvrHammer",
              score1: "5",
              score2: "3",
              matchId: "3aFIMSeO",
            },
            {
              timeControl: "3+0",
              player1: "Quasabianth",
              player2: "RabbieR",
              score1: "7",
              score2: "3",
              matchId: "fIJoCI7j",
            },
            {
              timeControl: "1+0",
              player1: "stinkypotato",
              player2: "NitroColoraze",
              score1: "5",
              score2: "11",
              matchId: "HD3ARaLL",
            },
            {
              timeControl: "½+0",
              player1: "Rechesster",
              player2: "sircachetes",
              score1: "16",
              score2: "10",
              matchId: "QslOpwRp",
            },
          ],
        },
      ],
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Hyper Addicts",
          team2: "Natso and random 2200s",
          score1: "61%",
          score2: "39%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "JakeStateFarm",
              player2: "Natso",
              score1: "3.5",
              score2: "4.5",
              matchId: "p3Wy7yb6",
            },
            {
              timeControl: "3+0",
              player1: "StUdIeB",
              player2: "Quasabianth",
              score1: "6",
              score2: "4",
              matchId: "cna1BteU",
            },
            {
              timeControl: "1+0",
              player1: "Maracker",
              player2: "Rechesster",
              score1: "10",
              score2: "10",
              matchId: "HkqD5XJg",
            },
            {
              timeControl: "½+0",
              player1: "RKROUNIT",
              player2: "stinkypotato",
              score1: "16.5",
              score2: "1.5",
              matchId: "wpfYk5Wf",
            },
          ],
        },
        {
          team1: "The JBTEAM",
          team2: "Team Death",
          score1: "52%",
          score2: "48%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "HowlinD",
              player2: "RabbieR",
              score1: "4.5",
              score2: "1.5",
              matchId: "CzUuxQRT",
            },
            {
              timeControl: "3+0",
              player1: "arinor0109",
              player2: "NitroColoraze",
              score1: "3",
              score2: "7",
              matchId: "FlyfkONl",
            },
            {
              timeControl: "1+0",
              player1: "AtomicBlunder",
              player2: "MaxwellsSilvrHammer",
              score1: "4",
              score2: "12",
              matchId: "miaBQBlN",
            },
            {
              timeControl: "½+0",
              player1: "JudeBaeTorrens",
              player2: "sircachetes",
              score1: "16",
              score2: "4",
              matchId: "bVcd1lDY",
            },
          ],
        },
      ],
    },
  ],
  "2-challenger": [
    {
      number: 1,
      matchups: [
        {
          team1: "Pythons",
          team2: "Atomic Storm",
          score1: "43%",
          score2: "57%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "BoldyNeutral",
              player2: "BobbyOppenheimer1945",
              score1: "4",
              score2: "4",
              matchId: "ufQjGzFj",
            },
            {
              timeControl: "3+0",
              player1: "JuanC95",
              player2: "gage12",
              score1: "7",
              score2: "3",
              matchId: "sXHuO01C",
            },
            {
              timeControl: "1+2",
              player1: "VenusaurBeedrill",
              player2: "cycl1one",
              score1: "2.5",
              score2: "7.5",
              status: "unarchived",
            },
            {
              timeControl: "1+0",
              player1: "T-R-I-D-E-N-T",
              player2: "RaviharaV",
              score1: "5",
              score2: "11",
              matchId: "pQiXkvMX",
            },
            {
              timeControl: "½+0",
              player1: "ArjanZS",
              player2: "imjustanotherbot",
              score1: "10.5",
              score2: "15.5",
              matchId: "tFN4ZKSE",
            },
          ],
        },
        {
          team1: "Orca",
          team2: "Team Cowboy",
          score1: "51%",
          score2: "49%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Orcinus_Orca",
              player2: "DanDan2016",
              score1: "3.5",
              score2: "4.5",
              matchId: "ycOI1H5P",
            },
            {
              timeControl: "3+0",
              player1: "AbsolutelyTrash",
              player2: "accaesar",
              score1: "6",
              score2: "0",
              matchId: "tq85UrhV",
            },
            {
              timeControl: "1+2",
              player1: "MarcoTheTiger",
              player2: "francothefalcon",
              score1: "3",
              score2: "9",
              matchId: "a5lBBvFa",
            },
            {
              timeControl: "1+0",
              player1: "KNIGHTBLADE_123",
              player2: "StealYourKidney",
              score1: "6.5",
              score2: "11.5",
              matchId: "gancwDLD",
            },
            {
              timeControl: "½+0",
              player1: "F55555",
              player2: "JanMeLons",
              score1: "15",
              score2: "15",
              matchId: "4aUv9mHh",
            },
          ],
        },
      ],
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Orca",
          team2: "Atomic Storm",
          score1: "55%",
          score2: "45%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Orcinus_Orca",
              player2: "gage12",
              score1: "6",
              score2: "2",
              matchId: "M9bZwby0",
            },
            {
              timeControl: "3+0",
              player1: "AbsolutelyTrash",
              player2: "RaviharaV",
              score1: "6.5",
              score2: "1.5",
              matchId: "hZoMItmc",
            },
            {
              timeControl: "1+2",
              player1: "KNIGHTBLADE_123",
              player2: "BobbyOppenheimer1945",
              score1: "4.5",
              score2: "7.5",
              matchId: "6QX6L8xY",
            },
            {
              timeControl: "1+0",
              player1: "MarcoTheTiger",
              player2: "cycl1one",
              score1: "9",
              score2: "11",
              matchId: "RQDBG6PV",
            },
            {
              timeControl: "½+0",
              player1: "I-WIN-00",
              player2: "imjustanotherbot",
              score1: "10",
              score2: "16",
              matchId: "VNHF0RlQ",
            },
          ],
        },
        {
          team1: "Pythons",
          team2: "Team Cowboy",
          score1: "55%",
          score2: "45%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "VenusaurBeedrill",
              player2: "DanDan2016",
              score1: "5",
              score2: "3",
              matchId: "r6uGmNZy",
            },
            {
              timeControl: "3+0",
              player1: "JuanC95",
              player2: "accaesar",
              score1: "5.5",
              score2: "4.5",
              matchId: "8HWaO6eM",
            },
            {
              timeControl: "1+2",
              player1: "BoldyNeutral",
              player2: "francothefalcon",
              score1: "0",
              score2: "1",
              status: "forfeit",
            },
            {
              timeControl: "1+0",
              player1: "T-R-I-D-E-N-T",
              player2: "StealYourKidney",
              score1: "1",
              score2: "0",
              status: "forfeit",
            },
            {
              timeControl: "½+0",
              player1: "ArjanZS",
              player2: "JanMeLons",
              score1: "16",
              score2: "12",
              matchId: "Rwe4Wm1p",
            },
          ],
        },
      ],
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Orca",
          team2: "Pythons",
          score1: "54%",
          score2: "46%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "MarcoTheTiger",
              player2: "VenusaurBeedrill",
              score1: "2",
              score2: "6",
              status: "unarchived",
            },
            {
              timeControl: "3+0",
              player1: "AbsolutelyTrash",
              player2: "JuanC95",
              score1: "5.5",
              score2: "0.5",
              matchId: "jibs5oMI",
            },
            {
              timeControl: "1+2",
              player1: "Orcinus_Orca",
              player2: "SauceCooker7598",
              score1: "8",
              score2: "2",
              matchId: "6odFuwll",
            },
            {
              timeControl: "1+0",
              player1: "I-WIN-00",
              player2: "T-R-I-D-E-N-T",
              score1: "0.5",
              score2: "0.5",
              status: "declared",
            },
            {
              timeControl: "½+0",
              player1: "KNIGHTBLADE_123",
              player2: "ArjanZS",
              score1: "4.5",
              score2: "15.5",
              matchId: "NGZ0YHUG",
            },
          ],
        },
        {
          team1: "Atomic Storm",
          team2: "Team Cowboy",
          score1: "54%",
          score2: "46%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "BobbyOppenheimer1945",
              player2: "DanDan2016",
              score1: "2.5",
              score2: "5.5",
              matchId: "N4yyl5Ac",
            },
            {
              timeControl: "3+0",
              player1: "RaviharaV",
              player2: "accaesar",
              score1: "5",
              score2: "1",
              matchId: "8YPzoCal",
            },
            {
              timeControl: "1+2",
              player1: "",
              player2: "",
              score1: "",
              score2: "",
              status: "unplayed",
            },
            {
              timeControl: "1+0",
              player1: "cycl1one",
              player2: "francothefalcon",
              score1: "0",
              score2: "1",
              status: "forfeit",
            },
            {
              timeControl: "½+0",
              player1: "imjustanotherbot",
              player2: "JanMeLons",
              score1: "1",
              score2: "0",
              status: "forfeit",
            },
          ],
        },
      ],
    },
  ],
  "1-elite": [
    {
      number: 1,
      matchups: [
        {
          team1: "Team Natso",
          team2: "Team RandoomPlayer",
          score1: "4",
          score2: "0",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Natso",
              player2: "RandoomPlayer",
              score1: "6",
              score2: "0",
              matchId: "WAslTZGh",
            },
            {
              timeControl: "3+0",
              player1: "Rechesster",
              player2: "HowlinD",
              score1: "7",
              score2: "3",
              matchId: "cVCPhcpa",
            },
            {
              timeControl: "1+0",
              player1: "NeverOFzero",
              player2: "JakeStateFarm",
              score1: "15.5",
              score2: "4.5",
              matchId: "W1vdC7d9",
            },
            {
              timeControl: "½+0",
              player1: "RKROUNIT",
              player2: "MaxwellsSilvrHammer",
              score1: "16",
              score2: "13",
              matchId: "sJpFRpq7",
            },
          ],
        },
        {
          team1: "Team Wolfram_EP",
          team2: "Team Ihatespammers",
          score1: "1",
          score2: "3",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "TAiSThuban",
              player2: "rabidknight",
              score1: "4.5",
              score2: "2.5",
              matchId: "2P3xM82P",
            },
            {
              timeControl: "3+0",
              player1: "Wolfram_EP",
              player2: "RookGameStrategy",
              score1: "4",
              score2: "6",
              matchId: "8lGBtX1e",
            },
            {
              timeControl: "1+0",
              player1: "Maracker",
              player2: "ihatespammers",
              score1: "8.5",
              score2: "11.5",
              matchId: "Oc2NmbdM",
            },
            {
              timeControl: "½+0",
              player1: "Statham_13",
              player2: "chrissical",
              score1: "11.5",
              score2: "15.5",
              matchId: "ptdCg7AS",
            },
          ],
        },
      ],
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Team Natso",
          team2: "Team Ihatespammers",
          score1: "2",
          score2: "2",
          tiebreak: true,
          boards: [
            {
              timeControl: "3+2",
              player1: "Rechesster",
              player2: "rabidknight",
              score1: "4",
              score2: "4",
              matchId: "L3ib3zWj",
            },
            {
              timeControl: "3+0",
              player1: "Natso",
              player2: "RookGameStrategy",
              score1: "6",
              score2: "4",
              matchId: "mQF1HJcR",
            },
            {
              timeControl: "1+0",
              player1: "NeverOFzero",
              player2: "ihatespammers",
              score1: "10",
              score2: "11",
              matchId: "cnSwKEAn",
            },
            {
              timeControl: "½+0",
              player1: "RKROUNIT",
              player2: "chrissical",
              score1: "15",
              score2: "15",
              matchId: "73WRFGyB",
            },
          ],
        },
        {
          team1: "Team RandoomPlayer",
          team2: "Team Wolfram_EP",
          score1: "0",
          score2: "4",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "HowlinD",
              player2: "TAiSThuban",
              score1: "2.5",
              score2: "4.5",
              matchId: "uehJqJB9",
            },
            {
              timeControl: "3+0",
              player1: "JakeStateFarm",
              player2: "Wolfram_EP",
              score1: "4.5",
              score2: "5.5",
              matchId: "BBaWmRmA",
            },
            {
              timeControl: "1+0",
              player1: "RandoomPlayer",
              player2: "Maracker",
              score1: "8",
              score2: "12",
              matchId: "N0TPznkZ",
            },
            {
              timeControl: "½+0",
              player1: "MaxwellsSilvrHammer",
              player2: "Statham_13",
              score1: "11.5",
              score2: "15.5",
              matchId: "BrgKT0kp",
            },
          ],
        },
      ],
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Team Natso",
          team2: "Team Wolfram_EP",
          score1: "3",
          score2: "1",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Natso",
              player2: "Wolfram_EP",
              score1: "3",
              score2: "5",
              matchId: "Q70JChkg",
            },
            {
              timeControl: "3+0",
              player1: "NeverOFzero",
              player2: "TAiSThuban",
              score1: "1",
              score2: "0",
              status: "forfeit",
            },
            {
              timeControl: "1+0",
              player1: "Rechesster",
              player2: "Maracker",
              score1: "12",
              score2: "8",
              matchId: "B20xf2hO",
            },
            {
              timeControl: "½+0",
              player1: "RKROUNIT",
              player2: "Statham_13",
              score1: "16",
              score2: "4",
              matchId: "95X388HT",
            },
          ],
        },
        {
          team1: "Team RandoomPlayer",
          team2: "Team Ihatespammers",
          score1: "1½",
          score2: "2½",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "RandoomPlayer",
              player2: "rabidknight",
              score1: "4.5",
              score2: "2.5",
              matchId: "i3xDHkrj",
            },
            {
              timeControl: "3+0",
              player1: "MaxwellsSilvrHammer",
              player2: "RookGameStrategy",
              score1: "3",
              score2: "6",
              matchId: "etetWHWK",
            },
            {
              timeControl: "1+0",
              player1: "HowlinD",
              player2: "ihatespammers",
              score1: "½",
              score2: "½",
              status: "declared",
            },
            {
              timeControl: "½+0",
              player1: "JakeStateFarm",
              player2: "chrissical",
              score1: "11",
              score2: "16",
              matchId: "ctXgtdnk",
            },
          ],
        },
      ],
    },
  ],
  "1-challenger": [
    {
      number: 1,
      matchups: [
        {
          team1: "Team ekulxam",
          team2: "Team average200",
          score1: "2½",
          score2: "1½",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "seaside_tiramisu",
              player2: "average200",
              score1: "5",
              score2: "3",
              matchId: "MDnOFdDV",
            },
            {
              timeControl: "3+0",
              player1: "StealYourKidney",
              player2: "sircachetes",
              score1: "5",
              score2: "5",
              matchId: "NSU7EH9Y",
            },
            {
              timeControl: "1+0",
              player1: "ekulxam",
              player2: "timetoplayatomic",
              score1: "11.5",
              score2: "8.5",
              matchId: "O5U6ctgS",
            },
            {
              timeControl: "½+0",
              player1: "mike-bear",
              player2: "always_play_atomic",
              score1: "11",
              score2: "19",
              matchId: "d6D2qQLe",
            },
          ],
        },
        {
          team1: "Team RabbieR",
          team2: "Team F55555",
          score1: "2½",
          score2: "1½",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "DanDan2016",
              player2: "puddingbirne",
              score1: "5",
              score2: "3",
              matchId: "znN7KgLQ",
            },
            {
              timeControl: "3+0",
              player1: "RabbieR",
              player2: "fettuccini",
              score1: "6",
              score2: "3",
              matchId: "XmGX0OFE",
            },
            {
              timeControl: "1+0",
              player1: "StUdIeB",
              player2: "milky_way12",
              score1: "9.5",
              score2: "10.5",
              matchId: "sZaOk9s1",
            },
            {
              timeControl: "½+0",
              player1: "bercerk_atim",
              player2: "F55555",
              score1: "½",
              score2: "½",
              status: "declared",
            },
          ],
        },
      ],
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Team ekulxam",
          team2: "Team RabbieR",
          score1: "1",
          score2: "3",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "StealYourKidney",
              player2: "DanDan2016",
              score1: "1.5",
              score2: "4.5",
              matchId: "bs8nImRR",
            },
            {
              timeControl: "3+0",
              player1: "seaside_tiramisu",
              player2: "RabbieR",
              score1: "7",
              score2: "3",
              matchId: "FBt6fIs1",
            },
            {
              timeControl: "1+0",
              player1: "ekulxam",
              player2: "StUdIeB",
              score1: "7",
              score2: "13",
              matchId: "kiWdXVAQ",
            },
            {
              timeControl: "½+0",
              player1: "mike-bear",
              player2: "bercerk_atim",
              score1: "8",
              score2: "15",
              matchId: "L7Q6NfwZ",
            },
          ],
        },
        {
          team1: "Team average200",
          team2: "Team F55555",
          score1: "2",
          score2: "2",
          tiebreak: true,
          boards: [
            {
              timeControl: "3+2",
              player1: "bijiy",
              player2: "fettuccini",
              score1: "6",
              score2: "2",
              status: "forfeit",
            },
            {
              timeControl: "3+0",
              player1: "average200",
              player2: "milky_way12",
              score1: "4.5",
              score2: "5.5",
              matchId: "TjRhbcqS",
            },
            {
              timeControl: "1+0",
              player1: "always_play_atomic",
              player2: "fji-467",
              score1: "12",
              score2: "8",
              matchId: "D0OyVzKm",
            },
            {
              timeControl: "½+0",
              player1: "sircachetes",
              player2: "F55555",
              score1: "5",
              score2: "25",
              matchId: "CCAAeBT9",
            },
          ],
        },
      ],
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Team RabbieR",
          team2: "Team average200",
          score1: "3",
          score2: "1",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "DanDan2016",
              player2: "average200",
              score1: "5",
              score2: "1",
              matchId: "FVE8xkrc",
            },
            {
              timeControl: "3+0",
              player1: "RabbieR",
              player2: "bijiy",
              score1: "1.5",
              score2: "8.5",
              matchId: "2IFnsYhn",
            },
            {
              timeControl: "1+0",
              player1: "StUdIeB",
              player2: "sircachetes",
              score1: "10.5",
              score2: "6.5",
              matchId: "GEjZ7Wx0",
            },
            {
              timeControl: "½+0",
              player1: "bercerk_atim",
              player2: "always_play_atomic",
              score1: "16",
              score2: "14",
              matchId: "5kgVXoZb",
            },
          ],
        },
        {
          team1: "Team ekulxam",
          team2: "Team F55555",
          score1: "2",
          score2: "2",
          tiebreak: true,
          boards: [
            {
              timeControl: "3+2",
              player1: "StealYourKidney",
              player2: "puddingbirne",
              score1: "1.5",
              score2: "4.5",
              matchId: "bctoB1Bm",
            },
            {
              timeControl: "3+0",
              player1: "seaside_tiramisu",
              player2: "fettuccini",
              score1: "8.5",
              score2: "1.5",
              matchId: "7FU3khZ8",
            },
            {
              timeControl: "1+0",
              player1: "ekulxam",
              player2: "milky_way12",
              score1: "8",
              score2: "12",
              matchId: "bxwc8Eco",
            },
            {
              timeControl: "½+0",
              player1: "mike-bear",
              player2: "F55555",
              score1: "15.5",
              score2: "14.5",
              matchId: "4Kpw7Z1d",
            },
          ],
        },
      ],
    },
  ],
};

export const atomicChessLeagueSeasons: readonly AtomicChessLeagueSeason[] = [
  {
    number: 2,
    year: 2026,
    startDate: "2026-02-01",
    endDate: "2026-03-29",
    boardCount: 5,
    timeControls: ["3+2", "3+0", "1+2", "1+0", "½+0"],
    resultsUrl:
      "https://lichess.org/@/HowlinD/blog/results-of-the-atomic-chess-league-season-2/7gpFMA6k",
    teamsUrl:
      "https://lichess.org/forum/team-the-atomic-chess-league/acl-season-2-registration?page=8",
    divisions: [
      {
        id: "elite",
        name: "Elite League",
        rounds: aclRoundData["2-elite"]!,
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
        rounds: aclRoundData["2-challenger"]!,
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
    startDate: "2025-07-01",
    endDate: "2025-08-30",
    boardCount: 4,
    timeControls: ["3+2", "3+0", "1+0", "½+0"],
    resultsUrl:
      "https://lichess.org/@/HowlinD/blog/results-of-the-atomic-chess-league-season-1/diOodYbX",
    teamsUrl: "https://lichess.org/forum/team-the-atomic-chess-league/atomic-league-season-1",
    divisions: [
      {
        id: "elite",
        name: "Elite League",
        rounds: aclRoundData["1-elite"]!,
        teams: [
          {
            rank: 1,
            name: "Team Natso",
            captain: "Natso",
            players: ["Natso", "NeverofZero", "Rechesster", "RKROUNIT"],
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
        rounds: aclRoundData["1-challenger"]!,
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
            players: ["ekulxam", "seaside_tiramisu", "StealYourKidney", "mike-bear", "JurrYan"],
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
              "average200",
              "timetoplayatomic",
              "bijiy",
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
