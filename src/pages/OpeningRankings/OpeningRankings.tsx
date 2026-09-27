import "./OpeningRankings.css";

import { Seo } from "../../components/Seo/Seo";

type OpeningRanking = { move: string; evaluation: number; url: string };

const atomicDbBaseUrl = "https://belzedar.duckdns.org/atomicdb/explore";

// Each PGN below was submitted through AtomicDB's PGN/FEN jump field; evaluations are the
// resulting position-page values normalized to White's perspective.
const openings: OpeningRanking[] = [
  {
    move: "1. Nf3 f6 2. Nc3",
    evaluation: 969,
    url: `${atomicDbBaseUrl}/973d2a56a0c497e578aaf388fbc56c9104860eea0f0914bcc1957946cfc118a5/?play=g1f3%2Cf7f6%2Cb1c3`,
  },
  {
    move: "1. Nf3 f6 2. e3",
    evaluation: 784,
    url: `${atomicDbBaseUrl}/b3de0f0a5f0c458e42155134d98ae7e69f6c219e8e9a8e1431ee816f1a3a51c8/?play=g1f3%2Cf7f6%2Ce2e3`,
  },
  {
    move: "1. Nf3 f6 2. e4",
    evaluation: 775,
    url: `${atomicDbBaseUrl}/025e0b7321202fe56334280db7e4c4582fe2408a61ee8871c4250b169402cf82/?play=g1f3%2Cf7f6%2Ce2e4`,
  },
  {
    move: "1. Nh3 h6 2. d4",
    evaluation: 693,
    url: `${atomicDbBaseUrl}/40f2db0f36021dd12df78757131539c70e3972799811cc277118302a37ae8ad1/?play=g1h3%2Ch7h6%2Cd2d4`,
  },
  {
    move: "1. e3 e6 2. Nf3",
    evaluation: 505,
    url: `${atomicDbBaseUrl}/1ee388b727361c31c9dfef9e294ceae0fafa78f7ebcd3fb70ba5c26d33dd4cc0/?play=e2e3%2Ce7e6%2Cg1f3`,
  },
  {
    move: "1. Nh3 h6 2. e4",
    evaluation: 494,
    url: `${atomicDbBaseUrl}/30f75769d9e3c40580ba7c4228f11860a7d2330ad9386dea1473b1cedcce9d50/?play=g1h3%2Ch7h6%2Ce2e4`,
  },
  {
    move: "1. d4",
    evaluation: 435,
    url: `${atomicDbBaseUrl}/4263f01cff2e56045fd4d53804b0ba85b915e632be58552b6bc4a461c36405a1/?play=d2d4`,
  },
  {
    move: "1. e4",
    evaluation: 417,
    url: `${atomicDbBaseUrl}/7d93ad7e3a1c986e6f76bcf307af48d8174738064c5e3acfdf17b8cd05b4f7d6/?play=e2e4`,
  },
  {
    move: "1. Nf3 f6 2. d4",
    evaluation: 400,
    url: `${atomicDbBaseUrl}/dc0b15b8705dbcd6d13a6ceec89736752135f44167c055c868c6c7e0c294e1e5/?play=g1f3%2Cf7f6%2Cd2d4`,
  },
  {
    move: "1. Nh3 h6 2. Nc3",
    evaluation: 395,
    url: `${atomicDbBaseUrl}/2b3482c72dfdf6877164759a7e7fd8b37dd004b544648a19fbcf1f505663f3f1/?play=g1h3%2Ch7h6%2Cb1c3`,
  },
  {
    move: "1. e3 e6 2. Nh3",
    evaluation: 247,
    url: `${atomicDbBaseUrl}/19e39135d6618bcdf2ba1e56690297859dae2192c337a5b34bc68d7c8e81e1f2/?play=e2e3%2Ce7e6%2Cg1h3`,
  },
  {
    move: "1. Nh3 h6 2. e3",
    evaluation: 247,
    url: `${atomicDbBaseUrl}/11d284d7702f112908366131d62483df9e69215e0c7a792ede1f8a1f9dd35807/?play=g1h3%2Ch7h6%2Ce2e3`,
  },
  {
    move: "1. Nh3 h6 2. Na3",
    evaluation: 222,
    url: `${atomicDbBaseUrl}/35f2321c208dcb8fa27789b0ae9fa6877bec849c9285c9249dc27f710580145b/?play=g1h3%2Ch7h6%2Cb1a3`,
  },
  {
    move: "1. Nh3 h6 2. c3",
    evaluation: 188,
    url: `${atomicDbBaseUrl}/71c6c73ce792d0fee26e80f5c391140ad179f517971d81620d32dcb6b389d8d7/?play=g1h3%2Ch7h6%2Cc2c3`,
  },
  {
    move: "1. e3 e6 2. Nc3",
    evaluation: 183,
    url: `${atomicDbBaseUrl}/883fb848e8270da5b8cbe91a96120d6fb6846e788e7eda369f2061b7aeb0b5aa/?play=e2e3%2Ce7e6%2Cb1c3`,
  },
  {
    move: "1. Nc3",
    evaluation: 183,
    url: `${atomicDbBaseUrl}/dce916e317986e4f7126e3faf6dc495c14c7a0437987540abaa479bc214a8222/?play=b1c3`,
  },
  {
    move: "1. Nh3 h6 2. g3",
    evaluation: 165,
    url: `${atomicDbBaseUrl}/53726f82f77f3fab7b71167e01f1237d596f2ebd65fd627a1ec79a2f6211afe6/?play=g1h3%2Ch7h6%2Cg2g3`,
  },
  {
    move: "1. Nf3 f6 2. Na3",
    evaluation: 144,
    url: `${atomicDbBaseUrl}/b723d1552874149b36a3166c5239847e14561bf2c1df4e2b6870ef19fa3e561e/?play=g1f3%2Cf7f6%2Cb1a3`,
  },
  {
    move: "1. Nh3 h6 2. b4",
    evaluation: 124,
    url: `${atomicDbBaseUrl}/0142d808381465bcc17d30d4ae3ba241410dda07681d819173fc09de5d14ecd2/?play=g1h3%2Ch7h6%2Cb2b4`,
  },
  {
    move: "1. Nf3 f6 2. Nd4",
    evaluation: 115,
    url: `${atomicDbBaseUrl}/215714d9cf31462d151db5808193d0369faccb0c61d670e71fc7037e7608fd16/?play=g1f3%2Cf7f6%2Cf3d4`,
  },
  {
    move: "1. Nf3 f6 2. c3",
    evaluation: 93,
    url: `${atomicDbBaseUrl}/2e68847c9e2a9566ad53014921861b415adb0167db5ed83e78fca5013c63b739/?play=g1f3%2Cf7f6%2Cc2c3`,
  },
  {
    move: "1. e3 e6 2. Bb5",
    evaluation: 59,
    url: `${atomicDbBaseUrl}/906248f364bae3fda0b948a6ec6471e663582265c8a34bdb29c5b8da573bdfe0/?play=e2e3%2Ce7e6%2Cf1b5`,
  },
  {
    move: "1. Nf3 f6 2. Nh4",
    evaluation: 37,
    url: `${atomicDbBaseUrl}/a5ff055bfec402874c747c24652e495d776f1ba5834572fcb3c467630b66bdc4/?play=g1f3%2Cf7f6%2Cf3h4`,
  },
  {
    move: "1. e3 e6 2. Qh5",
    evaluation: 36,
    url: `${atomicDbBaseUrl}/140d50ef40a7c993ca386f1fc51afb0db9b9f0dfdd81449428c317f985eb1d3d/?play=e2e3%2Ce7e6%2Cd1h5`,
  },
  {
    move: "1. e3 e6 2. Qf3",
    evaluation: 8,
    url: `${atomicDbBaseUrl}/5eb00886a1d688b25620ddecf9df63a7b6d251b6e0aa73e6d2ef37b155e8965e/?play=e2e3%2Ce7e6%2Cd1f3`,
  },
  {
    move: "1. e3 e6 2. Na3",
    evaluation: 0,
    url: `${atomicDbBaseUrl}/5168a07499367e4a59923d794d8a1c37ebaffa93406ba9489685798437baf82c/?play=e2e3%2Ce7e6%2Cb1a3`,
  },
  {
    move: "1. c3",
    evaluation: 0,
    url: `${atomicDbBaseUrl}/43e1f23fa182d98c85cbac44200461b511165533802e335963e8826718229734/?play=c2c3`,
  },
  {
    move: "1. g3",
    evaluation: 0,
    url: `${atomicDbBaseUrl}/64148148c66bf36ec33a14f168690de0beabe2ecc89d7e5cff700c5614a2ffdd/?play=g2g3`,
  },
  {
    move: "1. b4",
    evaluation: 0,
    url: `${atomicDbBaseUrl}/49c61ccecca2d33babe787646793a428f36472f025fea63567e37758921c17de/?play=b2b4`,
  },
  {
    move: "1. Na3",
    evaluation: 0,
    url: `${atomicDbBaseUrl}/db78dd638384fd72ee9e53e4caf3559831bf9ec687fa9009f40e6ac2bff0072d/?play=b1a3`,
  },
  {
    move: "1. e3 e6 2. b4",
    evaluation: -3,
    url: `${atomicDbBaseUrl}/a1cedd7f695f074edb5f445dc3a302274aa02296408903506cf9346814190e89/?play=e2e3%2Ce7e6%2Cb2b4`,
  },
  {
    move: "1. h3",
    evaluation: -100,
    url: `${atomicDbBaseUrl}/f47bb0ca3e359ae6bbe04ac05663b6436464b01f750385c6ed5f2380343e2f15/?play=h2h3`,
  },
  {
    move: "1. a3",
    evaluation: -103,
    url: `${atomicDbBaseUrl}/1757408553ca3a86694b1cc014a84b7e2fdb5157eb9f8c5d6f74dc3c1e03c9e1/?play=a2a3`,
  },
  {
    move: "1. f3",
    evaluation: -110,
    url: `${atomicDbBaseUrl}/2b7fb8dd459ef9cfb78c0004afc84991fc16b995ce048512969b7bcd40b629ca/?play=f2f3`,
  },
  {
    move: "1. d3",
    evaluation: -116,
    url: `${atomicDbBaseUrl}/0916302fd3520a129ec0fd421fcabc901c3940f2013deea0760956a3edf31fd7/?play=d2d3`,
  },
  {
    move: "1. b3",
    evaluation: -119,
    url: `${atomicDbBaseUrl}/5ec1112a532d302767c29e0d13ec528b5494f982e1fd4261948a868e3e9b3431/?play=b2b3`,
  },
  {
    move: "1. f4",
    evaluation: -302,
    url: `${atomicDbBaseUrl}/824f55c3617bcf3569062c4356fd8ad10b0585755a997b993865263937acfc27/?play=f2f4`,
  },
  {
    move: "1. h4",
    evaluation: -500,
    url: `${atomicDbBaseUrl}/ca026db7ab7f1598b8ce4f3bd9947a95f101ee00780efe9b61b49c62ae87ddb3/?play=h2h4`,
  },
  {
    move: "1. a4",
    evaluation: -502,
    url: `${atomicDbBaseUrl}/362f79062a22667130a082a7a9579cbbf67ae1b712fbd6eeeb648a1e38d54955/?play=a2a4`,
  },
  {
    move: "1. g4",
    evaluation: -600,
    url: `${atomicDbBaseUrl}/5f7e377436a2196b4672f151fd47851ffa217ab5779a5dbfedff399005f4254d/?play=g2g4`,
  },
  {
    move: "1. c4",
    evaluation: -700,
    url: `${atomicDbBaseUrl}/1be838ff1e13ba41e9871b72ebcc2f2f6f6e75d755e9cf28f9e4a12c3c6a8ee6/?play=c2c4`,
  },
];

const formatEvaluation = (evaluation: number): string =>
  evaluation > 0 ? `+${evaluation}` : String(evaluation);

const RankingList = ({ entries }: { entries: OpeningRanking[] }) => (
  <ol className="openingRankingList">
    {entries.map((entry, index) => (
      <li key={entry.move} className="openingRankingRow">
        <span className="openingRank" aria-label={`Rank ${index + 1}`}>
          {index + 1}
        </span>
        <a className="openingMove" href={entry.url} target="_blank" rel="noreferrer">
          {entry.move}
        </a>
        <span
          className={`openingEval ${entry.evaluation > 0 ? "positive" : entry.evaluation < 0 ? "negative" : "equal"}`}
          aria-label={`${formatEvaluation(entry.evaluation)} centipawns for White`}
        >
          {formatEvaluation(entry.evaluation)}
        </span>
      </li>
    ))}
  </ol>
);

export const OpeningRankingsPage = () => (
  <div className="openingRankingsPage">
    <Seo
      title="Atomic opening rankings"
      description="Rank meaningful opening choices for White using AtomicDB evaluations."
      path="/rankings/openings"
    />
    <div className="panel openingRankingsPanel">
      <header className="openingRankingsHeader">
        <h1>Opening Rankings</h1>
        <p>
          Openings are counted by meaningful choices for White. Nf3, Nh3, and e3 branch after their
          fixed replies; moves such as d4 stay as single entries.
        </p>
        <a href="https://belzedar.duckdns.org/atomicdb/" target="_blank" rel="noreferrer">
          View on AtomicDB
        </a>
      </header>
      <section className="openingRankingSection" aria-label="Ranked openings">
        <RankingList entries={openings} />
      </section>
    </div>
  </div>
);
