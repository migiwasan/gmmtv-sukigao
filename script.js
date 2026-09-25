// ========================================
// GMMTV好き顔ソート~mens~
// ========================================


// ========================================
// 設定
// ========================================

const BASE_COMPARISONS = 100;
const REFINE_COMPARISONS = 30;

const PHASE2_CANDIDATES = 20;
const REFINE_CANDIDATES = 15;

const INITIAL_SCORE = 1500;
const K_FACTOR = 32;

const BOTH_BONUS = 8;
const NEITHER_PENALTY = 8;


// LocalStorageの保存キー
// v4にして以前の壊れた状態を使わないようにする
const STATE_KEY = "gmmtv-sukigao-state-v4";


// ========================================
// データ
// ========================================

let people = [];

let peopleById = new Map();

let scores = {};

let comparisonCounts = {};

let comparisonHistory = {};

let phase1Pairs = [];

let currentPair = null;

let currentComparison = 0;

let normalTarget = BASE_COMPARISONS;

let mode = "normal";

let refinementStart = 0;

let refinementTarget = null;

let isProcessing = false;


// ========================================
// HTML要素
// ========================================

const compareScreen =
  document.getElementById("compareScreen");

const resultScreen =
  document.getElementById("resultScreen");


const leftImage =
  document.getElementById("leftImage");

const rightImage =
  document.getElementById("rightImage");


const progressBar =
  document.getElementById("progressBar");

const progressText =
  document.getElementById("progressText");

const phaseText =
  document.getElementById("phaseText");

const rankingGrid =
  document.getElementById("rankingGrid");


const leftChoice =
  document.getElementById("leftChoice");

const rightChoice =
  document.getElementById("rightChoice");

const bothChoice =
  document.getElementById("bothChoice");

const neitherChoice =
  document.getElementById("neitherChoice");


const refineButton =
  document.getElementById("refineButton");

const resetButton =
  document.getElementById("resetButton");


// ========================================
// CSV読み込み
// ========================================

function parseCSV(text) {

  // BOM除去
  text = text.replace(/^\uFEFF/, "");

  const rows = [];

  let row = [];

  let cell = "";

  let inQuotes = false;


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const char = text[i];

    const next = text[i + 1];


    // ダブルクォーテーション
    if (char === '"') {

      if (
        inQuotes &&
        next === '"'
      ) {

        cell += '"';

        i++;

      } else {

        inQuotes = !inQuotes;

      }

    }


    // カンマ
    else if (
      char === "," &&
      !inQuotes
    ) {

      row.push(cell.trim());

      cell = "";

    }


    // 改行
    else if (
      (
        char === "\n" ||
        char === "\r"
      ) &&
      !inQuotes
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {

        i++;

      }


      row.push(cell.trim());

      cell = "";


      if (
        row.some(
          value => value !== ""
        )
      ) {

        rows.push(row);

      }


      row = [];

    }


    // 通常文字
    else {

      cell += char;

    }

  }


  // 最後の行
  if (
    cell !== "" ||
    row.length > 0
  ) {

    row.push(cell.trim());


    if (
      row.some(
        value => value !== ""
      )
    ) {

      rows.push(row);

    }

  }


  if (rows.length < 2) {

    throw new Error(
      "people.csvにデータがありません"
    );

  }


  const headers =
    rows[0].map(
      header => header.trim()
    );


  const idIndex =
    headers.indexOf("id");

  const nameIndex =
    headers.indexOf("name");

  const imageIndex =
    headers.indexOf("image");


  if (
    idIndex === -1 ||
    nameIndex === -1 ||
    imageIndex === -1
  ) {

    throw new Error(
      "people.csvには「id,name,image」の3列が必要です"
    );

  }


  return rows
    .slice(1)
    .map(row => ({

      id:
        row[idIndex] || "",

      name:
        row[nameIndex] || "",

      image:
        row[imageIndex] || ""

    }));

}


// ========================================
// シャッフル
// ========================================

function shuffle(array) {

  const result = [
    ...array
  ];


  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );


    [
      result[i],
      result[j]
    ] = [
      result[j],
      result[i]
    ];

  }


  return result;

}


// ========================================
// 初回比較ペア作成
//
// 全員が最低1回は登場する
// ========================================

function createPhase1Pairs() {

  const ids =
    shuffle(
      people.map(
        person => person.id
      )
    );


  const pairs = [];


  // 2人ずつペアにする
  for (
    let i = 0;
    i + 1 < ids.length;
    i += 2
  ) {

    pairs.push([
      ids[i],
      ids[i + 1]
    ]);

  }


  // 人数が奇数の場合
  if (
    ids.length % 2 === 1
  ) {

    const lastId =
      ids[ids.length - 1];


    const opponentIndex =
      Math.floor(
        Math.random() *
        (ids.length - 1)
      );


    const opponentId =
      ids[opponentIndex];


    pairs.push([
      lastId,
      opponentId
    ]);

  }


  return pairs;

}


// ========================================
// 比較回数
// ========================================

function calculateNormalTarget() {

  const minimumForEveryone =
    Math.ceil(
      people.length / 2
    );


  return Math.max(
    BASE_COMPARISONS,
    minimumForEveryone
  );

}


// ========================================
// ペア識別
// ========================================

function getPairKey(
  id1,
  id2
) {

  return [
    id1,
    id2
  ]
    .sort()
    .join("__");

}


// ========================================
// ペア比較回数
// ========================================

function getPairCount(
  id1,
  id2
) {

  const key =
    getPairKey(
      id1,
      id2
    );


  return (
    comparisonHistory[key] ||
    0
  );

}


// ========================================
// ペアを記録
// ========================================

function recordPair(
  id1,
  id2
) {

  const key =
    getPairKey(
      id1,
      id2
    );


  comparisonHistory[key] =
    (
      comparisonHistory[key] ||
      0
    ) + 1;

}


// ========================================
// 最適な比較ペアを探す
// ========================================

function findBestPair(
  candidates
) {

  if (
    candidates.length < 2
  ) {

    return null;

  }


  const possiblePairs = [];


  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    for (
      let j = i + 1;
      j < candidates.length;
      j++
    ) {

      const a =
        candidates[i];

      const b =
        candidates[j];


      const pairCount =
        getPairCount(
          a.id,
          b.id
        );


      const scoreDifference =
        Math.abs(
          scores[a.id] -
          scores[b.id]
        );


      const individualCountDifference =
        Math.abs(
          (
            comparisonCounts[a.id] ||
            0
          ) -
          (
            comparisonCounts[b.id] ||
            0
          )
        );


      /*
       * 優先順位
       *
       * ① 同じペアを何度も比較しない
       * ② スコアが近い人同士
       * ③ 比較回数の偏りが少ない
       */

      const priority =
        pairCount * 100000 +
        scoreDifference +
        individualCountDifference * 0.1;


      possiblePairs.push({

        a,
        b,
        priority

      });

    }

  }


  possiblePairs.sort(
    (x, y) =>
      x.priority -
      y.priority
  );


  const topCount =
    Math.min(
      8,
      possiblePairs.length
    );


  const selected =
    possiblePairs[
      Math.floor(
        Math.random() *
        topCount
      )
    ];


  if (!selected) {

    return null;

  }


  return [
    selected.a,
    selected.b
  ];

}


// ========================================
// スコア初期化
// ========================================

function initializeScores() {

  scores = {};

  comparisonCounts = {};

  comparisonHistory = {};


  people.forEach(
    person => {

      scores[person.id] =
        INITIAL_SCORE;

      comparisonCounts[
        person.id
      ] = 0;

    }
  );

}


// ========================================
// 選択結果をスコアに反映
// ========================================

function applyChoice(
  choice
) {

  if (!currentPair) {

    return;

  }


  const left =
    currentPair[0];

  const right =
    currentPair[1];


  // 左が好き
  if (
    choice === "left"
  ) {

    updateElo(
      left.id,
      right.id,
      1
    );

  }


  // 右が好き
  else if (
    choice === "right"
  ) {

    updateElo(
      right.id,
      left.id,
      1
    );

  }


  // どちらも好き
  else if (
    choice === "both"
  ) {

    scores[left.id] +=
      BOTH_BONUS;

    scores[right.id] +=
      BOTH_BONUS;

  }


  // どちらも好きじゃない
  else if (
    choice === "neither"
  ) {

    scores[left.id] -=
      NEITHER_PENALTY;

    scores[right.id] -=
      NEITHER_PENALTY;

  }

}


// ========================================
// Elo計算
// ========================================

function updateElo(
  winnerId,
  loserId,
  result
) {

  const winnerScore =
    scores[winnerId];

  const loserScore =
    scores[loserId];


  const expectedWinner =
    1 /
    (
      1 +
      Math.pow(
        10,
        (
          loserScore -
          winnerScore
        ) / 400
      )
    );


  const change =
    K_FACTOR *
    (
      result -
      expectedWinner
    );


  scores[winnerId] +=
    change;

  scores[loserId] -=
    change;

}


// ========================================
// 比較回数を記録
// ========================================

function recordComparison() {

  if (!currentPair) {

    return;

  }


  const left =
    currentPair[0];

  const right =
    currentPair[1];


  comparisonCounts[left.id] =
    (
      comparisonCounts[left.id] ||
      0
    ) + 1;


  comparisonCounts[right.id] =
    (
      comparisonCounts[right.id] ||
      0
    ) + 1;


  recordPair(
    left.id,
    right.id
  );

}


// ========================================
// 現在のランキング
// ========================================

function getRanking() {

  return [...people].sort(
    (a, b) => {

      const scoreDifference =
        scores[b.id] -
        scores[a.id];


      if (
        scoreDifference !== 0
      ) {

        return scoreDifference;

      }


      return (
        (
          comparisonCounts[a.id] ||
          0
        ) -
        (
          comparisonCounts[b.id] ||
          0
        )
      );

    }
  );

}


// ========================================
// 次の比較ペアを決める
// ========================================

function chooseNextPair() {

  // ==============================
  // 通常モード
  // ==============================

  if (
    mode === "normal"
  ) {

    // 最初は全員を登場させる
    if (
      currentComparison <
      phase1Pairs.length
    ) {

      const ids =
        phase1Pairs[
          currentComparison
        ];


      const left =
        peopleById.get(
          ids[0]
        );


      const right =
        peopleById.get(
          ids[1]
        );


      if (
        left &&
        right
      ) {

        return [
          left,
          right
        ];

      }

    }


    // それ以降は上位候補
    const ranking =
      getRanking();


    const candidateCount =
      Math.min(
        PHASE2_CANDIDATES,
        ranking.length
      );


    const candidates =
      ranking.slice(
        0,
        candidateCount
      );


    return findBestPair(
      candidates
    );

  }


  // ==============================
  // 精密比較モード
  // ==============================

  if (
    mode === "refine"
  ) {

    const ranking =
      getRanking();


    const candidateCount =
      Math.min(
        REFINE_CANDIDATES,
        ranking.length
      );


    const candidates =
      ranking.slice(
        0,
        candidateCount
      );


    return findBestPair(
      candidates
    );

  }


  return null;

}


// ========================================
// 画像エラー用SVG
// ========================================

function createErrorImage(
  person
) {

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="600"
      height="800"
    >

      <rect
        width="600"
        height="800"
        fill="#eeeeee"
      />

      <text
        x="300"
        y="370"
        text-anchor="middle"
        font-size="32"
        fill="#777777"
      >
        画像が見つかりません
      </text>

      <text
        x="300"
        y="430"
        text-anchor="middle"
        font-size="30"
        fill="#555555"
      >
        ${escapeXML(person.name)}
      </text>

    </svg>
  `;


  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(svg)
  );

}


// ========================================
// XMLエスケープ
// ========================================

function escapeXML(
  text
) {

  return String(text)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&apos;"
    );

}


// ========================================
// 画像を設定
// ========================================

function setFaceImage(
  element,
  person
) {

  if (
    !element ||
    !person
  ) {

    return;

  }


  element.alt =
    person.name;


  // エラー時
  element.onerror =
    function () {

      element.onerror = null;

      element.src =
        createErrorImage(
          person
        );

    };


  /*
   * people.csvには
   *
   * 001.jpg
   * 002.jpg
   * ...
   *
   * と入っているため、
   *
   * ./images/001.jpg
   *
   * の形で読み込む
   */

  element.src =
    "./images/" +
    encodeURIComponent(
      person.image
    );

}


// ========================================
// プログレス表示
// ========================================

function updateProgress() {

  let completed;

  let target;

  let phase;


  // ==============================
  // 通常モード
  // ==============================

  if (
    mode === "normal"
  ) {

    completed =
      currentComparison;

    target =
      normalTarget;


    if (
      currentComparison <
      phase1Pairs.length
    ) {

      phase =
        "全員をチェックしています";

    } else {

      phase =
        "上位候補を絞り込んでいます";

    }

  }


  // ==============================
  // 精密モード
  // ==============================

  else if (
    mode === "refine"
  ) {

    completed =
      currentComparison -
      refinementStart;


    target =
      REFINE_COMPARISONS;


    phase =
      "TOP候補をさらに厳密に比較中";

  }


  else {

    return;

  }


  const percent =
    Math.min(
      100,
      Math.round(
        (
          completed /
          target
        ) * 100
      )
    );


  if (progressBar) {

    progressBar.style.width =
      percent + "%";

  }


  if (progressText) {

    if (
      mode === "refine"
    ) {

      progressText.textContent =
        `${Math.max(
          0,
          completed
        )} / ${REFINE_COMPARISONS} 回`;

    } else {

      progressText.textContent =
        `${completed} / ${target} 回`;

    }

  }


  if (phaseText) {

    phaseText.textContent =
      phase;

  }

}


// ========================================
// 次の比較を表示
// ========================================

function showNextComparison() {

  const pair =
    chooseNextPair();


  // 比較対象がなくなった
  if (!pair) {

    showResult();

    return;

  }


  currentPair =
    pair;


  // 左画像
  setFaceImage(
    leftImage,
    pair[0]
  );


  // 右画像
  setFaceImage(
    rightImage,
    pair[1]
  );


  updateProgress();

}


// ========================================
// 選択処理
// ========================================

function handleChoice(
  choice
) {

  if (
    isProcessing ||
    !currentPair ||
    mode === "result"
  ) {

    return;

  }


  isProcessing = true;


  // スコア更新
  applyChoice(
    choice
  );


  // 比較記録
  recordComparison();


  // 比較回数を進める
  currentComparison++;


  // 保存
  saveState();


  // 少し間を置く
  setTimeout(
    () => {

      isProcessing =
        false;


      // ==============================
      // 精密比較終了
      // ==============================

      if (
        mode === "refine" &&
        currentComparison >=
          refinementTarget
      ) {

        showResult();

        return;

      }


      // ==============================
      // 通常比較終了
      // ==============================

      if (
        mode === "normal" &&
        currentComparison >=
          normalTarget
      ) {

        showResult();

        return;

      }


      // 次の比較
      showNextComparison();

    },
    120
  );

}


// ========================================
// 結果表示
// ========================================

function showResult() {

  mode =
    "result";


  currentPair =
    null;


  // 比較画面を隠す
  if (compareScreen) {

    compareScreen.style.display =
      "none";

  }


  // 結果画面を表示
  if (resultScreen) {

    resultScreen.classList.remove(
      "hidden"
    );

    resultScreen.style.display =
      "block";

  }


  // ランキング
  const ranking =
    getRanking();


  const topCount =
    Math.min(
      9,
      ranking.length
    );


  // ==============================
  // TOP9を作る
  // ==============================

  if (rankingGrid) {

    rankingGrid.innerHTML =
      "";


    ranking
      .slice(
        0,
        topCount
      )
      .forEach(
        (
          person,
          index
        ) => {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "ranking-card";


          // 順位
          const rank =
            document.createElement(
              "div"
            );


          rank.className =
            "ranking-number";


          rank.textContent =
            `${index + 1}位`;


          // 画像
          const img =
            document.createElement(
              "img"
            );


          setFaceImage(
            img,
            person
          );


          img.alt =
            `${index + 1}位 ${person.name}`;


          // 名前
          const name =
            document.createElement(
              "div"
            );


          name.className =
            "ranking-name";


          name.textContent =
            person.name;


          // カードに追加
          card.appendChild(
            rank
          );

          card.appendChild(
            img
          );

          card.appendChild(
            name
          );


          rankingGrid.appendChild(
            card
          );

        }
      );

  }


  // ==============================
  // 結果説明
  // ==============================

  const resultDescription =
    document.getElementById(
      "resultDescription"
    );


  if (resultDescription) {

    if (
      currentComparison <=
      normalTarget
    ) {

      resultDescription.textContent =
        `${currentComparison}回の比較結果です。`;

    } else {

      resultDescription.textContent =
        `${currentComparison}回の比較結果です。`;

    }

  }


  // ==============================
  // 精密比較ボタン
  // ==============================

  if (refineButton) {

    if (
      ranking.length >= 2
    ) {

      refineButton.style.display =
        "block";

    } else {

      refineButton.style.display =
        "none";

    }


    if (
      currentComparison <=
      normalTarget
    ) {

      refineButton.textContent =
        "TOP9をもっと厳密にする（＋30回）";

    } else {

      refineButton.textContent =
        "さらに＋30回比較する";

    }

  }


  // 保存
  saveState();

}


// ========================================
// 精密比較開始
// ========================================

function startRefinement() {

  if (
    people.length < 2
  ) {

    return;

  }


  mode =
    "refine";


  refinementStart =
    currentComparison;


  refinementTarget =
    currentComparison +
    REFINE_COMPARISONS;


  // 比較画面表示
  if (compareScreen) {

    compareScreen.style.display =
      "block";

  }


  // 結果画面非表示
  if (resultScreen) {

    resultScreen.style.display =
      "none";

  }


  saveState();


  showNextComparison();

}


// ========================================
// 初期状態作成
// ========================================

function initializeFreshState() {

  initializeScores();


  phase1Pairs =
    createPhase1Pairs();


  currentComparison =
    0;


  mode =
    "normal";


  refinementStart =
    0;


  refinementTarget =
    null;


  currentPair =
    null;


  saveState();

}


// ========================================
// 人物リストの識別
//
// CSVを変更した場合に
// 保存データを無効にする
// ========================================

function getPeopleSignature() {

  return people
    .map(
      person =>
        `${person.id}|${person.name}|${person.image}`
    )
    .join("||");

}


// ========================================
// LocalStorage保存
// ========================================

function saveState() {

  const data = {

    version: 4,

    peopleSignature:
      getPeopleSignature(),

    scores:
      scores,

    comparisonCounts:
      comparisonCounts,

    comparisonHistory:
      comparisonHistory,

    phase1Pairs:
      phase1Pairs,

    currentComparison:
      currentComparison,

    mode:
      mode,

    refinementStart:
      refinementStart,

    refinementTarget:
      refinementTarget

  };


  try {

    localStorage.setItem(
      STATE_KEY,
      JSON.stringify(data)
    );

  } catch (error) {

    console.error(
      "LocalStorageへの保存に失敗しました",
      error
    );

  }

}


// ========================================
// LocalStorage読み込み
// ========================================

function loadState() {

  try {

    const raw =
      localStorage.getItem(
        STATE_KEY
      );


    if (!raw) {

      return false;

    }


    const data =
      JSON.parse(raw);


    // バージョン確認
    if (
      data.version !== 4
    ) {

      return false;

    }


    // CSV確認
    if (
      data.peopleSignature !==
      getPeopleSignature()
    ) {

      return false;

    }


    // データ確認
    if (
      !data.scores ||
      !data.comparisonCounts ||
      !data.comparisonHistory ||
      !Array.isArray(
        data.phase1Pairs
      )
    ) {

      return false;

    }


    scores =
      data.scores;


    comparisonCounts =
      data.comparisonCounts;


    comparisonHistory =
      data.comparisonHistory;


    phase1Pairs =
      data.phase1Pairs;


    currentComparison =
      Number(
        data.currentComparison
      ) || 0;


    mode =
      data.mode ||
      "normal";


    refinementStart =
      Number(
        data.refinementStart
      ) || 0;


    refinementTarget =
      data.refinementTarget !==
        null &&
      data.refinementTarget !==
        undefined

        ? Number(
            data.refinementTarget
          )

        : null;


    // 全員のスコア確認
    for (
      const person of people
    ) {

      if (
        typeof scores[
          person.id
        ] !== "number"
      ) {

        return false;

      }


      if (
        typeof comparisonCounts[
          person.id
        ] !== "number"
      ) {

        return false;

      }

    }


    return true;

  } catch (error) {

    console.error(
      "保存データの読み込みに失敗しました",
      error
    );


    return false;

  }

}


// ========================================
// 最初からやり直す
// ========================================

function resetGame() {

  const confirmed =
    window.confirm(
      "今までの比較結果を消して、最初からやり直しますか？"
    );


  if (!confirmed) {

    return;

  }


  try {

    localStorage.removeItem(
      STATE_KEY
    );

  } catch (error) {

    console.error(error);

  }


  window.location.reload();

}


// ========================================
// 人物データ読み込み
// ========================================

async function loadPeople() {

  try {

    if (phaseText) {

      phaseText.textContent =
        "人物データを読み込んでいます…";

    }


    // CSV読み込み
    const response =
      await fetch(
        "./people.csv",
        {
          cache: "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `people.csvを読み込めませんでした（${response.status}）`
      );

    }


    const text =
      await response.text();


    // CSV解析
    people =
      parseCSV(text);


    // 人数確認
    if (
      people.length < 2
    ) {

      throw new Error(
        "比較する人物が2人未満です"
      );

    }


    // ID重複確認
    const ids =
      people.map(
        person => person.id
      );


    const uniqueIds =
      new Set(ids);


    if (
      uniqueIds.size !==
      people.length
    ) {

      throw new Error(
        "people.csvに重複したidがあります"
      );

    }


    // 必須項目確認
    for (
      const person of people
    ) {

      if (
        !person.id ||
        !person.name ||
        !person.image
      ) {

        throw new Error(
          `people.csvに空欄があります：${JSON.stringify(person)}`
        );

      }

    }


    // ID → 人物
    peopleById =
      new Map(
        people.map(
          person => [
            person.id,
            person
          ]
        )
      );


    // 比較回数
    normalTarget =
      calculateNormalTarget();


    // 保存データ読み込み
    const loaded =
      loadState();


    if (!loaded) {

      initializeFreshState();

    }


    // ==============================
    // 画面状態を復元
    // ==============================

    if (
      mode === "refine" &&
      refinementTarget !== null &&
      currentComparison <
        refinementTarget
    ) {

      if (compareScreen) {

        compareScreen.style.display =
          "block";

      }


      if (resultScreen) {

        resultScreen.style.display =
          "none";

      }


      showNextComparison();

    }


    else if (
      mode === "normal" &&
      currentComparison <
        normalTarget
    ) {

      if (compareScreen) {

        compareScreen.style.display =
          "block";

      }


      if (resultScreen) {

        resultScreen.style.display =
          "none";

      }


      showNextComparison();

    }


    else {

      showResult();

    }


    console.log(
      `GMMTV好き顔ソート：${people.length}人`
    );


    console.log(
      `通常比較：${normalTarget}回`
    );


    console.log(
      `初回全員チェック：${phase1Pairs.length}回`
    );

  }


  catch (error) {

    console.error(
      "初期化エラー：",
      error
    );


    if (phaseText) {

      phaseText.textContent =
        "読み込みエラー";

    }


    if (progressText) {

      progressText.textContent =
        error.message;

    }


    alert(
      "データの読み込みに失敗しました。\n\n" +
      error.message +
      "\n\n" +
      "ブラウザの開発者ツール（F12）のConsoleにも詳細が出ています。"
    );

  }

}


// ========================================
// ボタンイベント
//
// ★ここでは const を再宣言しない
// ========================================

if (leftChoice) {

  leftChoice.addEventListener(
    "click",
    () => {

      handleChoice(
        "left"
      );

    }
  );

}


if (rightChoice) {

  rightChoice.addEventListener(
    "click",
    () => {

      handleChoice(
        "right"
      );

    }
  );

}


if (bothChoice) {

  bothChoice.addEventListener(
    "click",
    () => {

      handleChoice(
        "both"
      );

    }
  );

}


if (neitherChoice) {

  neitherChoice.addEventListener(
    "click",
    () => {

      handleChoice(
        "neither"
      );

    }
  );

}


if (refineButton) {

  refineButton.addEventListener(
    "click",
    startRefinement
  );

}


if (resetButton) {

  resetButton.addEventListener(
    "click",
    resetGame
  );

}


// ========================================
// 起動
// ========================================

loadPeople();
