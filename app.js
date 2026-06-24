const STORAGE_KEY = "english-vocab-trainer-history-v1";
const DIRECTIONS = ["en-ja", "ja-en"];

const state = {
  items: [],
  questions: [],
  stats: {},
  mode: "mixed",
  queue: "all",
  testFilter: "all",
  testOptions: [],
  current: null,
  direction: "en-ja",
  options: [],
  answered: false,
  cycleCompletedByKey: new Map(),
};

const els = {
  answerCount: document.querySelector("#answerCount"),
  accuracyRate: document.querySelector("#accuracyRate"),
  missedCount: document.querySelector("#missedCount"),
  missedListCount: document.querySelector("#missedListCount"),
  itemCount: document.querySelector("#itemCount"),
  dataStatus: document.querySelector("#dataStatus"),
  testFilter: document.querySelector("#testFilter"),
  directionLabel: document.querySelector("#directionLabel"),
  tagLabel: document.querySelector("#tagLabel"),
  promptLabel: document.querySelector("#promptLabel"),
  promptText: document.querySelector("#promptText"),
  exampleText: document.querySelector("#exampleText"),
  options: document.querySelector("#options"),
  result: document.querySelector("#result"),
  resultLabel: document.querySelector("#resultLabel"),
  answerText: document.querySelector("#answerText"),
  detailText: document.querySelector("#detailText"),
  nextButton: document.querySelector("#nextButton"),
  resetButton: document.querySelector("#resetButton"),
  missedList: document.querySelector("#missedList"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyMessage: document.querySelector("#emptyMessage"),
  restartCycleButton: document.querySelector("#restartCycleButton"),
  quizView: document.querySelector("#quizView"),
};

async function boot() {
  loadStats();
  bindEvents();

  try {
    const response = await fetch("data/vocab.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    state.items = normalizeItems(payload);
    state.questions = normalizeQuestions(payload, state.items);
    populateTestFilter();

    if (state.questions.length === 0 && state.items.length < 4) {
      showEmpty("問題がありません", "4択を作るには、data/vocab.jsonに4件以上の単語が必要です。");
      updateSummary();
      return;
    }

    els.dataStatus.textContent = state.questions.length
      ? `${state.questions.length}問 / ${state.testOptions.length}テストを読み込みました。`
      : `${state.items.length}件の単語を読み込みました。`;
    updateSummary();
    nextQuestion();
  } catch (error) {
    showEmpty(
      "読み込み失敗",
      "data/vocab.jsonを読み込めませんでした。ローカルサーバーから開いてください。",
    );
    els.dataStatus.textContent = `読み込み失敗: ${error.message}`;
  }
}

function normalizeItems(payload) {
  const source = Array.isArray(payload) ? payload : payload.items;
  if (source === undefined) {
    return [];
  }

  if (!Array.isArray(source)) {
    throw new Error("JSONにはitems配列が必要です。");
  }

  return source.map((item, index) => {
    const normalized = {
      id: String(item.id || `item-${index + 1}`),
      english: String(item.english || "").trim(),
      japanese: String(item.japanese || "").trim(),
      example_en: String(item.example_en || "").trim(),
      example_ja: String(item.example_ja || "").trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
    };

    if (!normalized.english || !normalized.japanese) {
      throw new Error(`id=${normalized.id}のenglishまたはjapaneseが空です。`);
    }

    return normalized;
  });
}

function normalizeQuestions(payload, items) {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const tests = Array.isArray(payload?.tests) ? payload.tests : [];
  const directQuestions = Array.isArray(payload?.questions)
    ? [{ id: "questions", title: "問題", questions: payload.questions }]
    : [];

  return [...tests, ...directQuestions].flatMap((test, testIndex) => {
    if (!Array.isArray(test.questions)) {
      return [];
    }

    return test.questions.map((question, questionIndex) => {
      const answerLanguage = normalizeAnswerLanguage(question.answer_language);
      const direction = answerLanguage === "ja" ? "en-ja" : "ja-en";
      const choices = Array.isArray(question.choices)
        ? question.choices.map((choice) => String(choice).trim()).filter(Boolean)
        : [];
      const answer = String(question.answer || "").trim();
      const item = itemMap.get(String(question.item_id || ""));
      const number = Number(question.number || questionIndex + 1);
      const promptEn = String(question.prompt_en || item?.example_en || "").trim();
      const promptJa = String(question.prompt_ja || item?.example_ja || "").trim();
      const promptParts = answerLanguage === "en" ? [promptJa, promptEn] : [promptEn, promptJa];
      const prompt = String(question.prompt || promptParts.filter(Boolean).join("\n")).trim();
      const id = String(question.id || `${test.id || `test-${testIndex + 1}`}-q${number}`);

      if (!prompt || !answer || choices.length < 2) {
        throw new Error(`id=${id}のprompt、answer、choicesが不足しています。`);
      }

      return {
        id,
        itemId: String(question.item_id || item?.id || id),
        testId: String(test.id || `test-${testIndex + 1}`),
        testTitle: String(test.title || "テスト問題"),
        number,
        answerLanguage,
        direction,
        prompt,
        prompt_en: promptEn,
        prompt_ja: promptJa,
        choices,
        answer,
        tags: Array.isArray(question.tags)
          ? question.tags
          : [String(test.id || `test-${testIndex + 1}`)],
      };
    });
  });
}

function normalizeAnswerLanguage(value) {
  return String(value || "").toLowerCase() === "ja" ? "ja" : "en";
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.mode;
      if (state.mode === nextMode) {
        return;
      }

      state.mode = nextMode;
      setActive("[data-mode]", button);
      nextQuestion();
    });
  });

  document.querySelectorAll("[data-queue]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextQueue = button.dataset.queue;
      if (state.queue === nextQueue) {
        return;
      }

      state.queue = nextQueue;
      setActive("[data-queue]", button);
      nextQuestion();
    });
  });

  els.testFilter.addEventListener("change", () => {
    const nextFilter = els.testFilter.value || "all";
    if (state.testFilter === nextFilter) {
      return;
    }

    state.testFilter = nextFilter;
    nextQuestion();
  });

  els.nextButton.addEventListener("click", nextQuestion);
  els.restartCycleButton.addEventListener("click", restartCurrentCycle);
  els.resetButton.addEventListener("click", resetHistory);
}

function setActive(selector, activeButton) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("is-active", button === activeButton);
  });
}

function nextQuestion() {
  const pool = getPool();
  updateSummary();

  if (pool.length === 0) {
    if (getCurrentCycleCompleted().size > 0) {
      showCycleComplete(0);
      return;
    }

    showEmpty("問題がありません", getNoQuestionMessage());
    return;
  }

  const entry = chooseItem(pool);
  if (!entry) {
    showCycleComplete(pool.length);
    return;
  }

  hideEmpty();
  const isFormsQuestion = isQuestion(entry);
  let direction = state.mode;
  if (isFormsQuestion) {
    direction = entry.direction;
  } else if (entry.generatedDirection) {
    direction = entry.generatedDirection;
  } else if (state.mode === "mixed") {
    direction = randomChoice(DIRECTIONS);
  }

  state.current = entry;
  state.direction = direction;
  state.options = isFormsQuestion ? buildQuestionOptions(entry) : buildOptions(entry, direction);
  state.answered = false;

  renderQuestion();
}

function getPool() {
  const source = getModeEntries();

  if (state.queue === "missed") {
    return source.filter((entry) => state.stats[entry.id]?.lastResult === false);
  }

  return source;
}

function getModeEntries() {
  if (state.questions.length) {
    const questions = getFilteredQuestionEntries();

    if (state.mode === "mixed") {
      return [
        ...questions,
        ...DIRECTIONS.flatMap((direction) => getGeneratedItemsForMissingDirection(direction, questions)),
      ];
    }

    return getEntriesForDirection(state.mode, questions);
  }

  return getFilteredItemEntries();
}

function getEntriesForDirection(direction, questions = getFilteredQuestionEntries()) {
  const explicitQuestions = questions.filter((question) => question.direction === direction);
  return [...explicitQuestions, ...getGeneratedItemsForMissingDirection(direction, questions)];
}

function getAllEntries() {
  return getModeEntries();
}

function getBaseEntries() {
  return state.questions.length ? state.questions : state.items;
}

function getFilteredQuestionEntries() {
  return filterEntriesByTest(state.questions);
}

function getFilteredItemEntries() {
  return filterEntriesByTest(state.items);
}

function filterEntriesByTest(entries) {
  if (state.testFilter === "all") {
    return entries;
  }

  return entries.filter((entry) => getEntryTestId(entry) === state.testFilter);
}

function getGeneratedItemsForMissingDirection(direction, questions) {
  const testsWithDirection = new Set(
    questions
      .filter((question) => question.direction === direction)
      .map((question) => question.testId),
  );

  return getFilteredItemEntries()
    .filter((item) => {
      const testId = getEntryTestId(item);
      return testId && !testsWithDirection.has(testId);
    })
    .map((item) => ({ ...item, generatedDirection: direction }));
}

function chooseItem(pool) {
  const completedThisCycle = getCurrentCycleCompleted();
  const poolIds = new Set(pool.map((item) => item.id));
  [...completedThisCycle].forEach((id) => {
    if (!poolIds.has(id)) {
      completedThisCycle.delete(id);
    }
  });

  const candidates = pool.filter((item) => !completedThisCycle.has(item.id));
  if (!candidates.length) {
    return null;
  }

  return state.queue === "weak" ? chooseWeightedItem(candidates) : randomChoice(candidates);
}

function chooseWeightedItem(items) {
  const weighted = items.flatMap((item) => {
    const stat = state.stats[item.id] || {};
    const weight = 1 + (stat.wrong || 0) * 3 + (stat.wrongStreak || 0) * 4;
    return Array.from({ length: Math.min(weight, 12) }, () => item);
  });

  return randomChoice(weighted);
}

function buildOptions(item, direction) {
  const key = direction === "en-ja" ? "japanese" : "english";
  const correct = { id: item.id, label: item[key], correct: true };
  const seen = new Set([correct.label]);
  const distractors = [];

  shuffle([...state.items]).forEach((candidate) => {
    const label = candidate[key];
    if (candidate.id !== item.id && !seen.has(label) && distractors.length < 3) {
      seen.add(label);
      distractors.push({ id: candidate.id, label, correct: false });
    }
  });

  return shuffle([correct, ...distractors]);
}

function buildQuestionOptions(question) {
  const answer = normalizeOptionLabel(question.answer);
  const seen = new Set();
  const options = [];

  question.choices.forEach((choice) => {
    const label = normalizeOptionLabel(choice);
    if (!label || seen.has(label)) {
      return;
    }

    seen.add(label);
    options.push({ id: `${question.id}-${options.length + 1}`, label, correct: label === answer });
  });

  if (!options.some((option) => option.correct)) {
    options.unshift({ id: `${question.id}-answer`, label: answer, correct: true });
  }

  return shuffle(options);
}

function renderQuestion() {
  const entry = state.current;
  const isFormsQuestion = isQuestion(entry);
  const isEnglishToJapanese = state.direction === "en-ja";
  const tags = entry.tags.length ? entry.tags.join(" / ") : "untagged";

  els.directionLabel.textContent = isFormsQuestion
    ? entry.answerLanguage === "ja"
      ? "日本語を選ぶ"
      : "英語を選ぶ"
    : isEnglishToJapanese
      ? "英語→日本語"
      : "日本語→英語";
  els.tagLabel.textContent = isFormsQuestion ? `${entry.testTitle} #${entry.number}` : tags;
  els.promptLabel.textContent = isFormsQuestion
    ? "問題"
    : isEnglishToJapanese
      ? "English"
      : "日本語";
  els.promptText.textContent = isFormsQuestion
    ? entry.prompt
    : isEnglishToJapanese
      ? entry.english
      : entry.japanese;
  els.promptText.classList.toggle("is-long", isFormsQuestion);
  els.exampleText.textContent = isFormsQuestion
    ? ""
    : isEnglishToJapanese
      ? entry.example_en
      : entry.example_ja;
  els.result.hidden = true;
  els.nextButton.disabled = true;

  els.options.innerHTML = "";
  state.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => answer(option, button));
    els.options.append(button);
  });
}

function answer(option, selectedButton) {
  if (state.answered) {
    return;
  }

  state.answered = true;
  const correct = option.correct;
  const stat = getCleanStat(state.current.id);

  stat.attempts += 1;
  stat.lastSeen = new Date().toISOString();
  stat.lastDirection = state.direction;
  stat.lastResult = correct;

  if (correct) {
    stat.correct += 1;
    stat.wrongStreak = 0;
  } else {
    stat.wrong += 1;
    stat.wrongStreak = (stat.wrongStreak || 0) + 1;
    stat.lastMissedAt = stat.lastSeen;
  }

  state.stats[state.current.id] = stat;
  markCurrentCycleCompleted(state.current.id);
  saveStats();
  updateSummary();

  if (correct) {
    nextQuestion();
    return;
  }

  paintAnsweredOptions(selectedButton);
  renderResult(correct);
  els.nextButton.disabled = false;
}

function paintAnsweredOptions(selectedButton) {
  [...els.options.children].forEach((button, index) => {
    const option = state.options[index];
    button.disabled = true;
    if (option.correct) {
      button.classList.add("is-correct");
    } else if (button === selectedButton) {
      button.classList.add("is-wrong");
    }
  });
}

function renderResult(correct) {
  const entry = state.current;
  const isFormsQuestion = isQuestion(entry);
  const answer = isFormsQuestion
    ? entry.answer
    : state.direction === "en-ja"
      ? entry.japanese
      : entry.english;
  const detail = isFormsQuestion
    ? entry.prompt
    : state.direction === "en-ja"
      ? `${entry.english} / ${entry.example_en}`
      : `${entry.japanese} / ${entry.example_ja}`;

  els.result.hidden = false;
  els.resultLabel.textContent = correct ? "正解" : "不正解";
  els.answerText.textContent = answer;
  els.detailText.textContent = detail;
}

function updateSummary() {
  const entries = getAllEntries();
  const entryIds = new Set(entries.map((entry) => entry.id));
  const stats = Object.entries(state.stats)
    .filter(([id]) => entryIds.has(id))
    .map(([, stat]) => stat);
  const attempts = stats.reduce((sum, stat) => sum + getStatCount(stat, "attempts"), 0);
  const correct = stats.reduce((sum, stat) => sum + getStatCount(stat, "correct"), 0);
  const missed = entries.filter((entry) => state.stats[entry.id]?.lastResult === false);
  const unit = state.questions.length ? "問" : "件";

  els.answerCount.textContent = String(attempts);
  els.accuracyRate.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "0%";
  els.missedCount.textContent = String(missed.length);
  els.missedListCount.textContent = String(missed.length);
  els.itemCount.textContent = `${entries.length}${unit}`;

  renderMissedList(missed);
}

function renderMissedList(missed) {
  els.missedList.innerHTML = "";

  if (!missed.length) {
    const item = document.createElement("li");
    item.innerHTML = "<strong>なし</strong><span>前回ミスした単語がここに残ります。</span>";
    els.missedList.append(item);
    return;
  }

  missed
    .slice()
    .sort((a, b) => {
      const aTime = state.stats[a.id]?.lastMissedAt || "";
      const bTime = state.stats[b.id]?.lastMissedAt || "";
      return bTime.localeCompare(aTime);
    })
    .forEach((missedItem) => {
      const item = document.createElement("li");
      item.innerHTML = `<strong>${escapeHtml(getEntryTitle(missedItem))}</strong><span>${escapeHtml(
        getEntrySubtitle(missedItem),
      )}</span>`;
      els.missedList.append(item);
    });
}

function resetHistory() {
  const confirmed = window.confirm("学習履歴をリセットしますか？");
  if (!confirmed) {
    return;
  }

  state.stats = {};
  resetQuestionCycles();
  saveStats();
  updateSummary();
  nextQuestion();
}

function restartCurrentCycle() {
  resetQuestionCycle();
  nextQuestion();
}

function resetQuestionCycle(key = getCycleKey()) {
  state.cycleCompletedByKey.delete(key);
}

function resetQuestionCycles() {
  state.cycleCompletedByKey.clear();
}

function getCycleKey() {
  return `${state.testFilter}:${state.mode}:${state.queue}`;
}

function getCurrentCycleCompleted() {
  const key = getCycleKey();
  if (!state.cycleCompletedByKey.has(key)) {
    state.cycleCompletedByKey.set(key, new Set());
  }

  return state.cycleCompletedByKey.get(key);
}

function markCurrentCycleCompleted(entryId) {
  getCurrentCycleCompleted().add(entryId);
}

function getCleanStat(entryId) {
  const stat = state.stats[entryId] || {};

  return {
    ...stat,
    attempts: getStatCount(stat, "attempts"),
    correct: getStatCount(stat, "correct"),
    wrong: getStatCount(stat, "wrong"),
    wrongStreak: getStatCount(stat, "wrongStreak"),
  };
}

function getStatCount(stat, key) {
  const value = Number(stat?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function showCycleComplete(poolCount) {
  const countText = poolCount > 0 ? `${poolCount}問` : "対象の問題";
  const message =
    state.queue === "missed"
      ? "前回ミスの問題をすべて解き終わりました。"
      : `${getTestFilterLabel()} / ${getModeLabel()} / ${getQueueLabel()} の${countText}を一周しました。`;

  showEmpty("一周完了", message, { restart: poolCount > 0 });
}

function getNoQuestionMessage() {
  if (state.queue === "missed") {
    return "前回間違えた問題はありません。";
  }

  return "この出題方法で出せる問題がありません。";
}

function populateTestFilter() {
  state.testOptions = buildTestOptions();
  els.testFilter.innerHTML = "";

  const allOption = document.createElement("option");
  const unit = state.questions.length ? "問" : "件";
  allOption.value = "all";
  allOption.textContent = `すべて（${getBaseEntries().length}${unit}）`;
  els.testFilter.append(allOption);

  state.testOptions.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option.id;
    optionElement.textContent = `${option.label}（${option.count}問）`;
    els.testFilter.append(optionElement);
  });

  els.testFilter.disabled = state.testOptions.length === 0;
}

function buildTestOptions() {
  const options = new Map();

  getBaseEntries().forEach((entry) => {
    const testId = getEntryTestId(entry);
    if (!testId) {
      return;
    }

    if (!options.has(testId)) {
      options.set(testId, {
        id: testId,
        label: getEntryTestLabel(entry),
        count: 0,
      });
    }

    options.get(testId).count += 1;
  });

  return [...options.values()].sort((a, b) => compareTestIds(a.id, b.id));
}

function getEntryTestId(entry) {
  if (isQuestion(entry)) {
    return entry.testId;
  }

  return entry.tags.find((tag) => /^test-\d+$/.test(String(tag))) || "";
}

function getEntryTestLabel(entry) {
  const testId = getEntryTestId(entry);
  if (isQuestion(entry)) {
    const range = entry.testTitle.match(/［(.+?)］/)?.[1];
    return range ? `${testId}（${range}）` : testId;
  }

  const rangeTag = entry.tags.find((tag) => /^\d{3}-\d{3}$/.test(String(tag)));
  return rangeTag ? `${testId}（${rangeTag}）` : testId;
}

function compareTestIds(a, b) {
  const aNumber = Number(a.match(/\d+$/)?.[0] || 0);
  const bNumber = Number(b.match(/\d+$/)?.[0] || 0);
  return aNumber - bNumber || a.localeCompare(b);
}

function getTestFilterLabel() {
  if (state.testFilter === "all") {
    return "すべて";
  }

  return (
    state.testOptions.find((option) => option.id === state.testFilter)?.label || state.testFilter
  );
}

function getModeLabel() {
  if (state.mode === "en-ja") {
    return "英語→日本語";
  }

  if (state.mode === "ja-en") {
    return "日本語→英語";
  }

  return "混合";
}

function getQueueLabel() {
  if (state.queue === "missed") {
    return "前回ミス";
  }

  if (state.queue === "weak") {
    return "苦手優先";
  }

  return "全範囲";
}

function showEmpty(title, message, options = {}) {
  els.quizView.hidden = true;
  els.emptyState.hidden = false;
  els.emptyTitle.textContent = title;
  els.emptyMessage.textContent = message;
  els.restartCycleButton.hidden = !options.restart;
}

function hideEmpty() {
  els.quizView.hidden = false;
  els.emptyState.hidden = true;
  els.restartCycleButton.hidden = true;
}

function loadStats() {
  try {
    state.stats = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    state.stats = {};
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stats));
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function isQuestion(entry) {
  return Boolean(entry?.choices && entry?.answer);
}

function normalizeOptionLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getEntryTitle(entry) {
  if (isQuestion(entry)) {
    return entry.answer;
  }

  return entry.english;
}

function getEntrySubtitle(entry) {
  if (isQuestion(entry)) {
    return entry.prompt;
  }

  return entry.japanese;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

boot();
