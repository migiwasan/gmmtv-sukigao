// ========================================
// GMMTV好き顔ソート~mens~
// ========================================

// ---------- 設定 ----------
const BASE_COMPARISONS = 100;
const REFINE_COMPARISONS = 30;

const PHASE2_CANDIDATES = 20;
const REFINE_CANDIDATES = 15;

const INITIAL_SCORE = 1500;
const K_FACTOR = 32;

// 「両方好き」「どちらも好きではない」の補正
const BOTH_BONUS = 8;
const NEITHER_PENALTY = 8;

// 新しい保存データとして扱うためのキー
const STATE_KEY = "gmmtv-sukigao-state-v2";


// ---------- データ ----------
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
// normal
// refine
// result

let refinementStart = 0;
let refinementTarget = null;

let isProcessing = false;


// ---------- HTML要素 ----------
const compareScreen = document.getElementById("compareScreen");
const resultScreen = document.getElementById("resultScreen");

const leftImage = document.getElementById("leftImage");
const rightImage = document.getElementById("rightImage");

const leftName = document.getElementById("leftName");
const rightName = document.getElementById("rightName");

const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const phaseText = document.getElementById("phaseText");

const rankingGrid = document.getElementById("rankingGrid");

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
    text = text.replace(/^\uFEFF/, "");

    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        }

        else if (char === "," && !inQuotes) {
            row.push(cell.trim());
            cell = "";
        }

        else if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") {
                i++;
            }

            row.push(cell.trim());
            cell = "";

            if (row.some(value => value !== "")) {
                rows.push(row);
            }

            row = [];
        }

        else {
            cell += char;
        }
    }

    if (cell !== "" || row.length > 0) {
        row.push(cell.trim());

        if (row.some(value => value !== "")) {
            rows.push(row);
        }
    }

    if (rows.length < 2) {
        throw new Error("people.csvにデータがありません");
    }

    const headers = rows[0].map(header => header.trim());

    const idIndex = headers.indexOf("id");
    const nameIndex = headers.indexOf("name");
    const imageIndex = headers.indexOf("image");

    if (idIndex === -1 || nameIndex === -1 || imageIndex === -1) {
        throw new Error(
            "people.csvには「id,name,image」の3列が必要です"
        );
    }

    return rows.slice(1).map(row => ({
        id: row[idIndex] || "",
        name: row[nameIndex] || "",
        image: row[imageIndex] || ""
    }));
}


// ========================================
// シャッフル
// ========================================

function shuffle(array) {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}


// ========================================
// 初回比較ペア作成
// 全員が最低1回は登場する
// ========================================

function createPhase1Pairs() {
    const ids = shuffle(people.map(person => person.id));

    const pairs = [];

    for (let i = 0; i + 1 < ids.length; i += 2) {
        pairs.push([
            ids[i],
            ids[i + 1]
        ]);
    }

    // 人数が奇数の場合
    // 最後の1人をランダムな誰かと組ませる
    if (ids.length % 2 === 1) {
        const lastId = ids[ids.length - 1];

        const opponentIndex =
            Math.floor(Math.random() * (ids.length - 1));

        const opponentId = ids[opponentIndex];

        pairs.push([
            lastId,
            opponentId
        ]);
    }

    return pairs;
}


// ========================================
// 人数に応じた比較回数
// ========================================

function calculateNormalTarget() {
    const minimumForEveryone =
        Math.ceil(people.length / 2);

    // 121人なら
    // ceil(121 / 2) = 61
    // → 100回比較する
    //
    // 201人なら
    // ceil(201 / 2) = 101
    // → 全員登場のため101回
    return Math.max(
        BASE_COMPARISONS,
        minimumForEveryone
    );
}


// ========================================
// ペア識別
// ========================================

function getPairKey(id1, id2) {
    return [id1, id2]
        .sort()
        .join("__");
}


function getPairCount(id1, id2) {
    const key = getPairKey(id1, id2);

    return comparisonHistory[key] || 0;
}


function recordPair(id1, id2) {
    const key = getPairKey(id1, id2);

    comparisonHistory[key] =
        (comparisonHistory[key] || 0) + 1;
}


// ========================================
// スコア差が近く、まだ比較していない人を優先
// ========================================

function findBestPair(candidates) {
    if (candidates.length < 2) {
        return null;
    }

    const possiblePairs = [];

    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            const a = candidates[i];
            const b = candidates[j];

            const pairCount =
                getPairCount(a.id, b.id);

            const scoreDifference =
                Math.abs(
                    scores[a.id] - scores[b.id]
                );

            const individualCountDifference =
                Math.abs(
                    (comparisonCounts[a.id] || 0) -
                    (comparisonCounts[b.id] || 0)
                );

            /*
             * 優先順位
             *
             * ① 同じ2人を何度も比較しない
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
        (x, y) => x.priority - y.priority
    );

    // 完全に同点の場合に少しランダム性を入れる
    const topCount =
        Math.min(8, possiblePairs.length);

    const selected =
        possiblePairs[
            Math.floor(Math.random() * topCount)
        ];

    return [
        selected.a,
        selected.b
    ];
}


// ========================================
// 初期スコア
// ========================================

function initializeScores() {
    scores = {};
    comparisonCounts = {};
    comparisonHistory = {};

    people.forEach(person => {
        scores[person.id] = INITIAL_SCORE;
        comparisonCounts[person.id] = 0;
    });
}


// ========================================
// スコア計算
// ========================================

function applyChoice(choice) {
    if (!currentPair) {
        return;
    }

    const left = currentPair[0];
    const right = currentPair[1];

    if (choice === "left") {
        updateElo(left.id, right.id, 1);
    }

    else if (choice === "right") {
        updateElo(right.id, left.id, 1);
    }

    else if (choice === "both") {
        scores[left.id] += BOTH_BONUS;
        scores[right.id] += BOTH_BONUS;
    }

    else if (choice === "neither") {
        scores[left.id] -= NEITHER_PENALTY;
        scores[right.id] -= NEITHER_PENALTY;
    }
}


// ========================================
// Elo方式
// ========================================

function updateElo(winnerId, loserId, result) {
    const winnerScore = scores[winnerId];
    const loserScore = scores[loserId];

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
        (result - expectedWinner);

    scores[winnerId] += change;
    scores[loserId] -= change;
}


// ========================================
// 比較回数カウント
// ========================================

function recordComparison() {
    if (!currentPair) {
        return;
    }

    const left = currentPair[0];
    const right = currentPair[1];

    comparisonCounts[left.id] =
        (comparisonCounts[left.id] || 0) + 1;

    comparisonCounts[right.id] =
        (comparisonCounts[right.id] || 0) + 1;

    recordPair(left.id, right.id);
}


// ========================================
// 現在のランキング
// ========================================

function getRanking() {
    return [...people].sort((a, b) => {
        const scoreDifference =
            scores[b.id] - scores[a.id];

        if (scoreDifference !== 0) {
            return scoreDifference;
        }

        return (
            (comparisonCounts[a.id] || 0) -
            (comparisonCounts[b.id] || 0)
        );
    });
}


// ========================================
// 比較対象を決める
// ========================================

function chooseNextPair() {
    // ----------------------------
    // 通常モード
    // ----------------------------

    if (mode === "normal") {

        // 最初は全員を最低1回登場させる
        if (currentComparison < phase1Pairs.length) {

            const ids =
                phase1Pairs[currentComparison];

            const left =
                peopleById.get(ids[0]);

            const right =
                peopleById.get(ids[1]);

            if (left && right) {
                return [left, right];
            }
        }

        // それ以降は上位候補を重点比較
        const ranking = getRanking();

        const candidateCount =
            Math.min(
                PHASE2_CANDIDATES,
                ranking.length
            );

        const candidates =
            ranking.slice(0, candidateCount);

        return findBestPair(candidates);
    }


    // ----------------------------
    // 精密モード
    // ----------------------------

    if (mode === "refine") {

        const ranking = getRanking();

        const candidateCount =
            Math.min(
                REFINE_CANDIDATES,
                ranking.length
            );

        const candidates =
            ranking.slice(0, candidateCount);

        return findBestPair(candidates);
    }


    return null;
}


// ========================================
// 次の比較を表示
// ========================================

function showNextComparison() {

    const pair = chooseNextPair();

    if (!pair) {
        showResult();
        return;
    }

    currentPair = pair;

    setFaceImage(
        leftImage,
        pair[0]
    );

    setFaceImage(
        rightImage,
        pair[1]
    );

    if (leftName) {
        leftName.textContent = pair[0].name;
    }

    if (rightName) {
        rightName.textContent = pair[1].name;
    }

    updateProgress();
}


// ========================================
// 画像設定
// ========================================

function setFaceImage(element, person) {

    if (!element) {
        return;
    }

    element.alt = person.name;

    element.onerror = function () {

        // 無限ループ防止
        element.onerror = null;

        // 画像がなかった場合の簡易表示
        element.src =
            "data:image/svg+xml;charset=UTF-8," +
            encodeURIComponent(
                `
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
                `
            );
    };

    element.src =
        `./images/${encodeURIComponent(person.image)}`;
}


function escapeXML(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}


// ========================================
// プログレス表示
// ========================================

function updateProgress() {

    let completed;
    let target;
    let phase;

    if (mode === "normal") {

        completed = currentComparison;
        target = normalTarget;

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

    else if (mode === "refine") {

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
                (completed / target) * 100
            )
        );


    if (progressBar) {
        progressBar.style.width =
            `${percent}%`;
    }


    if (progressText) {

        if (mode === "refine") {
            progressText.textContent =
                `${Math.max(0, completed)} / ${REFINE_COMPARISONS} 回`;
        }

        else {
            progressText.textContent =
                `${completed} / ${target} 回`;
        }
    }


    if (phaseText) {
        phaseText.textContent = phase;
    }
}


// ========================================
// 選択ボタン
// ========================================

function handleChoice(choice) {

    if (
        isProcessing ||
        !currentPair ||
        mode === "result"
    ) {
        return;
    }

    isProcessing = true;


    // スコアを更新
    applyChoice(choice);

    // 比較記録
    recordComparison();

    // 比較回数を進める
    currentComparison++;


    // 保存
    saveState();


    // 少しだけ間を置いて次へ
    setTimeout(() => {

        isProcessing = false;

        // 精密比較終了
        if (
            mode === "refine" &&
            currentComparison >= refinementTarget
        ) {
            showResult();
            return;
        }

        // 通常比較終了
        if (
            mode === "normal" &&
            currentComparison >= normalTarget
        ) {
            showResult();
            return;
        }

        showNextComparison();

    }, 120);
}


// ========================================
// 結果表示
// ========================================

function showResult() {

    mode = "result";

    currentPair = null;

if (compareScreen) {
    compareScreen.style.display = "none";
}

if (resultScreen) {
    resultScreen.classList.remove("hidden");
    resultScreen.style.display = "block";
}

    const ranking = getRanking();

    const topCount =
        Math.min(
            9,
            ranking.length
        );

    if (rankingGrid) {

        rankingGrid.innerHTML = "";

        ranking
            .slice(0, topCount)
            .forEach((person, index) => {

                const card =
                    document.createElement("div");

                card.className =
                    "ranking-card";

                const rank =
                    document.createElement("div");

                rank.className =
                    "ranking-number";

                rank.textContent =
                    `${index + 1}位`;

                const img =
                    document.createElement("img");

                setFaceImage(img, person);

                img.alt =
                    `${index + 1}位 ${person.name}`;

                const name =
                    document.createElement("div");

                name.className =
                    "ranking-name";

                name.textContent =
                    person.name;

                card.appendChild(rank);
                card.appendChild(img);
                card.appendChild(name);

                rankingGrid.appendChild(card);
            });
    }


    // 精密比較ボタン
    if (refineButton) {

        refineButton.style.display =
            ranking.length >= 2
                ? "block"
                : "none";

        if (
            currentComparison <= normalTarget
        ) {
            refineButton.textContent =
                "TOP9をもっと厳密にする（＋30回）";
        }

        else {
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

    if (people.length < 2) {
        return;
    }

    mode = "refine";

    refinementStart =
        currentComparison;

    refinementTarget =
        currentComparison +
        REFINE_COMPARISONS;


    if (compareScreen) {
        compareScreen.style.display = "block";
    }

    if (resultScreen) {
        resultScreen.style.display = "none";
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

    currentComparison = 0;

    mode = "normal";

    refinementStart = 0;

    refinementTarget = null;

    currentPair = null;

    saveState();
}


// ========================================
// 保存用の人物リスト識別子
// CSVを変更した場合は自動的にリセット
// ========================================

function getPeopleSignature() {

    return people
        .map(person =>
            `${person.id}|${person.name}|${person.image}`
        )
        .join("||");
}


// ========================================
// LocalStorage保存
// ========================================

function saveState() {

    const data = {

        version: 2,

        peopleSignature:
            getPeopleSignature(),

        scores,

        comparisonCounts,

        comparisonHistory,

        phase1Pairs,

        currentComparison,

        mode,

        refinementStart,

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


        // バージョンが違う
        if (data.version !== 2) {
            return false;
        }


        // CSVの内容が変わっている
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
            !Array.isArray(data.phase1Pairs)
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
            Number(data.currentComparison) || 0;

        mode =
            data.mode || "normal";

        refinementStart =
            Number(data.refinementStart) || 0;

        refinementTarget =
            data.refinementTarget
                ? Number(data.refinementTarget)
                : null;


        // 念のため全員のスコアがあるか確認
        for (const person of people) {

            if (
                typeof scores[person.id] !==
                "number"
            ) {
                return false;
            }

            if (
                typeof comparisonCounts[person.id] !==
                "number"
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


        if (people.length < 2) {
            throw new Error(
                "比較する人物が2人未満です"
            );
        }


        // ID重複チェック
        const ids =
            people.map(person => person.id);

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


        // 必須項目チェック
        for (const person of people) {

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


        peopleById =
            new Map(
                people.map(
                    person => [
                        person.id,
                        person
                    ]
                )
            );


        // 人数から自動計算
        normalTarget =
            calculateNormalTarget();


        // 保存データを読み込み
        const loaded =
            loadState();


        if (!loaded) {
            initializeFreshState();
        }


        // 現在の状態に応じて画面を表示
        if (
            mode === "refine" &&
            refinementTarget !== null &&
            currentComparison < refinementTarget
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
            currentComparison < normalTarget
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

    } catch (error) {

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
            "\n\nブラウザの開発者ツール（F12）のConsoleにも詳細が出ています。"
        );
    }
}

// ========================================
// ボタンイベント
// ========================================

const leftChoice =
    document.getElementById("leftChoice");

const rightChoice =
    document.getElementById("rightChoice");

const bothChoice =
    document.getElementById("bothChoice");

const neitherChoice =
    document.getElementById("neitherChoice");


if (leftChoice) {
    leftChoice.addEventListener(
        "click",
        () => handleChoice("left")
    );
}


if (rightChoice) {
    rightChoice.addEventListener(
        "click",
        () => handleChoice("right")
    );
}


if (bothChoice) {
    bothChoice.addEventListener(
        "click",
        () => handleChoice("both")
    );
}


if (neitherChoice) {
    neitherChoice.addEventListener(
        "click",
        () => handleChoice("neither")
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
