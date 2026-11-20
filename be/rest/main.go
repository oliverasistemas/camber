package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/oauth2"
)

const (
	sessionCookie = "session"
	sessionTTL    = 7 * 24 * time.Hour
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

// verventAPI is the /api/vervent, /api/copart, /api/servicing, /api/loads and /api/snapshots backend: Postgres when
// DATABASE_URL is set, else the mock JSON (which has no Copart data, so /api/copart lists come back empty).
type verventAPI interface {
	routes(chi.Router)
	copartRoutes(chi.Router)
	servicingRoutes(chi.Router)
	loadRoutes(chi.Router)
	snapshotRoutes(chi.Router)
	handleSearch(http.ResponseWriter, *http.Request)
}

func main() {
	oauth, err := newGoogleOAuth()
	if err != nil {
		log.Fatal(err)
	}

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
		allowedEmails: parseAllowedEmails(os.Getenv("AUTH_ALLOWED_EMAILS")),
	}

	r := newRouter(srv, vervent)

	addr := env("ADDR", ":8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, r))
}

// startSession sets the session cookie for a user the sign-in flow (oidc.go) has admitted.
func (s *server) startSession(w http.ResponseWriter, user User) error {
	value, err := s.sign(session{User: user, Expires: time.Now().Add(sessionTTL).Unix()})
	if err != nil {
		return err
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
	return nil
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
