import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STORAGE_KEY = "lindasArchiveBooks";
const firebaseReady = Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("INCOLLA_QUI"));
let auth = null;
let db = null;
let currentUser = null;
let unsubscribeBooks = null;
let authMode = "login";

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
  template: document.getElementById("bookCardTemplate"),
  syncBadge: document.getElementById("syncBadge"),
  setupBanner: document.getElementById("setupBanner"),
  accountButton: document.getElementById("accountButton"),
  authDialog: document.getElementById("authDialog"),
  authForm: document.getElementById("authForm"),
  authTitle: document.getElementById("authTitle"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authMessage: document.getElementById("authMessage"),
  authSubmit: document.getElementById("authSubmit"),
  toggleAuthMode: document.getElementById("toggleAuthMode")
};

function loadBooks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalBackup() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.books));
}

function setSyncStatus(text, kind = "") {
  els.syncBadge.textContent = text;
  els.syncBadge.className = `sync-badge ${kind}`.trim();
}

async function saveBook(book) {
  if (firebaseReady && currentUser) {
    await setDoc(doc(db, "users", currentUser.uid, "books", book.id), book);
  } else {
    saveLocalBackup();
  }
}

async function removeBook(id) {
  if (firebaseReady && currentUser) {
    await deleteDoc(doc(db, "users", currentUser.uid, "books", id));
  } else {
    saveLocalBackup();
  }
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

async function submitBook(event) {
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

  saveLocalBackup();
  renderBooks();
  closeBookDialog();
  try {
    await saveBook(book);
    if (currentUser) setSyncStatus("Sincronizzato", "online");
  } catch (error) {
    console.error(error);
    setSyncStatus("Errore sincronizzazione", "offline");
    alert("Il libro è stato salvato sul dispositivo, ma non è stato possibile sincronizzarlo online.");
  }
}

async function toggleFavorite(id) {
  let updatedBook;
  state.books = state.books.map(book => {
    if (book.id !== id) return book;
    updatedBook = { ...book, favorite: !book.favorite, updatedAt: new Date().toISOString() };
    return updatedBook;
  });
  saveLocalBackup();
  renderBooks();
  if (updatedBook) await saveBook(updatedBook);
}

async function deleteBook(id) {
  const book = state.books.find(item => item.id === id);
  if (!book) return;
  const confirmed = window.confirm(`Vuoi eliminare “${book.title}” dall'archivio?`);
  if (!confirmed) return;
  state.books = state.books.filter(item => item.id !== id);
  saveLocalBackup();
  renderBooks();
  try { await removeBook(id); } catch (error) { console.error(error); setSyncStatus("Errore sincronizzazione", "offline"); }
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

function updateAuthUi(user) {
  currentUser = user;
  els.accountButton.textContent = user ? "Esci" : "Accedi";
  if (user) {
    setSyncStatus("Sincronizzato", "online");
    els.setupBanner.hidden = true;
  } else if (firebaseReady) {
    setSyncStatus("Accesso richiesto", "offline");
  }
}

function openAuthDialog() {
  authMode = "login";
  els.authForm.reset();
  els.authMessage.textContent = "";
  refreshAuthDialog();
  els.authDialog.showModal();
}

function refreshAuthDialog() {
  const signup = authMode === "signup";
  els.authTitle.textContent = signup ? "Crea account" : "Accedi";
  els.authSubmit.textContent = signup ? "Crea account" : "Accedi";
  els.toggleAuthMode.textContent = signup ? "Ho già un account" : "Crea un account";
  els.authPassword.autocomplete = signup ? "new-password" : "current-password";
}

function friendlyAuthError(error) {
  const messages = {
    "auth/invalid-credential": "Email o password non corretti.",
    "auth/email-already-in-use": "Esiste già un account con questa email.",
    "auth/weak-password": "La password deve contenere almeno 6 caratteri.",
    "auth/invalid-email": "Inserisci un indirizzo email valido.",
    "auth/network-request-failed": "Connessione assente. Riprova quando sei online."
  };
  return messages[error.code] || "Non è stato possibile completare l’accesso.";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  els.authMessage.textContent = "";
  els.authSubmit.disabled = true;
  try {
    const email = els.authEmail.value.trim();
    const password = els.authPassword.value;
    if (authMode === "signup") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
    els.authDialog.close();
  } catch (error) {
    els.authMessage.textContent = friendlyAuthError(error);
  } finally {
    els.authSubmit.disabled = false;
  }
}

function subscribeToCloudBooks(user) {
  if (unsubscribeBooks) unsubscribeBooks();
  if (!user) return;
  setSyncStatus("Sincronizzazione…");
  const booksRef = collection(db, "users", user.uid, "books");
  let initialSnapshot = true;
  unsubscribeBooks = onSnapshot(booksRef, async snapshot => {
    const cloudBooks = snapshot.docs.map(item => item.data());
    if (initialSnapshot && cloudBooks.length === 0 && state.books.length > 0) {
      initialSnapshot = false;
      setSyncStatus("Importazione libri…");
      await Promise.all(state.books.map(book => setDoc(doc(db, "users", user.uid, "books", book.id), book)));
      return;
    }
    initialSnapshot = false;
    state.books = cloudBooks;
    saveLocalBackup();
    renderBooks();
    setSyncStatus("Sincronizzato", "online");
  }, error => {
    console.error(error);
    setSyncStatus("Offline", "offline");
  });
}

async function initializeFirebase() {
  if (!firebaseReady) {
    els.setupBanner.hidden = false;
    setSyncStatus("Configurazione richiesta", "offline");
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    await setPersistence(auth, browserLocalPersistence);
    enableIndexedDbPersistence(db).catch(() => {});
    onAuthStateChanged(auth, user => {
      updateAuthUi(user);
      subscribeToCloudBooks(user);
      if (!user) renderBooks();
    });
  } catch (error) {
    console.error(error);
    els.setupBanner.hidden = false;
    setSyncStatus("Configurazione errata", "offline");
  }
}

function bindEvents() {
  els.accountButton.addEventListener("click", async () => {
    if (!firebaseReady) { els.setupBanner.hidden = false; els.setupBanner.scrollIntoView({ behavior: "smooth" }); return; }
    if (currentUser) await signOut(auth); else openAuthDialog();
  });
  document.getElementById("closeAuth").addEventListener("click", () => els.authDialog.close());
  els.toggleAuthMode.addEventListener("click", () => { authMode = authMode === "login" ? "signup" : "login"; els.authMessage.textContent = ""; refreshAuthDialog(); });
  els.authForm.addEventListener("submit", handleAuthSubmit);
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

  [els.bookDialog, els.detailsDialog, els.authDialog].forEach(dialog => {
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
initializeFirebase();
