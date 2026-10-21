package main

import (
	"strings"
	"testing"
	"time"
)

func testAuth() *auth {
	return &auth{
		sessionKey:    []byte("0123456789abcdef0123456789abcdef"),
		allowedDomain: "cambercredit.com",
		allowedEmails: map[string]bool{"ops@inmatics.io": true},
	}
}

func TestSessionRoundTrip(t *testing.T) {
	a := testAuth()
	now := time.Now()
	v := a.signSession(session{Email: "brad@cambercredit.com", Name: "Brad", Exp: now.Add(time.Hour).Unix()})
	s, ok := a.verifySession(v, now)
	if !ok || s.Email != "brad@cambercredit.com" || s.Name != "Brad" {
		t.Fatalf("round trip failed: ok=%v s=%+v", ok, s)
	}
	if _, ok := a.verifySession(v, now.Add(2*time.Hour)); ok {
		t.Fatal("expired session accepted")
	}
}

func TestSessionTamper(t *testing.T) {
	a := testAuth()
	v := a.signSession(session{Email: "brad@cambercredit.com", Exp: time.Now().Add(time.Hour).Unix()})
	body, sig, _ := strings.Cut(v, ".")
	other := &auth{sessionKey: []byte("ffffffffffffffffffffffffffffffff")}
	forged := other.signSession(session{Email: "evil@gmail.com", Exp: time.Now().Add(time.Hour).Unix()})
	forgedBody, _, _ := strings.Cut(forged, ".")
	for _, bad := range []string{"", "x", body, body + ".", forgedBody + "." + sig, forged} {
		if _, ok := a.verifySession(bad, time.Now()); ok {
			t.Errorf("accepted tampered value %q", bad)
		}
	}
}

func TestAllowed(t *testing.T) {
	a := testAuth()
	cases := []struct {
		email, hd string
		verified  bool
		want      bool
	}{
		{"brad@cambercredit.com", "cambercredit.com", true, true},
		{"Brad@CamberCredit.com", "cambercredit.com", true, true},
		{"brad@cambercredit.com", "cambercredit.com", false, false}, // unverified
		{"brad@cambercredit.com", "", true, false},                  // consumer account claiming the domain
		{"someone@gmail.com", "", true, false},
		{"someone@gmail.com", "cambercredit.com", true, false}, // hd without matching email
		{"ops@inmatics.io", "inmatics.io", true, true},         // explicit allowlist
		{"other@inmatics.io", "inmatics.io", true, false},
	}
	for _, c := range cases {
		if got := a.allowed(c.email, c.hd, c.verified); got != c.want {
			t.Errorf("allowed(%q,%q,%v)=%v want %v", c.email, c.hd, c.verified, got, c.want)
		}
	}
}
