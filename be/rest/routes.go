package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func newRouter(srv *server, vervent verventAPI) chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
		r.Get("/auth/google/login", srv.handleLogin)
		r.Get("/auth/google/callback", srv.handleCallback)
		r.Post("/auth/logout", srv.handleLogout)

		r.With(srv.requireAuth).Get("/me", srv.handleMe)
		r.With(srv.requireAuth).Route("/vervent", vervent.routes)
		r.With(srv.requireAuth).Route("/copart", vervent.copartRoutes)
		r.With(srv.requireAuth).Route("/servicing", vervent.servicingRoutes)
		r.With(srv.requireAuth).Route("/loads", vervent.loadRoutes)
		r.With(srv.requireAuth).Get("/search", vervent.handleSearch)
	})

	// In production one process serves the built SPA too (STATIC_DIR=fe/web/app/dist); in
	// development Vite serves it and proxies /api here.
	if dir := os.Getenv("STATIC_DIR"); dir != "" {
		r.Handle("/*", spaHandler(dir))
	}

	return r
}

// spaHandler serves files from dir and falls back to index.html for any other path, so
// BrowserRouter routes like /vervent/contracts work on reload. Unknown /api paths still 404.
func spaHandler(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if f, err := os.Stat(filepath.Join(dir, filepath.Clean("/"+r.URL.Path))); err != nil || f.IsDir() {
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		files.ServeHTTP(w, r)
	})
}
