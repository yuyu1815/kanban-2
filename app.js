const STORAGE_KEY = "github-work-kanban-state-v1";

const STATUSES = [
  { id: "backlog", label: "バックログ", issue: "normal", pr: "exception" },
  { id: "ready", label: "着手可", issue: "normal", pr: "exception" },
  { id: "doing", label: "作業中", issue: "normal", pr: "exception" },
  { id: "pr-open", label: "PR作成済み", issue: "exception", pr: "normal" },
  { id: "review", label: "レビュー", issue: "exception", pr: "normal" },
  { id: "merged", label: "マージ済み", issue: "normal", pr: "normal" },
];

const LINK_COLORS = [
  "#0969da",
  "#1a7f37",
  "#bf3989",
  "#bc4c00",
  "#8250df",
  "#57606a",
  "#0a7ea4",
  "#9a6700",
];

const LABEL_COLORS = [
  "#d73a49",
  "#0969da",
  "#1a7f37",
  "#8250df",
  "#bc4c00",
  "#57606a",
  "#cf222e",
  "#0a7ea4",
];

const state = loadState();
let selectedCardId = null;
let draggingCardId = null;
let formMode = "idle";
let filters = {
  query: "",
  type: "all",
  label: "all",
};

const elements = {
  boardGrid: document.querySelector("#boardGrid"),
  cardTemplate: document.querySelector("#cardTemplate"),
  newCardButton: document.querySelector("#newCardButton"),
  archiveViewButton: document.querySelector("#archiveViewButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  searchInput: document.querySelector("#searchInput"),
  labelFilter: document.querySelector("#labelFilter"),
  typeFilterButtons: Array.from(document.querySelectorAll("[data-type-filter]")),
  panelEmpty: document.querySelector("#panelEmpty"),
  cardForm: document.querySelector("#cardForm"),
  archivePanel: document.querySelector("#archivePanel"),
  archiveList: document.querySelector("#archiveList"),
  closePanelButton: document.querySelector("#closePanelButton"),
  closeArchiveButton: document.querySelector("#closeArchiveButton"),
  formModeLabel: document.querySelector("#formModeLabel"),
  formTitle: document.querySelector("#formTitle"),
  cardType: document.querySelector("#cardType"),
  cardStatus: document.querySelector("#cardStatus"),
  cardTitleInput: document.querySelector("#cardTitleInput"),
  cardUrl: document.querySelector("#cardUrl"),
  urlDerivedMeta: document.querySelector("#urlDerivedMeta"),
  cardLabel: document.querySelector("#cardLabel"),
  cardLabelColor: document.querySelector("#cardLabelColor"),
  labelSuggestions: document.querySelector("#labelSuggestions"),
  linkedIssueField: document.querySelector("#linkedIssueField"),
  linkedIssueSelect: document.querySelector("#linkedIssueSelect"),
  cardMemo: document.querySelector("#cardMemo"),
  archiveCardButton: document.querySelector("#archiveCardButton"),
  deleteCardButton: document.querySelector("#deleteCardButton"),
};

initialize();

function initialize() {
  buildStatusOptions("issue");
  bindEvents();
  render();
  showEmptyPanel();
}

function loadState() {
  const fallback = { cards: [], labelColors: {}, linkColors: {}, nextColorIndex: 0 };

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return fallback;

    const parsed = JSON.parse(stored);
    const loaded = {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      labelColors: parsed.labelColors && typeof parsed.labelColors === "object" ? parsed.labelColors : {},
      linkColors: parsed.linkColors && typeof parsed.linkColors === "object" ? parsed.linkColors : {},
      nextColorIndex: Number.isInteger(parsed.nextColorIndex) ? parsed.nextColorIndex : 0,
    };
    normalizeCards(loaded.cards);
    return loaded;
  } catch {
    return fallback;
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
}

function bindEvents() {
  elements.newCardButton.addEventListener("click", () => openNewForm());
  elements.archiveViewButton.addEventListener("click", () => showArchivePanel());
  elements.closePanelButton.addEventListener("click", () => showEmptyPanel());
  elements.closeArchiveButton.addEventListener("click", () => showEmptyPanel());
  elements.cardForm.addEventListener("submit", handleFormSubmit);
  elements.archiveCardButton.addEventListener("click", archiveSelectedCard);
  elements.deleteCardButton.addEventListener("click", deleteSelectedCard);
  elements.exportButton.addEventListener("click", exportJson);
  elements.importInput.addEventListener("change", importJson);
  elements.searchInput.addEventListener("input", (event) => {
    filters.query = event.target.value.trim().toLowerCase();
    renderBoard();
  });
  elements.labelFilter.addEventListener("change", (event) => {
    filters.label = event.target.value;
    renderBoard();
  });
  elements.typeFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filters.type = button.dataset.typeFilter;
      elements.typeFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderBoard();
    });
  });
  elements.cardType.addEventListener("change", () => {
    buildStatusOptions(elements.cardType.value, elements.cardStatus.value);
    syncLinkedIssueVisibility();
  });
  elements.cardUrl.addEventListener("input", syncUrlDerivedFields);
  elements.cardLabel.addEventListener("input", syncLabelColorFromKnownLabel);
  elements.linkedIssueSelect.addEventListener("change", syncPrLinkColorPreview);
}

function buildStatusOptions(type = "issue", selectedStatus = "") {
  const allowedStatuses = getStatusesForType(type);
  const nextStatus = allowedStatuses.some((status) => status.id === selectedStatus)
    ? selectedStatus
    : getDefaultStatusForType(type);

  elements.cardStatus.innerHTML = "";
  allowedStatuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status.id;
    option.textContent = status.label;
    option.selected = status.id === nextStatus;
    elements.cardStatus.append(option);
  });
}

function render() {
  ensureLinkColors();
  renderLabelControls();
  renderIssueOptions();
  renderBoard();
  renderArchive();
  saveState();
}

function renderBoard() {
  elements.boardGrid.innerHTML = "";

  ["issue", "pr"]
    .filter((type) => filters.type === "all" || filters.type === type)
    .forEach((type) => elements.boardGrid.append(renderBoardTable(type)));
}

function renderBoardTable(type) {
  const statuses = getStatusesForType(type);
  const table = document.createElement("section");
  table.className = `board-table ${type}`;

  const heading = document.createElement("div");
  heading.className = "board-table-title";
  heading.innerHTML = `<strong>${type === "issue" ? "イシュー" : "PR"}</strong><span>${laneCount(type)}件</span>`;

  const grid = document.createElement("div");
  grid.className = "status-grid";
  grid.style.setProperty("--status-count", String(statuses.length));

  statuses.forEach((status) => {
    const header = document.createElement("div");
    header.className = "column-header";
    header.innerHTML = `<strong>${status.label}</strong>`;
    grid.append(header);
  });

  statuses.forEach((status) => {
    const cell = document.createElement("div");
    cell.className = "board-cell";
    cell.dataset.type = type;
    cell.dataset.status = status.id;
    cell.addEventListener("dragover", handleDragOver);
    cell.addEventListener("dragleave", handleDragLeave);
    cell.addEventListener("drop", handleDrop);

    const cards = filteredCards().filter((card) => card.type === type && card.status === status.id && !card.archived);

    if (cards.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-cell";
      empty.textContent = "空";
      cell.append(empty);
    } else {
      cards.forEach((card) => cell.append(renderCard(card)));
    }

    grid.append(cell);
  });

  table.append(heading, grid);
  return table;
}

function renderCard(card) {
  const fragment = elements.cardTemplate.content.cloneNode(true);
  const cardElement = fragment.querySelector(".card");
  const typeBadge = fragment.querySelector(".type-badge");
  const labelRow = fragment.querySelector(".label-row");
  const linkedRow = fragment.querySelector(".linked-row");
  const memo = fragment.querySelector(".card-memo");
  const moveSelect = fragment.querySelector(".move-menu select");
  const linkColor = getCardLinkColor(card);

  cardElement.dataset.id = card.id;
  cardElement.style.setProperty("--link-color", linkColor);
  cardElement.classList.toggle("selected", selectedCardId === card.id);
  cardElement.addEventListener("click", (event) => {
    if (event.target.tagName.toLowerCase() === "select") return;
    openEditForm(card.id);
  });
  cardElement.addEventListener("dragstart", (event) => {
    draggingCardId = card.id;
    event.dataTransfer.setData("text/plain", card.id);
    event.dataTransfer.effectAllowed = "move";
    cardElement.classList.add("dragging");
  });
  cardElement.addEventListener("dragend", () => {
    draggingCardId = null;
    cardElement.classList.remove("dragging");
  });

  fragment.querySelector(".card-number").textContent = formatCardNumber(card);
  typeBadge.textContent = card.type === "issue" ? "イシュー" : "PR";
  typeBadge.className = `type-badge ${card.type}`;
  fragment.querySelector(".card-title").textContent = card.title || "無題";
  fragment.querySelector(".card-repo").textContent = card.repo || "リポジトリ未設定";

  labelRow.innerHTML = "";
  getLabels(card).forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "label-chip";
    chip.style.setProperty("--label-color", state.labelColors[label] || "#57606a");
    chip.textContent = label;
    labelRow.append(chip);
  });

  linkedRow.innerHTML = "";
  const linkedCards = getLinkedCards(card);
  if (linkedCards.length > 0) {
    linkedCards.forEach((linkedCard) => {
      const linked = document.createElement("button");
      linked.type = "button";
      linked.className = "linked-card";
      linked.textContent = `↔ ${formatCardNumber(linkedCard)}`;
      linked.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditForm(linkedCard.id);
      });
      linkedRow.append(linked);
    });
  }

  memo.textContent = card.memo || "";
  memo.hidden = !card.memo;

  moveSelect.innerHTML = "";
  getStatusesForType(card.type).forEach((status) => {
    const option = document.createElement("option");
    option.value = status.id;
    option.textContent = status.label;
    option.selected = status.id === card.status;
    moveSelect.append(option);
  });
  moveSelect.addEventListener("click", (event) => event.stopPropagation());
  moveSelect.addEventListener("change", (event) => {
    moveCard(card.id, event.target.value);
  });

  return fragment;
}

function renderLabelControls() {
  const labels = getKnownLabels();
  const current = elements.labelFilter.value || "all";

  elements.labelFilter.innerHTML = '<option value="all">すべてのラベル</option>';
  labels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    elements.labelFilter.append(option);
  });
  elements.labelFilter.value = labels.includes(current) ? current : "all";
  filters.label = elements.labelFilter.value;

  elements.labelSuggestions.innerHTML = "";
  labels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    elements.labelSuggestions.append(option);
  });
}

function renderIssueOptions() {
  const issues = state.cards.filter((card) => card.type === "issue" && !card.archived);
  const current = elements.linkedIssueSelect.value;
  elements.linkedIssueSelect.innerHTML = '<option value="">関連イシューなし</option>';

  issues.forEach((issue) => {
    const option = document.createElement("option");
    option.value = issue.id;
    option.textContent = `${formatCardNumber(issue)} ${issue.title || ""}`.trim();
    elements.linkedIssueSelect.append(option);
  });

  elements.linkedIssueSelect.value = issues.some((issue) => issue.id === current) ? current : "";
}

function renderArchive() {
  const archived = state.cards.filter((card) => card.archived);
  elements.archiveList.innerHTML = "";

  if (archived.length === 0) {
    const empty = document.createElement("div");
    empty.className = "archive-empty";
    empty.textContent = "アーカイブは空です。";
    elements.archiveList.append(empty);
    return;
  }

  archived.forEach((card) => {
    const row = document.createElement("div");
    row.className = "archive-row";
    row.style.setProperty("--link-color", getCardLinkColor(card));

    const meta = document.createElement("div");
    meta.innerHTML = `<strong>${formatCardNumber(card)}</strong><span>${card.title || "無題"}</span>`;

    const restore = document.createElement("button");
    restore.className = "button";
    restore.type = "button";
    restore.textContent = "復元";
    restore.addEventListener("click", () => {
      card.archived = false;
      render();
    });

    const destroy = document.createElement("button");
    destroy.className = "button danger";
    destroy.type = "button";
    destroy.textContent = "削除";
    destroy.addEventListener("click", () => {
      removeCard(card.id);
      render();
    });

    row.append(meta, restore, destroy);
    elements.archiveList.append(row);
  });
}

function filteredCards() {
  return state.cards.filter((card) => {
    if (filters.type !== "all" && card.type !== filters.type) return false;
    if (filters.label !== "all" && !getLabels(card).includes(filters.label)) return false;
    if (!filters.query) return true;

    const haystack = [
      card.title,
      card.repo,
      card.number ? `#${card.number}` : "",
      card.url,
      card.memo,
      ...getLabels(card),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(filters.query);
  });
}

function openNewForm() {
  formMode = "new";
  selectedCardId = null;
  elements.formModeLabel.textContent = "新規カード";
  elements.formTitle.textContent = "作業カードを作成";
  elements.cardForm.reset();
  elements.cardType.value = "issue";
  buildStatusOptions("issue", "backlog");
  elements.cardLabelColor.value = LABEL_COLORS[0];
  syncUrlDerivedFields();
  elements.archiveCardButton.hidden = true;
  elements.deleteCardButton.hidden = true;
  syncLinkedIssueVisibility();
  showFormPanel();
  renderBoard();
}

function openEditForm(cardId) {
  const card = findCard(cardId);
  if (!card) return;

  formMode = "edit";
  selectedCardId = cardId;
  elements.formModeLabel.textContent = "カード編集";
  elements.formTitle.textContent = formatCardNumber(card);
  elements.cardType.value = card.type;
  buildStatusOptions(card.type, card.status);
  elements.cardTitleInput.value = card.title || "";
  elements.cardUrl.value = card.url || "";
  elements.cardLabel.value = getLabels(card).join(", ");
  elements.cardLabelColor.value = state.labelColors[getLabels(card)[0]] || LABEL_COLORS[0];
  elements.linkedIssueSelect.value = card.linkedIssueId || "";
  elements.cardMemo.value = card.memo || "";
  syncUrlDerivedFields();
  elements.archiveCardButton.hidden = false;
  elements.deleteCardButton.hidden = false;
  syncLinkedIssueVisibility();
  showFormPanel();
  renderBoard();
}

function showFormPanel() {
  elements.panelEmpty.classList.add("hidden");
  elements.archivePanel.classList.add("hidden");
  elements.cardForm.classList.remove("hidden");
}

function showArchivePanel() {
  formMode = "archive";
  selectedCardId = null;
  elements.panelEmpty.classList.add("hidden");
  elements.cardForm.classList.add("hidden");
  elements.archivePanel.classList.remove("hidden");
  renderArchive();
  renderBoard();
}

function showEmptyPanel() {
  formMode = "idle";
  selectedCardId = null;
  elements.cardForm.classList.add("hidden");
  elements.archivePanel.classList.add("hidden");
  elements.panelEmpty.classList.remove("hidden");
  renderBoard();
}

function handleFormSubmit(event) {
  event.preventDefault();

  const payload = readFormPayload();
  if (!payload) return;

  if (!payload.title) {
    elements.cardTitleInput.focus();
    return;
  }

  if (formMode === "edit" && selectedCardId) {
    const card = findCard(selectedCardId);
    if (!card) return;
    Object.assign(card, payload);
  } else {
    state.cards.push({
      id: crypto.randomUUID(),
      archived: false,
      createdAt: new Date().toISOString(),
      ...payload,
    });
  }

  rememberLabels(payload.labels, payload.labelColor);
  ensureLinkColors();
  selectedCardId = formMode === "edit" ? selectedCardId : state.cards[state.cards.length - 1].id;
  formMode = "edit";
  render();
  openEditForm(selectedCardId);
}

function readFormPayload() {
  const url = elements.cardUrl.value.trim();
  const parsedUrl = parseGitHubUrl(url);
  if (!parsedUrl) {
    elements.cardUrl.setCustomValidity("GitHubのIssueまたはPRのURLを入力してください。");
    elements.cardUrl.reportValidity();
    return null;
  }

  elements.cardUrl.setCustomValidity("");
  const type = parsedUrl.type;
  const labels = splitLabels(elements.cardLabel.value);
  const linkedIssueId = type === "pr" ? elements.linkedIssueSelect.value : "";

  return {
    type,
    status: isStatusAllowed(type, elements.cardStatus.value) ? elements.cardStatus.value : getDefaultStatusForType(type),
    number: parsedUrl.number,
    repo: parsedUrl.repo,
    title: elements.cardTitleInput.value.trim(),
    url,
    labels,
    labelColor: elements.cardLabelColor.value,
    linkedIssueId,
    memo: elements.cardMemo.value.trim(),
    archived: false,
    updatedAt: new Date().toISOString(),
  };
}

function archiveSelectedCard() {
  if (!selectedCardId) return;
  const card = findCard(selectedCardId);
  if (!card) return;
  card.archived = true;
  showEmptyPanel();
  render();
}

function deleteSelectedCard() {
  if (!selectedCardId) return;
  removeCard(selectedCardId);
  showEmptyPanel();
  render();
}

function removeCard(cardId) {
  const index = state.cards.findIndex((card) => card.id === cardId);
  if (index === -1) return;

  state.cards.splice(index, 1);
  state.cards.forEach((card) => {
    if (card.linkedIssueId === cardId) card.linkedIssueId = "";
  });
  delete state.linkColors[cardId];
}

function moveCard(cardId, statusId) {
  const card = findCard(cardId);
  if (!card) return;
  if (!isStatusAllowed(card.type, statusId)) return;
  card.status = statusId;
  card.updatedAt = new Date().toISOString();
  render();
}

function handleDragOver(event) {
  if (!canPlaceCard(draggingCardId, event.currentTarget.dataset.type, event.currentTarget.dataset.status)) return;

  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

function handleDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");
  const cardId = event.dataTransfer.getData("text/plain");
  const card = findCard(cardId);
  if (!card) return;

  if (!canPlaceCard(card.id, event.currentTarget.dataset.type, event.currentTarget.dataset.status)) return;

  card.status = event.currentTarget.dataset.status;
  card.updatedAt = new Date().toISOString();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `github作業カンバン-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(String(reader.result));
      state.cards = Array.isArray(imported.cards) ? imported.cards : [];
      state.labelColors = imported.labelColors && typeof imported.labelColors === "object" ? imported.labelColors : {};
      state.linkColors = imported.linkColors && typeof imported.linkColors === "object" ? imported.linkColors : {};
      state.nextColorIndex = Number.isInteger(imported.nextColorIndex) ? imported.nextColorIndex : 0;
      normalizeCards(state.cards);
      selectedCardId = null;
      ensureLinkColors();
      showEmptyPanel();
      render();
    } catch {
      window.alert("このJSONファイルは読み込めませんでした。");
    } finally {
      elements.importInput.value = "";
    }
  });
  reader.readAsText(file);
}

function syncLinkedIssueVisibility() {
  const isPr = elements.cardType.value === "pr";
  elements.linkedIssueField.classList.toggle("hidden", !isPr);
}

function syncUrlDerivedFields() {
  elements.cardUrl.setCustomValidity("");
  const parsedUrl = parseGitHubUrl(elements.cardUrl.value.trim());

  if (!parsedUrl) {
    elements.urlDerivedMeta.textContent = "URLからリポジトリと番号を取得します。";
    return;
  }

  elements.urlDerivedMeta.textContent = `自動取得: ${parsedUrl.type === "issue" ? "イシュー" : "PR"} / ${parsedUrl.repo} / #${parsedUrl.number}`;

  if (elements.cardType.value !== parsedUrl.type) {
    elements.cardType.value = parsedUrl.type;
    buildStatusOptions(parsedUrl.type, elements.cardStatus.value);
    syncLinkedIssueVisibility();
  }
}

function syncLabelColorFromKnownLabel() {
  const firstLabel = splitLabels(elements.cardLabel.value)[0];
  if (firstLabel && state.labelColors[firstLabel]) {
    elements.cardLabelColor.value = state.labelColors[firstLabel];
  }
}

function syncPrLinkColorPreview() {
  const issueId = elements.linkedIssueSelect.value;
  if (!issueId) return;
  ensureColorForIssue(issueId);
}

function rememberLabels(labels, color) {
  labels.forEach((label, index) => {
    if (index === 0) {
      state.labelColors[label] = color;
    } else if (!state.labelColors[label]) {
      state.labelColors[label] = LABEL_COLORS[(Object.keys(state.labelColors).length + index) % LABEL_COLORS.length];
    }
  });
}

function ensureLinkColors() {
  state.cards
    .filter((card) => card.type === "issue")
    .forEach((issue) => ensureColorForIssue(issue.id));
}

function ensureColorForIssue(issueId) {
  if (state.linkColors[issueId]) return state.linkColors[issueId];
  const color = LINK_COLORS[state.nextColorIndex % LINK_COLORS.length];
  state.nextColorIndex += 1;
  state.linkColors[issueId] = color;
  return color;
}

function getCardLinkColor(card) {
  if (card.type === "issue") return ensureColorForIssue(card.id);
  if (card.linkedIssueId) return ensureColorForIssue(card.linkedIssueId);
  return "#8c959f";
}

function getLinkedCards(card) {
  if (card.type === "issue") {
    return state.cards.filter((candidate) => candidate.type === "pr" && candidate.linkedIssueId === card.id && !candidate.archived);
  }

  const issue = findCard(card.linkedIssueId);
  return issue && !issue.archived ? [issue] : [];
}

function normalizeCards(cards) {
  cards.forEach((card) => {
    const parsedUrl = parseGitHubUrl(card.url || "");
    if (parsedUrl) {
      card.type = parsedUrl.type;
      card.repo = parsedUrl.repo;
      card.number = parsedUrl.number;
    } else {
      card.type = card.type === "pr" ? "pr" : "issue";
    }

    if (!isStatusAllowed(card.type, card.status)) {
      card.status = getDefaultStatusForType(card.type);
    }

    if (card.type === "issue") {
      card.linkedIssueId = "";
    }
  });
}

function parseGitHubUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.hostname !== "github.com") return null;

    const [owner, repo, kind, number] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repo || !kind || !number) return null;
    if (!/^\d+$/.test(number)) return null;

    if (kind === "issues") {
      return { type: "issue", repo: `${owner}/${repo}`, number: Number(number) };
    }

    if (kind === "pull" || kind === "pulls") {
      return { type: "pr", repo: `${owner}/${repo}`, number: Number(number) };
    }
  } catch {
    return null;
  }

  return null;
}

function canPlaceCard(cardId, type, statusId) {
  const card = findCard(cardId);
  return Boolean(card && card.type === type && isStatusAllowed(type, statusId));
}

function getStatusesForType(type) {
  return STATUSES.filter((status) => status[type] === "normal");
}

function getDefaultStatusForType(type) {
  return type === "pr" ? "pr-open" : "backlog";
}

function isStatusAllowed(type, statusId) {
  return getStatusesForType(type).some((status) => status.id === statusId);
}

function getKnownLabels() {
  const labels = new Set();
  state.cards.forEach((card) => getLabels(card).forEach((label) => labels.add(label)));
  return Array.from(labels).sort((a, b) => a.localeCompare(b));
}

function getLabels(card) {
  if (Array.isArray(card.labels)) return card.labels.filter(Boolean);
  if (card.label) return [card.label];
  return [];
}

function splitLabels(value) {
  return value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

function findCard(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function formatCardNumber(card) {
  const prefix = card.type === "issue" ? "イシュー" : "PR";
  return card.number ? `${prefix} #${card.number}` : prefix;
}

function laneCount(type) {
  return state.cards.filter((card) => card.type === type && !card.archived).length;
}
