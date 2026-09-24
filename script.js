/* =========================================================
   好き顔ソート
   ========================================================= */


// ================================
// 基本設定
// ================================

const NORMAL_COMPARISONS = 100;
const REFINE_COMPARISONS = 30;

const TOTAL_PEOPLE = people.length;

// 第2フェーズでは上位20人を中心に比較
const PHASE2_CANDIDATES = 20;

// 精密比較では上位15人に絞る
const REFINE_CANDIDATES = 15;


// Elo風スコア
const INITIAL_SCORE = 1500;
const K_FACTOR = 32;


// 「どっちも好き」
const BOTH_BONUS = 8;

// 「どっちも好きじゃない」
const NEITHER_PENALTY = 8;


// ================================
// データ
// ================================

let people = [];

let scores = {};

let comparisonCounts = {};

let comparisonHistory = {};

let currentPair = null;

let currentComparison = 0;

let isProcessing = false;


// ================================
// DOM
// ================================

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

const resultTitle =
  document.getElementById("resultTitle");

const resultDescription =
  document.getElementById("resultDescription");

const refineButton =
  document.getElementById("refineButton");

const resetButton =
  document.getElementById("resetButton");


// ================================
// CSV読み込み
// ================================

async function loadPeople() {

  const response = await fetch("people.csv");

  if (!response.ok) {
    throw new Error("people.csvを読み込めませんでした");
  }

  const text = await response.text();

  people = parseCSV(text);

  if (people.length !== TOTAL_PEOPLE) {

    alert(
      `people.csvには${TOTAL_PEOPLE}人必要です。\n` +
      `現在は${people.length}人です。`
    );

    throw new Error("人数が100人ではありません");
  }


  initializeData();

  loadSavedData();

  updateScreen();

  if (currentComparison >= NORMAL_COMPARISONS) {

    showResult();

  } else {

    showNextComparison();
  }
}


// ================================
// CSV parser
// ================================

function parseCSV(text) {

  const lines =
    text
      .trim()
      .split(/\r?\n/);

  const headers =
    lines.shift()
      .split(",")
      .map(x => x.trim());


  return lines.map(line => {

    const values = [];

    let current = "";
    let insideQuotes = false;


    for (let i = 0; i < line.length; i++) {

      const char = line[i];

      if (char === '"') {

        insideQuotes = !insideQuotes;

      } else if (
        char === "," &&
        !insideQuotes
      ) {

        values.push(current.trim());

        current = "";

      } else {

        current += char;
      }
    }

    values.push(current.trim());


    const person = {};

    headers.forEach((header, index) => {

      person[header] =
        values[index] || "";

    });

    return person;
  });
}


// ================================
// 初期データ
// ================================

function initializeData() {

  scores = {};

  comparisonCounts = {};

  comparisonHistory = {};

  people.forEach(person => {

    scores[person.id] = INITIAL_SCORE;

    comparisonCounts[person.id] = 0;

  });
}


// ================================
// localStorage
// ================================

function saveData() {

  const data = {

    scores,
    comparisonCounts,
    comparisonHistory,
    currentComparison

  };

  localStorage.setItem(
    "sukigao-sort-data",
    JSON.stringify(data)
  );
}


function loadSavedData() {

  const saved =
    localStorage.getItem(
      "sukigao-sort-data"
    );

  if (!saved) {
    return;
  }


  try {

    const data =
      JSON.parse(saved);


    if (
      data.scores &&
      data.comparisonCounts
    ) {

      scores =
        data.scores;

      comparisonCounts =
        data.comparisonCounts;

      comparisonHistory =
        data.comparisonHistory || {};

      currentComparison =
        data.currentComparison || 0;
    }

  } catch (error) {

    console.log(
      "保存データを読み込めませんでした",
      error
    );
  }
}


// ================================
// ペアキー
// ================================

function getPairKey(id1, id2) {

  return [id1, id2]
    .sort()
    .join("__");
}


// ================================
// ペアの比較回数
// ================================

function getPairCount(id1, id2) {

  const key =
    getPairKey(id1, id2);

  return comparisonHistory[key] || 0;
}


// ================================
// ペア比較回数を増やす
// ================================

function recordPair(id1, id2) {

  const key =
    getPairKey(id1, id2);

  comparisonHistory[key] =
    (comparisonHistory[key] || 0) + 1;
}


// ================================
// シャッフル
// ================================

function shuffle(array) {

  const result =
    [...array];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() * (i + 1)
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


// ================================
// 第1フェーズ用ペア
//
// 100人をシャッフルして
// 50組作る
// →全員が必ず1回比較される
// ================================

let phase1Pairs = [];

function createPhase1Pairs() {

  const shuffled =
    shuffle(people);

  phase1Pairs = [];

  for (
    let i = 0;
    i < shuffled.length;
    i += 2
  ) {

    phase1Pairs.push([
      shuffled[i],
      shuffled[i + 1]
    ]);
  }
}


// ================================
// 第2フェーズ / 精密比較
// の候補者取得
// ================================

function getTopCandidates(count) {

  return [...people]
    .sort(
      (a, b) =>
        scores[b.id] -
        scores[a.id]
    )
    .slice(0, count);
}


// ================================
// 次に比較するペアを探す
//
// ・スコアが近い
// ・まだ比較していない
// ・比較回数が少ない
//
// を優先
// ================================

function findBestPair(candidates) {

  const pairs = [];


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


      const count =
        getPairCount(
          a.id,
          b.id
        );


      const scoreDifference =
        Math.abs(
          scores[a.id] -
          scores[b.id]
        );


      /*
       * 未比較ペアをかなり優先。
       *
       * 同じ回数なら
       * スコアが近いペアを優先。
       */

      const priority =
        count * 10000 +
        scoreDifference;


      pairs.push({
        a,
        b,
        priority,
        count
      });
    }
  }


  pairs.sort(
    (x, y) =>
      x.priority -
      y.priority
  );


  if (pairs.length === 0) {
    return null;
  }


  /*
   * 完全に同順位の候補ばかりにならないよう、
   * 上位数組からランダムに選ぶ。
   */

  const minimumPriority =
    pairs[0].priority;

  const closePairs =
    pairs.filter(
      pair =>
        pair.priority <=
        minimumPriority + 30
    );


  const selected =
    closePairs[
      Math.floor(
        Math.random() *
        closePairs.length
      )
    ];


  return [
    selected.a,
    selected.b
  ];
}


// ================================
// 次の比較を表示
// ================================

function showNextComparison() {

  let pair;


  // ------------------------------
  // 1～50回
  // ------------------------------

  if (currentComparison < 50) {

    if (phase1Pairs.length === 0) {

      createPhase1Pairs();
    }


    const index =
      currentComparison;

    pair =
      phase1Pairs[index];

  }


  // ------------------------------
  // 51～100回
  // ------------------------------

  else {

    const candidates =
      getTopCandidates(
        PHASE2_CANDIDATES
      );


    pair =
      findBestPair(
        candidates
      );
  }


  if (!pair) {

    showResult();

    return;
  }


  currentPair = pair;

  recordPair(
    pair[0].id,
    pair[1].id
  );


  comparisonCounts[
    pair[0].id
  ]++;

  comparisonCounts[
    pair[1].id
  ]++;


  leftImage.src =
    `images/${pair[0].image}`;

  rightImage.src =
    `images/${pair[1].image}`;


  leftImage.alt =
    pair[0].name;

  rightImage.alt =
    pair[1].name;


  updateScreen();
}


// ================================
// 画面情報更新
// ================================

function updateScreen() {

  let total =
    NORMAL_COMPARISONS;

  let phase =
    "";


  if (currentComparison < 50) {

    phase =
      "全員チェック中";

  } else {

    phase =
      "TOP候補を絞り込み中";
  }


  phaseText.textContent =
    phase;


  progressText.textContent =
    `${currentComparison} / ${total} 回`;


  const percentage =
    Math.min(
      currentComparison /
      total *
      100,
      100
    );


  progressBar.style.width =
    `${percentage}%`;
}


// ================================
// 勝敗処理
// ================================

function updateElo(
  winnerId,
  loserId
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
        (loserScore - winnerScore) / 400
      )
    );


  const change =
    K_FACTOR *
    (1 - expectedWinner);


  scores[winnerId] +=
    change;

  scores[loserId] -=
    change;
}


// ================================
// 選択結果
// ================================

function handleChoice(choice) {

  if (
    isProcessing ||
    !currentPair
  ) {
    return;
  }


  isProcessing = true;


  const left =
    currentPair[0];

  const right =
    currentPair[1];


  // ------------------------------
  // 左が好き
  // ------------------------------

  if (choice === "left") {

    updateElo(
      left.id,
      right.id
    );
  }


  // ------------------------------
  // 右が好き
  // ------------------------------

  else if (choice === "right") {

    updateElo(
      right.id,
      left.id
    );
  }


  // ------------------------------
  // どっちも好き
  // ------------------------------

  else if (choice === "both") {

    scores[left.id] +=
      BOTH_BONUS;

    scores[right.id] +=
      BOTH_BONUS;
  }


  // ------------------------------
  // どっちも好きじゃない
  // ------------------------------

  else if (choice === "neither") {

    scores[left.id] -=
      NEITHER_PENALTY;

    scores[right.id] -=
      NEITHER_PENALTY;
  }


  currentComparison++;

  saveData();


  setTimeout(() => {

    isProcessing = false;


    if (
      currentComparison >=
      NORMAL_COMPARISONS
    ) {

      showResult();

    } else {

      showNextComparison();
    }

  }, 120);
}


// ================================
// 結果表示
// ================================

function showResult() {

  compareScreen.classList.add(
    "hidden"
  );

  resultScreen.classList.remove(
    "hidden"
  );


  const ranking =
    [...people]
      .sort(
        (a, b) =>
          scores[b.id] -
          scores[a.id]
      )
      .slice(0, 9);


  rankingGrid.innerHTML =
    "";


  ranking.forEach(
    (person, index) => {

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "rank-card";


      card.innerHTML = `

        <div class="rank-number">
          ${index + 1}
        </div>

        <img
          src="images/${person.image}"
          alt="${escapeHTML(person.name)}"
        >

        <div class="rank-name">
          ${escapeHTML(person.name)}
        </div>

      `;


      rankingGrid.appendChild(
        card
      );
    }
  );


  if (
    currentComparison ===
    NORMAL_COMPARISONS
  ) {

    resultTitle.textContent =
      "あなたの好き顔 TOP9";


    resultDescription.textContent =
      "100回の比較から選ばれた9人です。";

    refineButton.textContent =
      "TOP9をもっと厳密にする（＋30回）";

    refineButton.style.display =
      "block";

  } else {

    resultTitle.textContent =
      "あなたの好き顔 TOP9";


    resultDescription.textContent =
      `追加比較を含む${currentComparison}回の比較結果です。`;


    refineButton.textContent =
      "さらに＋30回比較する";


    refineButton.style.display =
      "block";
  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// ================================
// 精密比較開始
// ================================

function startRefinement() {

  compareScreen.classList.remove(
    "hidden"
  );

  resultScreen.classList.add(
    "hidden"
  );


  // 精密比較30回
  //
  // currentComparisonが100なら
  // 100 → 130
  //
  // 130なら
  // 130 → 160
  //
  // と追加できる。

  const target =
    currentComparison +
    REFINE_COMPARISONS;


  // 既存の比較回数とは別に
  // 「精密モード中」の上限を保存

  localStorage.setItem(
    "sukigao-refinement-target",
    target
  );


  phaseText.textContent =
    "TOP9精密チェック中";


  showRefinementComparison();
}


// ================================
// 精密比較
// ================================

function showRefinementComparison() {

  const target =
    Number(
      localStorage.getItem(
        "sukigao-refinement-target"
      )
    );


  if (
    !target ||
    currentComparison >= target
  ) {

    localStorage.removeItem(
      "sukigao-refinement-target"
    );

    saveData();

    showResult();

    return;
  }


  const candidates =
    getTopCandidates(
      REFINE_CANDIDATES
    );


  const pair =
    findBestPair(
      candidates
    );


  if (!pair) {

    showResult();

    return;
  }


  currentPair =
    pair;


  recordPair(
    pair[0].id,
    pair[1].id
  );


  comparisonCounts[
    pair[0].id
  ]++;

  comparisonCounts[
    pair[1].id
  ]++;


  leftImage.src =
    `images/${pair[0].image}`;

  rightImage.src =
    `images/${pair[1].image}`;


  leftImage.alt =
    pair[0].name;

  rightImage.alt =
    pair[1].name;


  updateRefinementProgress();
}


// ================================
// 精密比較の進捗
// ================================

function updateRefinementProgress() {

  const target =
    Number(
      localStorage.getItem(
        "sukigao-refinement-target"
      )
    );


  const start =
    target -
    REFINE_COMPARISONS;


  const completed =
    currentComparison -
    start;


  const progress =
    Math.min(
      completed /
      REFINE_COMPARISONS *
      100,
      100
    );


  phaseText.textContent =
    "TOP9精密チェック中";


  progressText.textContent =
    `${Math.max(completed, 0)} / ${REFINE_COMPARISONS} 回`;

  progressBar.style.width =
    `${progress}%`;
}


// ================================
// 精密モードの選択処理
// ================================

function handleRefinementChoice(choice) {

  if (
    isProcessing ||
    !currentPair
  ) {
    return;
  }


  isProcessing = true;


  const left =
    currentPair[0];

  const right =
    currentPair[1];


  if (choice === "left") {

    updateElo(
      left.id,
      right.id
    );

  } else if (choice === "right") {

    updateElo(
      right.id,
      left.id
    );

  } else if (choice === "both") {

    scores[left.id] +=
      BOTH_BONUS;

    scores[right.id] +=
      BOTH_BONUS;

  } else if (choice === "neither") {

    scores[left.id] -=
      NEITHER_PENALTY;

    scores[right.id] -=
      NEITHER_PENALTY;
  }


  currentComparison++;

  saveData();


  setTimeout(() => {

    isProcessing = false;

    showRefinementComparison();

  }, 120);
}


// ================================
// XSS対策
// ================================

function escapeHTML(str) {

  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ================================
// 通常モードのボタン
// ================================

document
  .getElementById("leftChoice")
  .addEventListener(
    "click",
    () => {

      const target =
        localStorage.getItem(
          "sukigao-refinement-target"
        );

      if (target) {

        handleRefinementChoice(
          "left"
        );

      } else {

        handleChoice("left");
      }
    }
  );


document
  .getElementById("rightChoice")
  .addEventListener(
    "click",
    () => {

      const target =
        localStorage.getItem(
          "sukigao-refinement-target"
        );

      if (target) {

        handleRefinementChoice(
          "right"
        );

      } else {

        handleChoice("right");
      }
    }
  );


document
  .getElementById("bothChoice")
  .addEventListener(
    "click",
    () => {

      const target =
        localStorage.getItem(
          "sukigao-refinement-target"
        );

      if (target) {

        handleRefinementChoice(
          "both"
        );

      } else {

        handleChoice("both");
      }
    }
  );


document
  .getElementById("neitherChoice")
  .addEventListener(
    "click",
    () => {

      const target =
        localStorage.getItem(
          "sukigao-refinement-target"
        );

      if (target) {

        handleRefinementChoice(
          "neither"
        );

      } else {

        handleChoice("neither");
      }
    }
  );


// ================================
// TOP9 → 精密比較
// ================================

refineButton.addEventListener(
  "click",
  startRefinement
);


// ================================
// リセット
// ================================

resetButton.addEventListener(
  "click",
  () => {

    const confirmed =
      confirm(
        "比較結果をすべて消して、最初からやり直しますか？"
      );


    if (!confirmed) {
      return;
    }


    localStorage.removeItem(
      "sukigao-sort-data"
    );

    localStorage.removeItem(
      "sukigao-refinement-target"
    );


    location.reload();
  }
);


// ================================
// 起動
// ================================

loadPeople()
  .catch(error => {

    console.error(error);

    alert(
      "データの読み込みに失敗しました。\n" +
      "people.csvとimagesフォルダを確認してください。"
    );

  });