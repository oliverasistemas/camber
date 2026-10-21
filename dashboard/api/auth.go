// Google sign-in for the dashboard.
//
// Server-side OpenID Connect authorization-code flow with PKCE: the SPA sends
// the browser to /api/auth/google, Google sends it back to
// /api/auth/google/callback, and the API checks the ID token before issuing
// a session. Only verified accounts on AUTH_ALLOWED_DOMAIN (a Google
// Workspace domain, matched against the token's "hd" claim) get in, plus any
// addresses in AUTH_ALLOWED_EMAILS.
//
// Sessions are stateless: an HMAC-signed cookie carrying the signed-in email,
// display name and expiry. Restarting the API does not sign anyone out;
// rotating SESSION_SECRET does.
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const (
	sessionCookie = "camber_session"
	oauthCookie   = "camber_oauth"
	sessionTTL    = 24 * time.Hour
	oauthTTL      = 10 * time.Minute
	callbackPath  = "/api/auth/google/callback"
)

type auth struct {
	oauth         *oauth2.Config
	verifier      *oidc.IDTokenVerifier
	sessionKey    []byte
	allowedDomain string
	allowedEmails map[string]bool
	secure        bool // PUBLIC_URL is https → cookies carry Secure
}

// authFromEnv reads the auth configuration and performs OIDC discovery
// against Google. It is fatal to run without a client ID and secret.
func authFromEnv(ctx context.Context) (*auth, error) {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return nil, errors.New("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set")
	}
	publicURL := strings.TrimRight(os.Getenv("PUBLIC_URL"), "/")
	if publicURL == "" {
		publicURL = "http://localhost:5173"
	}
	domain := strings.ToLower(os.Getenv("AUTH_ALLOWED_DOMAIN"))
	if domain == "" {
		domain = "cambercredit.com"
	}
	emails := map[string]bool{}
	for _, e := range strings.Split(os.Getenv("AUTH_ALLOWED_EMAILS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			emails[e] = true
		}
	}
	key, err := hex.DecodeString(os.Getenv("SESSION_SECRET"))
	if err != nil || len(key) < 32 {
		if os.Getenv("SESSION_SECRET") != "" {
			return nil, errors.New("SESSION_SECRET must be at least 32 bytes, hex encoded")
		}
		key = make([]byte, 32)
		rand.Read(key)
		log.Printf("SESSION_SECRET unset — using a random key; restarting signs everyone out")
	}

	provider, err := oidc.NewProvider(ctx, "https://accounts.google.com")
	if err != nil {
		return nil, fmt.Errorf("google oidc discovery: %w", err)
	}
	return &auth{
		oauth: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  publicURL + callbackPath,
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
		verifier:      provider.Verifier(&oidc.Config{ClientID: clientID}),
		sessionKey:    key,
		allowedDomain: domain,
		allowedEmails: emails,
		secure:        strings.HasPrefix(publicURL, "https://"),
	}, nil
}

// allowed decides whether a Google account may use the dashboard. The "hd"
// claim is what proves Workspace membership; the email suffix is checked too
// so a mismatch between the two can never slip through.
func (a *auth) allowed(email, hd string, verified bool) bool {
	if !verified {
		return false
	}
	email = strings.ToLower(email)
	if a.allowedEmails[email] {
		return true
	}
	return a.allowedDomain != "" &&
		strings.EqualFold(hd, a.allowedDomain) &&
		strings.HasSuffix(email, "@"+a.allowedDomain)
}

// ---- session cookie -------------------------------------------------------

type session struct {
	Email string `json:"e"`
	Name  string `json:"n"`
	Exp   int64  `json:"x"` // unix seconds
}

func (a *auth) sign(payload []byte) string {
	mac := hmac.New(sha256.New, a.sessionKey)
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." +
		base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (a *auth) open(value string) ([]byte, bool) {
	body, sig, ok := strings.Cut(value, ".")
	if !ok {
		return nil, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return nil, false
	}
	want, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return nil, false
	}
	mac := hmac.New(sha256.New, a.sessionKey)
	mac.Write(payload)
	if !hmac.Equal(mac.Sum(nil), want) {
		return nil, false
	}
	return payload, true
}

func (a *auth) signSession(s session) string {
	b, _ := json.Marshal(s)
	return a.sign(b)
}

func (a *auth) verifySession(value string, now time.Time) (session, bool) {
	payload, ok := a.open(value)
	if !ok {
		return session{}, false
	}
	var s session
	if json.Unmarshal(payload, &s) != nil || s.Email == "" || now.Unix() >= s.Exp {
		return session{}, false
	}
	return s, true
}

func (a *auth) setSession(w http.ResponseWriter, email, name string) {
	s := session{Email: email, Name: name, Exp: time.Now().Add(sessionTTL).Unix()}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    a.signSession(s),
		Path:     "/",
		MaxAge:   int(sessionTTL / time.Second),
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (a *auth) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode})
}

// current returns the signed-in session for the request, if any.
func (a *auth) current(r *http.Request) (session, bool) {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return session{}, false
	}
	return a.verifySession(c.Value, time.Now())
}

// ---- handlers -------------------------------------------------------------

// oauthState is what the browser carries across the round trip to Google,
// signed so the callback can trust it.
type oauthState struct {
	State    string `json:"s"`
	Verifier string `json:"v"` // PKCE code verifier
	Nonce    string `json:"o"`
	Next     string `json:"n"` // SPA hash to land on, "#/..." or ""
	Exp      int64  `json:"x"`
}

func randomToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// handleStart sends the browser to Google.
func (a *auth) handleStart(w http.ResponseWriter, r *http.Request) {
	next := r.URL.Query().Get("next")
	if !strings.HasPrefix(next, "#/") || strings.ContainsAny(next, "\r\n") {
		next = ""
	}
	st := oauthState{
		State:    randomToken(),
		Verifier: oauth2.GenerateVerifier(),
		Nonce:    randomToken(),
		Next:     next,
		Exp:      time.Now().Add(oauthTTL).Unix(),
	}
	b, _ := json.Marshal(st)
	http.SetCookie(w, &http.Cookie{
		Name:     oauthCookie,
		Value:    a.sign(b),
		Path:     "/",
		MaxAge:   int(oauthTTL / time.Second),
		HttpOnly: true,
		Secure:   a.secure,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, a.oauth.AuthCodeURL(st.State,
		oauth2.S256ChallengeOption(st.Verifier),
		oauth2.SetAuthURLParam("nonce", st.Nonce),
		oauth2.SetAuthURLParam("hd", a.allowedDomain), // account-chooser hint only; the claim is what's checked
	), http.StatusFound)
}

// handleCallback finishes the round trip. Failures never leak detail to the
// browser: they log and bounce to the login card with a short reason code.
func (a *auth) handleCallback(w http.ResponseWriter, r *http.Request) {
	fail := func(reason string, err error) {
		log.Printf("google sign-in failed (%s): %v", reason, err)
		a.clearCookie(w, oauthCookie)
		http.Redirect(w, r, "/?auth="+reason, http.StatusFound)
	}

	c, err := r.Cookie(oauthCookie)
	if err != nil {
		fail("state", errors.New("missing oauth cookie"))
		return
	}
	payload, ok := a.open(c.Value)
	var st oauthState
	if !ok || json.Unmarshal(payload, &st) != nil || time.Now().Unix() >= st.Exp {
		fail("state", errors.New("bad or expired oauth cookie"))
		return
	}
	q := r.URL.Query()
	if q.Get("state") == "" || q.Get("state") != st.State {
		fail("state", errors.New("state mismatch"))
		return
	}
	if e := q.Get("error"); e != "" {
		fail("google", fmt.Errorf("google returned %q", e))
		return
	}

	tok, err := a.oauth.Exchange(r.Context(), q.Get("code"), oauth2.VerifierOption(st.Verifier))
	if err != nil {
		fail("exchange", err)
		return
	}
	raw, _ := tok.Extra("id_token").(string)
	if raw == "" {
		fail("token", errors.New("no id_token in response"))
		return
	}
	idt, err := a.verifier.Verify(r.Context(), raw)
	if err != nil {
		fail("token", err)
		return
	}
	if idt.Nonce != st.Nonce {
		fail("token", errors.New("nonce mismatch"))
		return
	}
	var claims struct {
		Email    string `json:"email"`
		Verified bool   `json:"email_verified"`
		HD       string `json:"hd"`
		Name     string `json:"name"`
	}
	if err := idt.Claims(&claims); err != nil {
		fail("token", err)
		return
	}
	if !a.allowed(claims.Email, claims.HD, claims.Verified) {
		fail("domain", fmt.Errorf("%s (hd=%q verified=%v) is not allowed", claims.Email, claims.HD, claims.Verified))
		return
	}

	a.clearCookie(w, oauthCookie)
	a.setSession(w, strings.ToLower(claims.Email), claims.Name)
	log.Printf("signed in: %s", claims.Email)
	http.Redirect(w, r, "/"+st.Next, http.StatusFound)
}

func (a *auth) handleLogout(w http.ResponseWriter, r *http.Request) {
	a.clearCookie(w, sessionCookie)
	w.WriteHeader(http.StatusNoContent)
}

func (a *auth) handleMe(w http.ResponseWriter, r *http.Request) {
	s, ok := a.current(r)
	if !ok {
		http.Error(w, `{"error":"not signed in"}`, http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"email": s.Email, "name": s.Name})
}

func (a *auth) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := a.current(r); !ok {
			http.Error(w, `{"error":"not signed in"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}
