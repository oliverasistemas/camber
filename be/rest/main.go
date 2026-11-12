package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	sessionCookie = "session"
	stateCookie   = "oauth_state"
	sessionTTL    = 7 * 24 * time.Hour

	defaultClientSecretFile = "../../client_secret_75992393432-set3hdcgdsftm0pqjoufgribhavhbj5b.apps.googleusercontent.com.json"
)

type User struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type session struct {
	User    User  `json:"user"`
	Expires int64 `json:"exp"`
}

type server struct {
	oauth         *oauth2.Config
	secret        []byte
	frontendURL   string
	secureCookies bool
	allowedDomain string          // AUTH_ALLOWED_DOMAIN; empty admits any verified Google account
	allowedEmails map[string]bool // AUTH_ALLOWED_EMAILS, comma-separated, admitted regardless of domain
}

// verventAPI is the /api/vervent backend: Postgres when DATABASE_URL is set, else the mock JSON.
type verventAPI interface {
	routes(chi.Router)
}

func main() {
	creds, err := os.ReadFile(env("GOOGLE_CLIENT_SECRET_FILE", defaultClientSecretFile))
	if err != nil {
		log.Fatalf("reading google client secret: %v", err)
	}
	oauth, err := google.ConfigFromJSON(creds, "openid", "email", "profile")
	if err != nil {
		log.Fatalf("parsing google client secret: %v", err)
	}
	// Defaults to going through the Vite dev proxy so cookies are same-origin with the frontend.
	oauth.RedirectURL = env("GOOGLE_REDIRECT_URL", "http://localhost:5173/api/auth/google/callback")

	var vervent verventAPI
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		vervent, err = openPGVervent(ctx, dsn)
		cancel()
		if err != nil {
			log.Fatalf("connecting to vervent database: %v", err)
		}
		log.Printf("vervent data from Postgres")
	} else {
		vervent, err = loadVervent(env("VERVENT_MOCK_DIR", defaultVerventMockDir))
		if err != nil {
			log.Fatalf("loading vervent mock data: %v", err)
		}
		log.Printf("vervent data from mock JSON (set DATABASE_URL for Postgres)")
	}

	frontendURL := env("FRONTEND_URL", "http://localhost:5173")
	srv := &server{
		oauth:         oauth,
		secret:        []byte(mustEnv("SESSION_SECRET")),
		frontendURL:   frontendURL,
		secureCookies: strings.HasPrefix(frontendURL, "https://"),
		allowedDomain: strings.ToLower(os.Getenv("AUTH_ALLOWED_DOMAIN")),
		allowedEmails: map[string]bool{},
	}
	for _, e := range strings.Split(os.Getenv("AUTH_ALLOWED_EMAILS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			srv.allowedEmails[e] = true
		}
	}

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
	})

	// In production one process serves the built SPA too (STATIC_DIR=fe/web/app/dist); in
	// development Vite serves it and proxies /api here.
	if dir := os.Getenv("STATIC_DIR"); dir != "" {
		r.Handle("/*", spaHandler(dir))
	}

	addr := env("ADDR", ":8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, r))
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	state := randomString()
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookie,
		Value:    state,
		Path:     "/api/auth",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   s.secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, s.oauth.AuthCodeURL(state), http.StatusFound)
}

func (s *server) handleCallback(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(stateCookie)
	if err != nil || r.URL.Query().Get("state") != c.Value {
		http.Error(w, "invalid oauth state", http.StatusBadRequest)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Path: "/api/auth", MaxAge: -1})

	if e := r.URL.Query().Get("error"); e != "" {
		http.Redirect(w, r, s.frontendURL+"/?error="+url.QueryEscape(e), http.StatusFound)
		return
	}

	token, err := s.oauth.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "code exchange failed", http.StatusBadGateway)
		return
	}

	user, err := s.fetchUser(r, token)
	if err != nil {
		http.Error(w, "failed to fetch user info", http.StatusBadGateway)
		return
	}
	if !s.allowed(user) {
		log.Printf("sign-in refused for %s", user.Email)
		http.Redirect(w, r, s.frontendURL+"/?error=access_denied", http.StatusFound)
		return
	}

	value, err := s.sign(session{User: user, Expires: time.Now().Add(sessionTTL).Unix()})
	if err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    value,
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   s.secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, s.frontendURL, http.StatusFound)
}

func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, r.Context().Value(userKey{}))
}

type userKey struct{}

func (s *server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		sess, err := s.verify(c.Value)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(contextWithUser(r, sess.User)))
	})
}

func (s *server) fetchUser(r *http.Request, token *oauth2.Token) (User, error) {
	resp, err := s.oauth.Client(r.Context(), token).Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return User{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return User{}, errors.New("userinfo returned " + resp.Status)
	}
	var info struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return User{}, err
	}
	if !info.EmailVerified {
		return User{}, errors.New("email not verified")
	}
	return User{ID: info.Sub, Email: info.Email, Name: info.Name, Picture: info.Picture}, nil
}

// allowed admits the addresses in AUTH_ALLOWED_EMAILS and, if AUTH_ALLOWED_DOMAIN is set, only
// that domain otherwise. fetchUser has already required a verified email.
func (s *server) allowed(u User) bool {
	email := strings.ToLower(u.Email)
	if s.allowedEmails[email] {
		return true
	}
	return s.allowedDomain == "" || strings.HasSuffix(email, "@"+s.allowedDomain)
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

// sign encodes the session as base64(json).base64(hmac).
func (s *server) sign(sess session) (string, error) {
	payload, err := json.Marshal(sess)
	if err != nil {
		return "", err
	}
	p := base64.RawURLEncoding.EncodeToString(payload)
	return p + "." + base64.RawURLEncoding.EncodeToString(s.mac(p)), nil
}

func (s *server) verify(value string) (session, error) {
	p, sig, ok := strings.Cut(value, ".")
	if !ok {
		return session{}, errors.New("malformed session")
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(got, s.mac(p)) {
		return session{}, errors.New("bad signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return session{}, err
	}
	var sess session
	if err := json.Unmarshal(payload, &sess); err != nil {
		return session{}, err
	}
	if time.Now().Unix() > sess.Expires {
		return session{}, errors.New("session expired")
	}
	return sess, nil
}

func (s *server) mac(data string) []byte {
	h := hmac.New(sha256.New, s.secret)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func contextWithUser(r *http.Request, u User) context.Context {
	return context.WithValue(r.Context(), userKey{}, u)
}

func randomString() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("missing required env var %s", key)
	}
	return v
}
