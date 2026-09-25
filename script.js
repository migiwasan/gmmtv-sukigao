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


// LocalStorage
const STATE_KEY =
  "gmmtv-sukigao-state-v4";


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
// 「ひとつ前に戻る」用
// ========================================

let undoState = null;


// ========================================
// HTML要素
// ========================================

const compareScreen =
  document.getElementById(
    "compareScreen"
  );

const resultScreen =
  document.getElementById(
    "resultScreen"
  );


const leftImage =
  document.getElementById(
    "leftImage"
  );

const rightImage =
  document.getElementById(
    "rightImage"
  );


const progressBar =
  document.getElementById(
    "progressBar"
  );

const progressText =
  document.getElementById(
    "progressText"
  );

const phaseText =
  document.getElementById(
    "phaseText"
  );


const rankingGrid =
  document.getElementById(
    "rankingGrid"
  );


const leftChoice =
  document.getElementById(
    "leftChoice"
  );

const rightChoice =
  document.getElementById(
    "rightChoice"
  );

const bothChoice =
  document.getElementById(
    "bothChoice"
  );

const neitherChoice =
  document.getElementById(
    "neitherChoice"
  );


const undoButton =
  document.getElementById(
    "undoButton"
  );


const refineButton =
  document.getElementById(
    "refineButton"
  );

const resetButton =
  document.getElementById(
    "resetButton"
  );


// ========================================
// CSV読み込み
// ========================================

function parseCSV(text) {

  text =
    text.replace(
      /^\uFEFF/,
      ""
    );


  const rows = [];

  let row = [];

  let cell = "";

  let inQuotes = false;


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const char =
      text[i];

    const next =
      text[i + 1];


    if (
      char === '"'
    ) {

      if (
        inQuotes &&
        next === '"'
      ) {

        cell += '"';

        i++;

      } else {

        inQuotes =
          !inQuotes;

      }

    }


    else if (
      char === "," &&
      !inQuotes
    ) {

      row.push(
        cell.trim()
      );

      cell = "";

    }


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


      row.push(
        cell.trim()
      );

      cell = "";


      if (
        row.some(
          value =>
            value !== ""
        )
      ) {

        rows.push(
          row
        );

      }


      row = [];

    }


    else {

      cell += char;

    }

  }


  if (
    cell !== "" ||
    row.length > 0
  ) {

    row.push(
      cell.trim()
    );


    if (
      row.some(
        value =>
          value !== ""
      )
    ) {

      rows.push(
        row
      );

    }

  }


  if (
    rows.length < 2
  ) {

    throw new Error(
      "people.csvにデータがありません"
    );

  }


  const headers =
    rows[0].map(
      header =>
        header.trim()
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
    .map(
      row => ({

        id:
          row[idIndex] || "",

        name:
          row[nameIndex] || "",

        image:
          row[imageIndex] || ""

      })
    );

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
// 初回比較ペア
// ========================================

function createPhase1Pairs() {

  const ids =
    shuffle(
      people.map(
        person =>
          person.id
      )
    );


  const pairs = [];


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
      ids[
        opponentIndex
      ];


    pairs.push([
      lastId,
      opponentId
    ]);

  }


  return pairs;

}


// ========================================
// 通常比較回数
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
// ペアキー
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
// ペア記録
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
// 比較ペア選択
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


      const countDifference =
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


      const priority =
        pairCount * 100000 +
        scoreDifference +
        countDifference * 0.1;


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

      scores[
        person.id
      ] =
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


  if (
    choice === "left"
  ) {

    updateElo(
      left.id,
      right.id,
      1
    );

  }


  else if (
    choice === "right"
  ) {

    updateElo(
      right.id,
      left.id,
      1
    );

  }


  else if (
    choice === "both"
  ) {

    scores[left.id] +=
      BOTH_BONUS;

    scores[right.id] +=
      BOTH_BONUS;

  }


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
// 比較記録
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
// ランキング
// ========================================

function getRanking() {

  return [
    ...people
  ].sort(
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
// 次の比較ペア
// ========================================

function chooseNextPair() {

  // ==============================
  // 通常モード
  // ==============================

  if (
    mode === "normal"
  ) {

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
  // 精密比較
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
// 画像エラー用
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
        ${escapeXML(
          person.name
        )}
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
// 画像表示
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


  element.onerror =
    function () {

      element.onerror =
        null;


      element.src =
        createErrorImage(
          person
        );

    };


  element.src =
    "./images/" +
    encodeURIComponent(
      person.image
    );

}


// ========================================
// プログレス
// ========================================

function updateProgress() {

  let completed;

  let target;

  let phase;


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


  if (!pair) {

    showResult();

    return;

  }


  currentPair =
    pair;


  setFaceImage(
    leftImage,
    pair[0]
  );


  setFaceImage(
    rightImage,
    pair[1]
  );


  updateProgress();

}


// ========================================
// 「ひとつ前の状態」を保存
// ========================================

function saveUndoState() {

  if (!currentPair) {

    return;

  }


  undoState = {

    scores:
      JSON.parse(
        JSON.stringify(
          scores
        )
      ),

    comparisonCounts:
      JSON.parse(
        JSON.stringify(
          comparisonCounts
        )
      ),

    comparisonHistory:
      JSON.parse(
        JSON.stringify(
          comparisonHistory
        )
      ),

    currentComparison:
      currentComparison,

    currentPair: [
      currentPair[0].id,
      currentPair[1].id
    ],

    mode:
      mode,

    refinementStart:
      refinementStart,

    refinementTarget:
      refinementTarget

  };


  updateUndoButton();

}


// ========================================
// 「ひとつ前」に戻る
// ========================================

function undoLastChoice() {

  if (
    !undoState ||
    isProcessing
  ) {

    return;

  }


  // スコア復元
  scores =
    JSON.parse(
      JSON.stringify(
        undoState.scores
      )
    );


  // 比較回数復元
  comparisonCounts =
    JSON.parse(
      JSON.stringify(
        undoState.comparisonCounts
      )
    );


  // ペア履歴復元
  comparisonHistory =
    JSON.parse(
      JSON.stringify(
        undoState.comparisonHistory
      )
    );


  // 比較回数復元
  currentComparison =
    undoState.currentComparison;


  // モード復元
  mode =
    undoState.mode;


  refinementStart =
    undoState.refinementStart;


  refinementTarget =
    undoState.refinementTarget;


  // 比較対象復元
  if (
    undoState.currentPair
  ) {

    currentPair = [

      peopleById.get(
        undoState.currentPair[0]
      ),

      peopleById.get(
        undoState.currentPair[1]
      )

    ];

  } else {

    currentPair = null;

  }


  // さらに戻ることはできない
  undoState =
    null;


  // 保存
  saveState();


  updateUndoButton();


  // 比較画面表示
  if (compareScreen) {

    compareScreen.style.display =
      "block";

  }


  if (resultScreen) {

    resultScreen.style.display =
      "none";

  }


  // 前の比較を表示
  if (currentPair) {

    setFaceImage(
      leftImage,
      currentPair[0]
    );


    setFaceImage(
      rightImage,
      currentPair[1]
    );


    updateProgress();

  }

}


// ========================================
// 戻るボタン状態
// ========================================

function updateUndoButton() {

  if (!undoButton) {

    return;

  }


  undoButton.disabled =
    !undoState;

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


  /*
   * ★重要
   *
   * 選択を反映する前に
   * 現在の状態を保存する
   */

  saveUndoState();


  isProcessing =
    true;


  // スコア更新
  applyChoice(
    choice
  );


  // 比較記録
  recordComparison();


  // 比較回数
  currentComparison++;


  // 保存
  saveState();


  setTimeout(
    () => {

      isProcessing =
        false;


      // 精密比較終了
      if (
        mode === "refine" &&
        currentComparison >=
          refinementTarget
      ) {

        showResult();

        return;

      }


      // 通常比較終了
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


  // 戻るボタン無効
  undoState =
    null;


  updateUndoButton();


  // 比較画面非表示
  if (compareScreen) {

    compareScreen.style.display =
      "none";

  }


  // 結果画面表示
  if (resultScreen) {

    resultScreen.classList.remove(
      "hidden"
    );

    resultScreen.style.display =
      "block";

  }


  const ranking =
    getRanking();


  const topCount =
    Math.min(
      9,
      ranking.length
    );


  // TOP9
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


  // 説明
  const resultDescription =
    document.getElementById(
      "resultDescription"
    );


  if (resultDescription) {

    resultDescription.textContent =
      `${currentComparison}回の比較結果です。`;

  }


  // 精密比較
  if (refineButton) {

    refineButton.style.display =
      "block";


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


  // 結果画面を隠す
  if (resultScreen) {

    resultScreen.style.display =
      "none";

  }


  // 比較画面を表示
  if (compareScreen) {

    compareScreen.style.display =
      "block";

  }


  saveState();


  showNextComparison();

}


// ========================================
// 初期状態
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


  undoState =
    null;


  saveState();

}


// ========================================
// 人物データの識別
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
// 保存
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
// 保存データ読み込み
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


    if (
      data.version !== 4
    ) {

      return false;

    }


    if (
      data.peopleSignature !==
      getPeopleSignature()
    ) {

      return false;

    }


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

  }

  catch (error) {

    console.error(
      "保存データの読み込みに失敗しました",
      error
    );


    return false;

  }

}


// ========================================
// リセット
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

  }

  catch (error) {

    console.error(
      error
    );

  }


  window.location.reload();

}


// ========================================
// CSV読み込み
// ========================================

async function loadPeople() {

  try {

    if (phaseText) {

      phaseText.textContent =
        "人物データを読み込んでいます…";

    }


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


    people =
      parseCSV(text);


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
        person =>
          person.id
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


    // 必須項目
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


    // IDから人物を取得
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


    // 保存データ
    const loaded =
      loadState();


    if (!loaded) {

      initializeFreshState();

    }


    // ==============================
    // 画面復元
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
      error.message
    );

  }

}


// ========================================
// ボタンイベント
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


// ★ひとつ前に戻る
if (undoButton) {

  undoButton.addEventListener(
    "click",
    undoLastChoice
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
