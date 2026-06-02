const STORAGE_KEY = "english-vocab-trainer-history-v1";

const state = {
  items: [],
  questions: [],
  stats: {},
  mode: "mixed",
  queue: "all",
  current: null,
  direction: "en-ja",
  options: [],
  answered: false,
  lastItemId: null,
  seenThisCycle: new Set(),
};

const els = {
  studiedCount: document.querySelector("#studiedCount"),
  accuracyRate: document.querySelector("#accuracyRate"),
  missedCount: document.querySelector("#missedCount"),
  missedListCount: document.querySelector("#missedListCount"),
  itemCount: document.querySelector("#itemCount"),
  dataStatus: document.querySelector("#dataStatus"),
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
  reshuffleButton: document.querySelector("#reshuffleButton"),
  resetButton: document.querySelector("#resetButton"),
  missedList: document.querySelector("#missedList"),
  emptyState: document.querySelector("#emptyState"),
  emptyMessage: document.querySelector("#emptyMessage"),
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

    if (state.questions.length === 0 && state.items.length < 4) {
      showEmpty("4択を作るには、data/vocab.jsonに4件以上の単語が必要です。");
      updateSummary();
      return;
    }

    els.dataStatus.textContent = state.questions.length
      ? `${state.questions.length}問のテスト問題を読み込みました。`
      : `${state.items.length}件の単語を読み込みました。`;
    updateSummary();
    nextQuestion();
  } catch (error) {
    showEmpty("data/vocab.jsonを読み込めませんでした。ローカルサーバーから開いてください。");
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
      state.mode = button.dataset.mode;
      resetQuestionCycle();
      setActive("[data-mode]", button);
      nextQuestion();
    });
  });

  document.querySelectorAll("[data-queue]").forEach((button) => {
    button.addEventListener("click", () => {
      state.queue = button.dataset.queue;
      resetQuestionCycle();
      setActive("[data-queue]", button);
      nextQuestion();
    });
  });

  els.nextButton.addEventListener("click", nextQuestion);
  els.reshuffleButton.addEventListener("click", reshuffleCurrentOptions);
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
    showEmpty("前回間違えた問題はありません。");
    return;
  }

  hideEmpty();
  const entry = chooseItem(pool);
  const isFormsQuestion = isQuestion(entry);
  const direction = isFormsQuestion
    ? entry.direction
    : state.mode === "mixed"
      ? randomChoice(["en-ja", "ja-en"])
      : state.mode;

  state.current = entry;
  state.direction = direction;
  state.options = isFormsQuestion ? buildQuestionOptions(entry) : buildOptions(entry, direction);
  state.answered = false;
  state.lastItemId = entry.id;

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
    if (state.mode === "mixed") {
      return state.questions;
    }

    return state.questions.filter((question) => question.direction === state.mode);
  }

  return state.items;
}

function getAllEntries() {
  return state.questions.length ? state.questions : state.items;
}

function chooseItem(pool) {
  const poolIds = new Set(pool.map((item) => item.id));
  state.seenThisCycle = new Set([...state.seenThisCycle].filter((id) => poolIds.has(id)));

  let candidates = pool.filter((item) => !state.seenThisCycle.has(item.id));
  if (!candidates.length) {
    state.seenThisCycle.clear();
    candidates = pool.length > 1 ? pool.filter((item) => item.id !== state.lastItemId) : pool;
  }

  const entry = state.queue === "weak" ? chooseWeightedItem(candidates) : randomChoice(candidates);
  state.seenThisCycle.add(entry.id);
  return entry;
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
  els.reshuffleButton.disabled = false;

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
  saveStats();
  updateSummary();

  if (correct) {
    nextQuestion();
    return;
  }

  paintAnsweredOptions(selectedButton);
  renderResult(correct);
  els.nextButton.disabled = false;
  els.reshuffleButton.disabled = true;
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

function reshuffleCurrentOptions() {
  if (!state.current || state.answered) {
    return;
  }

  state.options = shuffle(state.options);
  renderQuestion();
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

  els.studiedCount.textContent = String(
    stats.filter((stat) => getStatCount(stat, "attempts") > 0).length,
  );
  els.accuracyRate.textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "0%";
  els.missedCount.textContent = String(missed.length);
  els.missedListCount.textContent = String(missed.length);
  els.itemCount.textContent = state.questions.length
    ? `${state.questions.length}問`
    : `${state.items.length}件`;

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
  resetQuestionCycle();
  saveStats();
  updateSummary();
  nextQuestion();
}

function resetQuestionCycle() {
  state.seenThisCycle.clear();
  state.lastItemId = null;
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

function showEmpty(message) {
  els.quizView.hidden = true;
  els.emptyState.hidden = false;
  els.emptyMessage.textContent = message;
}

function hideEmpty() {
  els.quizView.hidden = false;
  els.emptyState.hidden = true;
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
