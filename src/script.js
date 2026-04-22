const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/original";
const PLACEHOLDER = "https://placehold.co/500x750/1a1c22/f5f6f8?text=No+Poster";

const state = {
  apiKey: localStorage.getItem("tmdbApiKey") || "",
  currentView: "home",
  mode: "popular",
  query: "",
  genre: "",
  sort: "popularity.desc",
  page: 1,
  totalPages: 1,
  favorites: JSON.parse(localStorage.getItem("cineScopeFavorites") || "[]"),
  suggestionTimer: null
};

$(init);

function init() {
  bindEvents();
  updateKeyInput();
  loadGenres();

  if (state.apiKey) {
    loadMovies();
  } else {
    openKeyModal();
    showAlert("Add your TMDB API key to start loading live movie data.");
  }
}

function bindEvents() {
  $("#searchForm").on("submit", function (event) {
    event.preventDefault();
    state.query = $("#searchInput").val().trim();
    state.page = 1;
    state.currentView = "home";
    $(".nav-link").removeClass("is-active");
    $('[data-view="home"]').addClass("is-active");
    hideSuggestions();
    loadMovies();
  });

  $("#searchInput").on("input", function () {
    const value = $(this).val().trim();
    clearTimeout(state.suggestionTimer);
    if (value.length < 2 || !state.apiKey) {
      hideSuggestions();
      return;
    }
    state.suggestionTimer = setTimeout(() => loadSuggestions(value), 280);
  });

  $("#genreSelect").on("change", function () {
    state.genre = $(this).val();
    state.mode = "discover";
    state.query = "";
    state.page = 1;
    $("#searchInput").val("");
    $(".segment").removeClass("is-selected");
    $('[data-mode="discover"]').addClass("is-selected");
    setHomeView();
    loadMovies();
  });

  $("#sortSelect").on("change", function () {
    state.sort = $(this).val();
    state.page = 1;
    if (!state.query) {
      state.mode = "discover";
      $(".segment").removeClass("is-selected");
      $('[data-mode="discover"]').addClass("is-selected");
    }
    setHomeView();
    loadMovies();
  });

  $(".segment").on("click", function () {
    state.mode = $(this).data("mode");
    state.query = "";
    state.page = 1;
    $("#searchInput").val("");
    $(".segment").removeClass("is-selected");
    $(this).addClass("is-selected");
    setHomeView();
    loadMovies();
  });

  $(".nav-link").on("click", function () {
    const view = $(this).data("view");
    $(".nav-link").removeClass("is-active");
    $(this).addClass("is-active");
    state.currentView = view;
    state.page = 1;
    if (view === "favorites") {
      renderFavorites();
    } else {
      loadMovies();
    }
  });

  $("#prevPage").on("click", function () {
    if (state.page > 1) {
      state.page -= 1;
      loadMovies();
    }
  });

  $("#nextPage").on("click", function () {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadMovies();
    }
  });

  $("#apiKeyButton").on("click", openKeyModal);
  $("[data-close-key]").on("click", closeKeyModal);
  $("[data-close-modal]").on("click", closeDetailModal);

  $("#keyForm").on("submit", function (event) {
    event.preventDefault();
    const key = $("#apiKeyInput").val().trim();
    if (!key) {
      showAlert("Please paste a TMDB API key before saving.");
      return;
    }
    state.apiKey = key;
    localStorage.setItem("tmdbApiKey", key);
    closeKeyModal();
    loadGenres();
    loadMovies();
  });

  $("#clearKey").on("click", function () {
    state.apiKey = "";
    localStorage.removeItem("tmdbApiKey");
    updateKeyInput();
    showAlert("API key cleared. Add a key again to fetch TMDB data.");
  });

  $(document).on("keydown", function (event) {
    if (event.key === "Escape") {
      closeDetailModal();
      closeKeyModal();
      hideSuggestions();
    }
  });

  $(document).on("click", function (event) {
    if (!$(event.target).closest("#searchForm").length) {
      hideSuggestions();
    }
  });
}

function setHomeView() {
  state.currentView = "home";
  $(".nav-link").removeClass("is-active");
  $('[data-view="home"]').addClass("is-active");
}

function updateKeyInput() {
  $("#apiKeyInput").val(state.apiKey);
}

function tmdbRequest(path, params = {}) {
  if (!state.apiKey) {
    return $.Deferred().reject({ status_message: "Missing TMDB API key." }).promise();
  }

  return $.ajax({
    url: `${API_BASE}${path}`,
    method: "GET",
    dataType: "json",
    data: {
      api_key: state.apiKey,
      language: "en-US",
      include_adult: false,
      ...params
    }
  });
}

function loadGenres() {
  if (!state.apiKey) return;

  tmdbRequest("/genre/movie/list")
    .done(function (data) {
      const options = ['<option value="">All genres</option>'];
      data.genres.forEach(function (genre) {
        options.push(`<option value="${genre.id}">${escapeHtml(genre.name)}</option>`);
      });
      $("#genreSelect").html(options.join("")).val(state.genre);
    })
    .fail(handleApiError);
}

function loadMovies() {
  if (state.currentView === "favorites") {
    renderFavorites();
    return;
  }

  if (!state.apiKey) {
    openKeyModal();
    return;
  }

  showLoading(true);
  hideAlert();
  $("#emptyState").prop("hidden", true);

  let request;
  if (state.query) {
    request = tmdbRequest("/search/movie", { query: state.query, page: state.page });
    $("#resultKicker").text("Search results");
    $("#resultTitle").text(`Results for "${state.query}"`);
  } else if (state.mode === "popular") {
    request = tmdbRequest("/movie/popular", { page: state.page });
    $("#resultKicker").text("Popular movies");
    $("#resultTitle").text("Explore Movies");
  } else if (state.mode === "top_rated") {
    request = tmdbRequest("/movie/top_rated", { page: state.page });
    $("#resultKicker").text("Top rated movies");
    $("#resultTitle").text("Audience Favorites");
  } else {
    request = tmdbRequest("/discover/movie", {
      page: state.page,
      sort_by: state.sort,
      with_genres: state.genre
    });
    $("#resultKicker").text("Filtered discovery");
    $("#resultTitle").text("Discover by Genre and Sort");
  }

  request
    .done(function (data) {
      state.totalPages = Math.min(data.total_pages || 1, 500);
      renderMovies(state.query ? sortResults(data.results || []) : (data.results || []));
      updatePagination();
      $("#resultCount").text(`${data.total_results || 0} results`);
    })
    .fail(handleApiError)
    .always(function () {
      showLoading(false);
    });
}

function loadSuggestions(query) {
  tmdbRequest("/search/movie", { query, page: 1 })
    .done(function (data) {
      const suggestions = (data.results || []).slice(0, 6);
      if (!suggestions.length) {
        hideSuggestions();
        return;
      }

      const html = suggestions.map(function (movie) {
        const year = movie.release_date ? movie.release_date.slice(0, 4) : "No date";
        return `
          <button class="suggestion" type="button" data-title="${escapeAttr(movie.title)}">
            <span>${escapeHtml(movie.title)}</span>
            <span>${year}</span>
          </button>
        `;
      }).join("");

      $("#suggestions").html(html).show();
      $(".suggestion").on("click", function () {
        $("#searchInput").val($(this).data("title"));
        $("#searchForm").trigger("submit");
      });
    });
}

function renderMovies(movies) {
  const grid = $("#movieGrid").empty();
  $("#emptyState").prop("hidden", movies.length > 0);

  movies.forEach(function (movie) {
    const card = $($("#movieCardTemplate").html());
    const year = movie.release_date ? movie.release_date.slice(0, 4) : "Release date unavailable";
    const poster = movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : PLACEHOLDER;
    const isSaved = hasFavorite(movie.id);

    card.find("img").attr({
      src: poster,
      alt: `${movie.title} poster`
    });
    card.find(".rating").text(formatRating(movie.vote_average));
    card.find("h3").text(movie.title || "Untitled movie");
    card.find("p").text(year);
    card.find(".poster-button, .details-button").on("click", function () {
      openDetails(movie.id);
    });
    card.find(".favorite-button")
      .toggleClass("is-saved", isSaved)
      .text(isSaved ? "Saved" : "Save")
      .on("click", function () {
        toggleFavorite(movie);
        $(this).toggleClass("is-saved").text(hasFavorite(movie.id) ? "Saved" : "Save");
      });

    grid.append(card);
  });
}

function renderFavorites() {
  hideAlert();
  showLoading(false);
  $("#resultKicker").text("Local watchlist");
  $("#resultTitle").text("Saved Favorites");
  $("#resultCount").text(`${state.favorites.length} saved`);
  state.totalPages = 1;
  state.page = 1;
  updatePagination();
  renderMovies(state.favorites);
  if (!state.favorites.length) {
    $("#emptyState").prop("hidden", false).find("h3").text("No favorites yet");
    $("#emptyState").find("p").text("Save movies from search, popular, or genre discovery to build your watchlist.");
  }
}

function openDetails(movieId) {
  showLoading(true);
  $.when(
    tmdbRequest(`/movie/${movieId}`),
    tmdbRequest(`/movie/${movieId}/credits`)
  )
    .done(function (detailResponse, creditsResponse) {
      const movie = detailResponse[0];
      const credits = creditsResponse[0];
      renderDetails(movie, credits);
      $("#detailModal").addClass("is-open").attr("aria-hidden", "false");
    })
    .fail(handleApiError)
    .always(function () {
      showLoading(false);
    });
}

function renderDetails(movie, credits) {
  const poster = movie.poster_path ? `${IMAGE_BASE}${movie.poster_path}` : PLACEHOLDER;
  const backdrop = movie.backdrop_path ? `${BACKDROP_BASE}${movie.backdrop_path}` : "";
  const cast = (credits.cast || []).slice(0, 8).map(function (person) {
    return `<span class="pill">${escapeHtml(person.name)} as ${escapeHtml(person.character || "Cast")}</span>`;
  }).join("");
  const genres = (movie.genres || []).map(function (genre) {
    return `<span class="pill">${escapeHtml(genre.name)}</span>`;
  }).join("");
  const runtime = movie.runtime ? `${movie.runtime} min` : "Runtime unavailable";
  const releaseDate = movie.release_date || "Release date unavailable";
  const saved = hasFavorite(movie.id);

  $("#detailContent").html(`
    <section class="detail-hero" style="${backdrop ? `background-image: linear-gradient(90deg, rgba(16,17,20,0.96), rgba(16,17,20,0.6)), url('${backdrop}')` : ""}">
      <img class="detail-poster" src="${poster}" alt="${escapeAttr(movie.title)} poster">
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(movie.tagline || "Movie details")}</p>
        <h2 id="detailTitle">${escapeHtml(movie.title)}</h2>
        <div class="meta-line">
          <span class="pill">${releaseDate}</span>
          <span class="pill">${runtime}</span>
          <span class="pill">${formatRating(movie.vote_average)} / 10</span>
        </div>
      </div>
    </section>
    <section class="detail-body">
      <div>
        <h3>Overview</h3>
        <p>${escapeHtml(movie.overview || "No overview is available for this movie.")}</p>
        <h3>Genres</h3>
        <div class="genre-list">${genres || '<span class="pill">No genres listed</span>'}</div>
      </div>
      <aside>
        <h3>Top Cast</h3>
        <div class="cast-list">${cast || '<span class="pill">No cast listed</span>'}</div>
        <button class="favorite-button ${saved ? "is-saved" : ""}" id="detailFavorite" type="button">${saved ? "Saved" : "Save"}</button>
      </aside>
    </section>
  `);

  $("#detailFavorite").on("click", function () {
    toggleFavorite(movie);
    $(this).toggleClass("is-saved").text(hasFavorite(movie.id) ? "Saved" : "Save");
    if (state.currentView === "favorites") renderFavorites();
  });
}

function toggleFavorite(movie) {
  if (hasFavorite(movie.id)) {
    state.favorites = state.favorites.filter(function (item) {
      return item.id !== movie.id;
    });
  } else {
    state.favorites.unshift({
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date,
      vote_average: movie.vote_average,
      overview: movie.overview
    });
  }
  localStorage.setItem("cineScopeFavorites", JSON.stringify(state.favorites));
}

function hasFavorite(movieId) {
  return state.favorites.some(function (movie) {
    return movie.id === movieId;
  });
}

function updatePagination() {
  $("#pageLabel").text(`Page ${state.page} of ${state.totalPages}`);
  $("#prevPage").prop("disabled", state.page <= 1 || state.currentView === "favorites");
  $("#nextPage").prop("disabled", state.page >= state.totalPages || state.currentView === "favorites");
}

function showLoading(isLoading) {
  $("#loading").prop("hidden", !isLoading);
}

function showAlert(message) {
  $("#alert").text(message).prop("hidden", false);
}

function hideAlert() {
  $("#alert").prop("hidden", true);
}

function handleApiError(error) {
  const message = error.responseJSON?.status_message || error.status_message || "Something went wrong while contacting TMDB.";
  showAlert(message);
}

function openKeyModal() {
  updateKeyInput();
  $("#keyModal").addClass("is-open").attr("aria-hidden", "false");
}

function closeKeyModal() {
  $("#keyModal").removeClass("is-open").attr("aria-hidden", "true");
}

function closeDetailModal() {
  $("#detailModal").removeClass("is-open").attr("aria-hidden", "true");
}

function hideSuggestions() {
  $("#suggestions").hide().empty();
}

function sortResults(movies) {
  const [field, direction] = state.sort.split(".");
  const key = field === "primary_release_date" ? "release_date" : field;
  return [...movies].sort(function (a, b) {
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    if (typeof aVal === "string") {
      return direction === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return direction === "asc" ? aVal - bVal : bVal - aVal;
  });
}

function formatRating(value) {
  const number = Number(value || 0);
  return number ? number.toFixed(1) : "N/A";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
