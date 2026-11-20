package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Google sign-in: an OAuth 2.0 authorization-code flow with the OpenID Connect scopes, with the
// identity claims read from Google's UserInfo endpoint. Once a user is admitted the app issues its
// own session cookie (main.go) and Google is not consulted again.

const (
	stateCookie = "oauth_state"

	googleUserinfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

	defaultClientSecretFile = "../../client_secret_75992393432-set3hdcgdsftm0pqjoufgribhavhbj5b.apps.googleusercontent.com.json"
)

// newGoogleOAuth builds the OAuth client from the client JSON downloaded from the Google Cloud
// console (GOOGLE_CLIENT_SECRET_FILE).
func newGoogleOAuth() (*oauth2.Config, error) {
	creds, err := os.ReadFile(env("GOOGLE_CLIENT_SECRET_FILE", defaultClientSecretFile))
	if err != nil {
		return nil, fmt.Errorf("reading google client secret: %w", err)
	}
	oauth, err := google.ConfigFromJSON(creds, "openid", "email", "profile")
	if err != nil {
		return nil, fmt.Errorf("parsing google client secret: %w", err)
	}
	// Defaults to going through the Vite dev proxy so cookies are same-origin with the frontend.
	oauth.RedirectURL = env("GOOGLE_REDIRECT_URL", "http://localhost:5173/api/auth/google/callback")
	return oauth, nil
}

// parseAllowedEmails reads the comma-separated AUTH_ALLOWED_EMAILS list.
func parseAllowedEmails(list string) map[string]bool {
	emails := map[string]bool{}
	for _, e := range strings.Split(list, ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			emails[e] = true
		}
	}
	return emails
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

	user, hd, err := s.fetchUser(r, token)
	if err != nil {
		http.Error(w, "failed to fetch user info", http.StatusBadGateway)
		return
	}
	if !s.allowed(user, hd) {
		log.Printf("sign-in refused for %s (hd=%q)", user.Email, hd)
		http.Redirect(w, r, s.frontendURL+"/?error=access_denied", http.StatusFound)
		return
	}

	if err := s.startSession(w, user); err != nil {
		http.Error(w, "failed to create session", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, s.frontendURL, http.StatusFound)
}

// fetchUser also returns the hd (hosted domain) claim, which Google sets only for Workspace
// accounts. It is empty for consumer accounts, including ones registered with a non-Gmail address.
func (s *server) fetchUser(r *http.Request, token *oauth2.Token) (User, string, error) {
	resp, err := s.oauth.Client(r.Context(), token).Get(googleUserinfoURL)
	if err != nil {
		return User{}, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return User{}, "", errors.New("userinfo returned " + resp.Status)
	}
	var info struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		HD            string `json:"hd"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return User{}, "", err
	}
	if !info.EmailVerified {
		return User{}, "", errors.New("email not verified")
	}
	return User{ID: info.Sub, Email: info.Email, Name: info.Name, Picture: info.Picture}, info.HD, nil
}

// allowed admits the addresses in AUTH_ALLOWED_EMAILS and, if AUTH_ALLOWED_DOMAIN is set, only
// Workspace accounts of that domain otherwise: the email suffix alone isn't enough, since anyone
// can register a consumer Google account with an @domain address. fetchUser has already
// required a verified email.
func (s *server) allowed(u User, hd string) bool {
	email := strings.ToLower(u.Email)
	if s.allowedEmails[email] {
		return true
	}
	if s.allowedDomain == "" {
		return true
	}
	return strings.ToLower(hd) == s.allowedDomain && strings.HasSuffix(email, "@"+s.allowedDomain)
}

func randomString() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
