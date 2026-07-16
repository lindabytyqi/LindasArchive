const STORAGE_KEY = "lindasArchiveBooks";

const state = {
  books: loadBooks(),
  filters: {
    search: "",
    rating: 0,
    favorite: "all",
    pages: "all",
    notesOnly: false,
    sort: "newest"
  }
};

const els = {
  booksGrid: document.getElementById("booksGrid"),
  emptyState: document.getElementById("emptyState"),
  emptyMessage: document.getElementById("emptyMessage"),
  totalBooks: document.getElementById("totalBooks"),
  totalPages: document.getElementById("totalPages"),
  averageRating: document.getElementById("averageRating"),
  favoriteBooks: document.getElementById("favoriteBooks"),
  resultsCount: document.getElementById("resultsCount"),
  searchInput: document.getElementById("searchInput"),
  ratingFilter: document.getElementById("ratingFilter"),
  favoriteFilter: document.getElementById("favoriteFilter"),
  pagesFilter: document.getElementById("pagesFilter"),
  notesFilter: document.getElementById("notesFilter"),
  sortFilter: document.getElementById("sortFilter"),
  clearFilters: document.getElementById("clearFilters"),
  bookDialog: document.getElementById("bookDialog"),
  bookForm: document.getElementById("bookForm"),
  dialogTitle: document.getElementById("dialogTitle"),
  bookId: document.getElementById("bookId"),
  title: document.getElementById("title"),
  author: document.getElementById("author"),
  rating: document.getElementById("rating"),
  ratingValue: document.getElementById("ratingValue"),
  starRating: document.getElementById("starRating"),
  pages: document.getElementById("pages"),
  readingTime: document.getElementById("readingTime"),
  description: document.getElementById("description"),
  notes: document.getElementById("notes"),
  favorite: document.getElementById("favorite"),
  detailsDialog: document.getElementById("detailsDialog"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsContent: document.getElementById("detailsContent"),
  template: document.getElementById("bookCardTemplate")
};

function loadBooks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBooks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.books));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[char]);
}

function createStars(rating) {
  return `${"★".repeat(Number(rating))}${"☆".repeat(10 - Number(rating))}`;
}

function getInitials(title) {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
}

function formatNumber(value) {
  return new Intl.NumberFormat("it-IT").format(value);
}

function updateStats() {
  const total = state.books.length;
  const pages = state.books.reduce((sum, book) => sum + (Number(book.pages) || 0), 0);
  const average = total ? state.books.reduce((sum, book) => sum + Number(book.rating), 0) / total : 0;
  const favorites = state.books.filter(book => book.favorite).length;

  els.totalBooks.textContent = formatNumber(total);
  els.totalPages.textContent = formatNumber(pages);
  els.averageRating.textContent = average.toFixed(1);
  els.favoriteBooks.textContent = formatNumber(favorites);
}

function getFilteredBooks() {
  const search = state.filters.search.trim().toLowerCase();
  const filtered = state.books.filter(book => {
    const haystack = [book.title, book.author, book.description, book.notes, book.readingTime].join(" ").toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesRating = Number(book.rating) >= Number(state.filters.rating);
    const matchesFavorite = state.filters.favorite === "all" ||
      (state.filters.favorite === "favorites" && book.favorite) ||
      (state.filters.favorite === "not-favorites" && !book.favorite);
    const pages = Number(book.pages) || 0;
    const matchesPages = state.filters.pages === "all" ||
      (state.filters.pages === "short" && pages > 0 && pages <= 200) ||
      (state.filters.pages === "medium" && pages >= 201 && pages <= 400) ||
      (state.filters.pages === "long" && pages > 400);
    const matchesNotes = !state.filters.notesOnly || Boolean(book.notes?.trim());
    return matchesSearch && matchesRating && matchesFavorite && matchesPages && matchesNotes;
  });

  return filtered.sort((a, b) => {
    switch (state.filters.sort) {
      case "oldest": return new Date(a.createdAt) - new Date(b.createdAt);
      case "title-asc": return a.title.localeCompare(b.title, "it");
      case "title-desc": return b.title.localeCompare(a.title, "it");
      case "rating-desc": return Number(b.rating) - Number(a.rating);
      case "pages-desc": return (Number(b.pages) || 0) - (Number(a.pages) || 0);
      case "time-asc": return (a.readingTime || "zzz").localeCompare(b.readingTime || "zzz", "it", { numeric: true });
      default: return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });
}

function renderBooks() {
  const books = getFilteredBooks();
  els.booksGrid.innerHTML = "";
  els.resultsCount.textContent = `${books.length} ${books.length === 1 ? "risultato" : "risultati"}`;

  books.forEach(book => {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector(".book-card");
    const favoriteButton = fragment.querySelector(".favorite-button");

    favoriteButton.classList.toggle("active", book.favorite);
    favoriteButton.setAttribute("aria-pressed", String(book.favorite));
    fragment.querySelector(".book-pages").textContent = book.pages ? `${book.pages} pagine` : "Pagine non indicate";
    fragment.querySelector(".cover-initials").textContent = getInitials(book.title);
    fragment.querySelector(".book-rating").textContent = `${createStars(book.rating)}  ${book.rating}/10`;
    fragment.querySelector(".book-title").textContent = book.title;
    fragment.querySelector(".book-author").textContent = book.author;
    fragment.querySelector(".book-description").textContent = book.description || "Nessuna descrizione inserita.";

    const meta = fragment.querySelector(".book-meta");
    if (book.readingTime) meta.insertAdjacentHTML("beforeend", `<span class="meta-pill">${escapeHtml(book.readingTime)}</span>`);
    if (book.notes) meta.insertAdjacentHTML("beforeend", `<span class="meta-pill">Con note</span>`);
    if (book.favorite) meta.insertAdjacentHTML("beforeend", `<span class="meta-pill">♥ Preferito</span>`);

    favoriteButton.addEventListener("click", () => toggleFavorite(book.id));
    fragment.querySelector(".view-button").addEventListener("click", () => openDetails(book.id));
    fragment.querySelector(".edit-button").addEventListener("click", () => openBookDialog(book));
    fragment.querySelector(".delete-button").addEventListener("click", () => deleteBook(book.id));
    card.dataset.id = book.id;
    els.booksGrid.appendChild(fragment);
  });

  const hasNoBooks = state.books.length === 0;
  const hasNoResults = books.length === 0;
  els.emptyState.hidden = !hasNoResults;
  els.booksGrid.hidden = hasNoResults;
  els.emptyMessage.textContent = hasNoBooks
    ? "Aggiungi il tuo primo libro per iniziare l'archivio."
    : "Prova a modificare la ricerca o ad azzerare i filtri.";

  updateStats();
}

function buildStarRating() {
  els.starRating.innerHTML = "";
  for (let value = 1; value <= 10; value++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "star-button";
    button.textContent = "★";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", `${value} stelle su 10`);
    button.addEventListener("click", () => setRating(value));
    els.starRating.appendChild(button);
  }
}

function setRating(value) {
  els.rating.value = value;
  els.ratingValue.textContent = value;
  [...els.starRating.children].forEach((button, index) => {
    const active = index < value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(index + 1 === value));
  });
}

function openBookDialog(book = null) {
  els.bookForm.reset();
  els.bookId.value = book?.id || "";
  els.dialogTitle.textContent = book ? "Modifica libro" : "Aggiungi un libro";
  els.title.value = book?.title || "";
  els.author.value = book?.author || "";
  els.pages.value = book?.pages || "";
  els.readingTime.value = book?.readingTime || "";
  els.description.value = book?.description || "";
  els.notes.value = book?.notes || "";
  els.favorite.checked = Boolean(book?.favorite);
  setRating(Number(book?.rating) || 0);
  els.bookDialog.showModal();
  setTimeout(() => els.title.focus(), 80);
}

function closeBookDialog() {
  els.bookDialog.close();
}

function submitBook(event) {
  event.preventDefault();
  if (!els.rating.value) {
    els.starRating.focus();
    els.ratingValue.textContent = "Scegli una valutazione";
    return;
  }

  const existingId = els.bookId.value;
  const existing = state.books.find(book => book.id === existingId);
  const book = {
    id: existingId || crypto.randomUUID(),
    title: els.title.value.trim(),
    author: els.author.value.trim(),
    rating: Number(els.rating.value),
    pages: els.pages.value ? Number(els.pages.value) : "",
    readingTime: els.readingTime.value.trim(),
    description: els.description.value.trim(),
    notes: els.notes.value.trim(),
    favorite: els.favorite.checked,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingId) {
    state.books = state.books.map(item => item.id === existingId ? book : item);
  } else {
    state.books.push(book);
  }

  saveBooks();
  renderBooks();
  closeBookDialog();
}

function toggleFavorite(id) {
  state.books = state.books.map(book => book.id === id ? { ...book, favorite: !book.favorite, updatedAt: new Date().toISOString() } : book);
  saveBooks();
  renderBooks();
}

function deleteBook(id) {
  const book = state.books.find(item => item.id === id);
  if (!book) return;
  const confirmed = window.confirm(`Vuoi eliminare “${book.title}” dall'archivio?`);
  if (!confirmed) return;
  state.books = state.books.filter(item => item.id !== id);
  saveBooks();
  renderBooks();
}

function openDetails(id) {
  const book = state.books.find(item => item.id === id);
  if (!book) return;
  els.detailsTitle.textContent = book.title;
  els.detailsContent.innerHTML = `
    <div class="details-summary">
      <div class="details-cover"><span>${escapeHtml(getInitials(book.title))}</span></div>
      <div>
        <p class="details-author">${escapeHtml(book.author)}</p>
        <p class="details-rating">${createStars(book.rating)} &nbsp; ${book.rating}/10</p>
        <div class="details-meta">
          ${book.pages ? `<span class="meta-pill">${book.pages} pagine</span>` : ""}
          ${book.readingTime ? `<span class="meta-pill">${escapeHtml(book.readingTime)}</span>` : ""}
          ${book.favorite ? `<span class="meta-pill">♥ Preferito</span>` : ""}
        </div>
      </div>
    </div>
    <section class="details-section">
      <h3>Descrizione</h3>
      <p>${escapeHtml(book.description || "Nessuna descrizione inserita.")}</p>
    </section>
    <section class="details-section">
      <h3>Note personali</h3>
      <p>${escapeHtml(book.notes || "Nessuna nota inserita.")}</p>
    </section>
  `;
  els.detailsDialog.showModal();
}

function resetFilters() {
  state.filters = { search: "", rating: 0, favorite: "all", pages: "all", notesOnly: false, sort: "newest" };
  els.searchInput.value = "";
  els.ratingFilter.value = "0";
  els.favoriteFilter.value = "all";
  els.pagesFilter.value = "all";
  els.notesFilter.checked = false;
  els.sortFilter.value = "newest";
  renderBooks();
}

function bindEvents() {
  ["openAddBook", "heroAddBook", "emptyAddBook"].forEach(id => document.getElementById(id).addEventListener("click", () => openBookDialog()));
  document.getElementById("scrollToArchive").addEventListener("click", () => document.getElementById("archive").scrollIntoView({ behavior: "smooth" }));
  document.getElementById("closeDialog").addEventListener("click", closeBookDialog);
  document.getElementById("cancelDialog").addEventListener("click", closeBookDialog);
  document.getElementById("closeDetails").addEventListener("click", () => els.detailsDialog.close());
  els.bookForm.addEventListener("submit", submitBook);
  els.clearFilters.addEventListener("click", resetFilters);

  els.searchInput.addEventListener("input", event => { state.filters.search = event.target.value; renderBooks(); });
  els.ratingFilter.addEventListener("change", event => { state.filters.rating = Number(event.target.value); renderBooks(); });
  els.favoriteFilter.addEventListener("change", event => { state.filters.favorite = event.target.value; renderBooks(); });
  els.pagesFilter.addEventListener("change", event => { state.filters.pages = event.target.value; renderBooks(); });
  els.notesFilter.addEventListener("change", event => { state.filters.notesOnly = event.target.checked; renderBooks(); });
  els.sortFilter.addEventListener("change", event => { state.filters.sort = event.target.value; renderBooks(); });

  [els.bookDialog, els.detailsDialog].forEach(dialog => {
    dialog.addEventListener("click", event => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (clickedOutside) dialog.close();
    });
  });
}

buildStarRating();
bindEvents();
renderBooks();
