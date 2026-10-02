// Camber Credit 2026-1 pool dashboard API.
// Serves aggregated views of the camber_credit schema (see ../../sql) and,
// when ../web/dist exists, the built dashboard.
package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/user"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const asofDate = "2026-08-31"

type summary struct {
	TotalLeases  int     `json:"totalLeases"`
	Active       int     `json:"active"`
	Inventory    int     `json:"inventory"`
	Sold         int     `json:"sold"`
	PVTotal      float64 `json:"pvTotal"`
	PVEligible   float64 `json:"pvEligible"`
	Collections  float64 `json:"collections"`
	Proceeds     float64 `json:"proceeds"`
	Delinquent30 int     `json:"delinquent30"`
}

type statusRow struct {
	Code  int     `json:"code"`
	Name  string  `json:"name"`
	Count int     `json:"count"`
	PV    float64 `json:"pv"`
}

type bucketRow struct {
	Bucket string  `json:"bucket"`
	Count  int     `json:"count"`
	PV     float64 `json:"pv"`
}

type monthRow struct {
	Month    string  `json:"month"`
	Count    int     `json:"count"`
	Proceeds float64 `json:"proceeds"`
}

type typeRow struct {
	Type     string  `json:"type"`
	Count    int     `json:"count"`
	Proceeds float64 `json:"proceeds"`
}

type quarterRow struct {
	Quarter string  `json:"quarter"`
	Count   int     `json:"count"`
	PV      float64 `json:"pv"`
}

type yearRow struct {
	Year  int     `json:"year"`
	Count int     `json:"count"`
	PV    float64 `json:"pv"`
}

type dashboard struct {
	AsOf                string       `json:"asOf"`
	Summary             summary      `json:"summary"`
	Status              []statusRow  `json:"status"`
	Delinquency         []bucketRow  `json:"delinquency"`
	TerminationsByMonth []monthRow   `json:"terminationsByMonth"`
	TerminationsByType  []typeRow    `json:"terminationsByType"`
	Runoff              []quarterRow `json:"runoff"`
	ModelYears          []yearRow    `json:"modelYears"`
}

type leaseRow struct {
	LeaseID        int64    `json:"leaseId"`
	VIN            string   `json:"vin"`
	ModelYear      int      `json:"modelYear"`
	Description    string   `json:"description"`
	StatusCode     int      `json:"statusCode"`
	StatusName     string   `json:"statusName"`
	ObligorType    string   `json:"obligorType"`
	NewUsed        string   `json:"newUsed"`
	DaysDelinquent int      `json:"daysDelinquent"`
	MaturityDate   string   `json:"maturityDate"`
	PaymentRegular float64  `json:"paymentRegular"`
	PV             *float64 `json:"pv"`
	IsEligible     bool     `json:"isEligible"`
}

type leaseList struct {
	Total   int        `json:"total"`
	PVTotal float64    `json:"pvTotal"`
	Offset  int        `json:"offset"`
	Limit   int        `json:"limit"`
	Rows    []leaseRow `json:"rows"`
}

type leaseDetail struct {
	LeaseID                int64    `json:"leaseId"`
	VIN                    string   `json:"vin"`
	NewUsed                string   `json:"newUsed"`
	OpenClosed             string   `json:"openClosed"`
	ObligorType            string   `json:"obligorType"`
	IsExtended             bool     `json:"isExtended"`
	TermMonths             int      `json:"termMonths"`
	LeaseDate              string   `json:"leaseDate"`
	MaturityDate           string   `json:"maturityDate"`
	OrigCost               float64  `json:"origCost"`
	ContractResidual       float64  `json:"contractResidual"`
	PaymentRegular         float64  `json:"paymentRegular"`
	ALGModel               string   `json:"algModel"`
	LeaseDCF               float64  `json:"leaseDcf"`
	ModelYear              int      `json:"modelYear"`
	Description            string   `json:"description"`
	FuelType               string   `json:"fuelType"`
	StatusCode             *int     `json:"statusCode"`
	StatusName             *string  `json:"statusName"`
	TerminationType        *string  `json:"terminationType"`
	TerminationTiming      *string  `json:"terminationTiming"`
	SoldMonth              *string  `json:"soldMonth"`
	NetSalesProceeds       *float64 `json:"netSalesProceeds"`
	PeriodPaymentCollected *float64 `json:"periodPaymentCollected"`
	DaysDelinquent         *int     `json:"daysDelinquent"`
	PaymentsRemaining      *int     `json:"paymentsRemaining"`
	IsEligible             *bool    `json:"isEligible"`
	DiscountRate           *float64 `json:"discountRate"`
	PVTotal                *float64 `json:"pvTotal"`
	PVContractResidual     *float64 `json:"pvContractResidual"`
	PVEligible             *float64 `json:"pvEligible"`
	PVTotalPrior           *float64 `json:"pvTotalPrior"`
}

type server struct {
	db       *pgxpool.Pool
	username string
	password string

	mu       sync.Mutex
	sessions map[string]bool
}

const sessionCookie = "camber_session"

func newToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (sv *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	userOK := subtle.ConstantTimeCompare([]byte(strings.ToLower(creds.Username)), []byte(strings.ToLower(sv.username))) == 1
	passOK := subtle.ConstantTimeCompare([]byte(creds.Password), []byte(sv.password)) == 1
	if !userOK || !passOK {
		http.Error(w, `{"error":"wrong username or password"}`, http.StatusUnauthorized)
		return
	}
	token := newToken()
	sv.mu.Lock()
	sv.sessions[token] = true
	sv.mu.Unlock()
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

func (sv *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		sv.mu.Lock()
		delete(sv.sessions, c.Value)
		sv.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
	w.WriteHeader(http.StatusNoContent)
}

func (sv *server) authed(r *http.Request) bool {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	sv.mu.Lock()
	defer sv.mu.Unlock()
	return sv.sessions[c.Value]
}

func (sv *server) handleMe(w http.ResponseWriter, r *http.Request) {
	if !sv.authed(r) {
		http.Error(w, `{"error":"not signed in"}`, http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
}

func (sv *server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !sv.authed(r) {
			http.Error(w, `{"error":"not signed in"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// filterClause builds the WHERE tail shared by every query from the
// whitelisted query params. Values are passed as bind parameters.
func filterClause(r *http.Request) (string, []any) {
	clause := fmt.Sprintf("s.asof_date = DATE '%s'", asofDate)
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		clause += fmt.Sprintf(" AND %s $%d", cond, len(args))
	}
	if v := r.URL.Query().Get("obligor"); v == "B" || v == "P" {
		add("l.obligor_type =", v)
	}
	if v := r.URL.Query().Get("condition"); v == "N" || v == "U" {
		add("l.new_used =", v)
	}
	if r.URL.Query().Get("eligible") == "1" {
		clause += " AND s.is_eligible_collateral"
	}
	return clause, args
}

const fromBase = `
FROM camber_credit.leases l
JOIN camber_credit.lease_snapshots s ON s.lease_id = l.lease_id
JOIN camber_credit.vehicles v ON v.vin = l.vin
LEFT JOIN camber_credit.lease_valuations pv ON pv.lease_id = l.lease_id AND pv.asof_date = s.asof_date
WHERE `

func (sv *server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	where, args := filterClause(r)
	d := dashboard{AsOf: asofDate}

	err := sv.db.QueryRow(ctx, `
SELECT count(*),
       count(*) FILTER (WHERE s.status_code = 0),
       count(*) FILTER (WHERE s.status_code = 1),
       count(*) FILTER (WHERE s.status_code = 2),
       COALESCE(sum(pv.pv_total), 0),
       COALESCE(sum(pv.pv_eligible_collateral), 0),
       COALESCE(sum(s.period_payment_collected), 0),
       COALESCE(sum(s.net_sales_proceeds), 0),
       count(*) FILTER (WHERE s.status_code = 0 AND s.days_delinquent > 30)
`+fromBase+where, args...).Scan(
		&d.Summary.TotalLeases, &d.Summary.Active, &d.Summary.Inventory,
		&d.Summary.Sold, &d.Summary.PVTotal, &d.Summary.PVEligible,
		&d.Summary.Collections, &d.Summary.Proceeds, &d.Summary.Delinquent30)
	if err != nil {
		httpError(w, err)
		return
	}

	// Status composition
	rows, err := sv.db.Query(ctx, `
SELECT s.status_code,
       (SELECT name FROM camber_credit.lease_status_types t WHERE t.status_code = s.status_code),
       count(*), COALESCE(sum(pv.pv_total), 0)
`+fromBase+where+`
GROUP BY s.status_code ORDER BY s.status_code`, args...)
	if err == nil {
		for rows.Next() {
			var x statusRow
			if err = rows.Scan(&x.Code, &x.Name, &x.Count, &x.PV); err != nil {
				break
			}
			d.Status = append(d.Status, x)
		}
		rows.Close()
	}
	if err != nil {
		httpError(w, err)
		return
	}

	// Delinquency buckets, active leases only
	rows, err = sv.db.Query(ctx, `
SELECT bucket, count(*), COALESCE(sum(pv_total), 0) FROM (
  SELECT CASE
           WHEN s.days_delinquent = 0 THEN 'Current'
           WHEN s.days_delinquent <= 30 THEN '1–30 days'
           WHEN s.days_delinquent <= 60 THEN '31–60 days'
           WHEN s.days_delinquent <= 90 THEN '61–90 days'
           ELSE '90+ days'
         END AS bucket,
         CASE
           WHEN s.days_delinquent = 0 THEN 0
           WHEN s.days_delinquent <= 30 THEN 1
           WHEN s.days_delinquent <= 60 THEN 2
           WHEN s.days_delinquent <= 90 THEN 3
           ELSE 4
         END AS ord,
         pv.pv_total
  `+fromBase+where+` AND s.status_code = 0
) b GROUP BY bucket, ord ORDER BY ord`, args...)
	if err == nil {
		for rows.Next() {
			var x bucketRow
			if err = rows.Scan(&x.Bucket, &x.Count, &x.PV); err != nil {
				break
			}
			d.Delinquency = append(d.Delinquency, x)
		}
		rows.Close()
	}
	if err != nil {
		httpError(w, err)
		return
	}

	// Vehicle sales by month
	rows, err = sv.db.Query(ctx, `
SELECT s.sold_month, count(*), COALESCE(sum(s.net_sales_proceeds), 0)
`+fromBase+where+` AND s.sold_month IS NOT NULL
GROUP BY s.sold_month ORDER BY s.sold_month`, args...)
	if err == nil {
		for rows.Next() {
			var x monthRow
			if err = rows.Scan(&x.Month, &x.Count, &x.Proceeds); err != nil {
				break
			}
			d.TerminationsByMonth = append(d.TerminationsByMonth, x)
		}
		rows.Close()
	}
	if err != nil {
		httpError(w, err)
		return
	}

	// Termination types
	rows, err = sv.db.Query(ctx, `
SELECT s.termination_type::text, count(*), COALESCE(sum(s.net_sales_proceeds), 0)
`+fromBase+where+` AND s.termination_type IS NOT NULL AND s.status_code <> 0
GROUP BY s.termination_type ORDER BY count(*) DESC`, args...)
	if err == nil {
		for rows.Next() {
			var x typeRow
			if err = rows.Scan(&x.Type, &x.Count, &x.Proceeds); err != nil {
				break
			}
			d.TerminationsByType = append(d.TerminationsByType, x)
		}
		rows.Close()
	}
	if err != nil {
		httpError(w, err)
		return
	}

	// Maturity runoff of active collateral
	rows, err = sv.db.Query(ctx, `
SELECT to_char(l.maturity_date, 'YYYY "Q"Q'), count(*), COALESCE(sum(pv.pv_total), 0)
`+fromBase+where+` AND s.status_code = 0
GROUP BY 1 ORDER BY 1`, args...)
	if err == nil {
		for rows.Next() {
			var x quarterRow
			if err = rows.Scan(&x.Quarter, &x.Count, &x.PV); err != nil {
				break
			}
			d.Runoff = append(d.Runoff, x)
		}
		rows.Close()
	}
	if err != nil {
		httpError(w, err)
		return
	}

	// Model-year mix of active collateral
	rows, err = sv.db.Query(ctx, `
SELECT v.model_year, count(*), COALESCE(sum(pv.pv_total), 0)
`+fromBase+where+` AND s.status_code = 0
GROUP BY v.model_year ORDER BY v.model_year`, args...)
	if err == nil {
		for rows.Next() {
			var x yearRow
			if err = rows.Scan(&x.Year, &x.Count, &x.PV); err != nil {
				break
			}
			d.ModelYears = append(d.ModelYears, x)
		}
		rows.Close()
	}
	if err != nil {
		httpError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

var (
	soldMonthRe = regexp.MustCompile(`^\d{4}-\d{2}$`)
	quarterRe   = regexp.MustCompile(`^\d{4} Q[1-4]$`)
)

var terminationTypes = map[string]bool{
	"Early Payoff":                 true,
	"Purchase Option Exercised":    true,
	"Repossession / Default":       true,
	"Voluntary Return at Maturity": true,
}

var delinquencyBuckets = map[string]string{
	"current": "s.days_delinquent = 0",
	"1-30":    "s.days_delinquent BETWEEN 1 AND 30",
	"31-60":   "s.days_delinquent BETWEEN 31 AND 60",
	"61-90":   "s.days_delinquent BETWEEN 61 AND 90",
	"90+":     "s.days_delinquent > 90",
}

var leaseSortCols = map[string]string{
	"id":         "l.lease_id",
	"pv":         "pv.pv_total",
	"delinquent": "s.days_delinquent",
	"maturity":   "l.maturity_date",
	"payment":    "l.payment_regular",
}

// leaseFilterClause extends the dashboard filters with the drill-down
// parameters used when a chart segment is opened as a lease list. Every
// parameter is whitelisted; values travel as bind parameters.
func leaseFilterClause(r *http.Request) (string, []any) {
	clause, args := filterClause(r)
	q := r.URL.Query()
	add := func(cond string, v any) {
		args = append(args, v)
		clause += fmt.Sprintf(" AND %s $%d", cond, len(args))
	}
	if v := q.Get("status"); v == "0" || v == "1" || v == "2" {
		add("s.status_code =", v)
	}
	if cond, ok := delinquencyBuckets[q.Get("bucket")]; ok {
		clause += " AND " + cond
	}
	if v := q.Get("soldMonth"); soldMonthRe.MatchString(v) {
		add("s.sold_month =", v)
	}
	if v := q.Get("termination"); terminationTypes[v] {
		clause += " AND s.status_code <> 0"
		args = append(args, v)
		clause += fmt.Sprintf(" AND s.termination_type = $%d::camber_credit.lease_termination_type", len(args))
	}
	if v := q.Get("maturityQuarter"); quarterRe.MatchString(v) {
		add(`to_char(l.maturity_date, 'YYYY "Q"Q') =`, v)
	}
	if v := q.Get("modelYear"); v != "" {
		if y, err := strconv.Atoi(v); err == nil && y > 1980 && y < 2100 {
			add("v.model_year =", y)
		}
	}
	if v := q.Get("modelYearMax"); v != "" {
		if y, err := strconv.Atoi(v); err == nil && y > 1980 && y < 2100 {
			add("v.model_year <=", y)
		}
	}
	return clause, args
}

func (sv *server) handleLeases(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	q := r.URL.Query()
	where, args := leaseFilterClause(r)

	sortCol, ok := leaseSortCols[q.Get("sort")]
	if !ok {
		sortCol = "pv.pv_total"
	}
	dir := "DESC"
	if q.Get("dir") == "asc" {
		dir = "ASC"
	}
	limit := 50
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v >= 1 && v <= 200 {
		limit = v
	}
	offset := 0
	if v, err := strconv.Atoi(q.Get("offset")); err == nil && v >= 0 {
		offset = v
	}

	out := leaseList{Offset: offset, Limit: limit, Rows: []leaseRow{}}
	err := sv.db.QueryRow(ctx,
		`SELECT count(*), COALESCE(sum(pv.pv_total), 0) `+fromBase+where, args...,
	).Scan(&out.Total, &out.PVTotal)
	if err != nil {
		httpError(w, err)
		return
	}

	listArgs := append(args, limit, offset)
	rows, err := sv.db.Query(ctx, fmt.Sprintf(`
SELECT l.lease_id, v.vin, v.model_year, v.description,
       s.status_code,
       (SELECT name FROM camber_credit.lease_status_types t WHERE t.status_code = s.status_code),
       l.obligor_type, l.new_used, s.days_delinquent,
       to_char(l.maturity_date, 'YYYY-MM-DD'), l.payment_regular,
       pv.pv_total, s.is_eligible_collateral
%s%s
ORDER BY %s %s NULLS LAST, l.lease_id
LIMIT $%d OFFSET $%d`, fromBase, where, sortCol, dir, len(listArgs)-1, len(listArgs)), listArgs...)
	if err != nil {
		httpError(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var x leaseRow
		if err := rows.Scan(&x.LeaseID, &x.VIN, &x.ModelYear, &x.Description,
			&x.StatusCode, &x.StatusName, &x.ObligorType, &x.NewUsed,
			&x.DaysDelinquent, &x.MaturityDate, &x.PaymentRegular,
			&x.PV, &x.IsEligible); err != nil {
			httpError(w, err)
			return
		}
		out.Rows = append(out.Rows, x)
	}
	if err := rows.Err(); err != nil {
		httpError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (sv *server) handleLease(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, `{"error":"bad lease id"}`, http.StatusBadRequest)
		return
	}
	var d leaseDetail
	err = sv.db.QueryRow(ctx, `
SELECT l.lease_id, l.vin, l.new_used, l.open_closed, l.obligor_type, l.is_extended,
       l.lease_term_months, to_char(l.lease_date, 'YYYY-MM-DD'),
       to_char(l.maturity_date, 'YYYY-MM-DD'), l.orig_cost,
       l.contract_residual_value, l.payment_regular, l.alg_model_used, l.lease_dcf,
       v.model_year, v.description, v.fuel_type::text,
       s.status_code,
       (SELECT name FROM camber_credit.lease_status_types t WHERE t.status_code = s.status_code),
       s.termination_type::text, s.termination_timing_category::text,
       s.sold_month, s.net_sales_proceeds, s.period_payment_collected,
       s.days_delinquent, s.payments_remaining, s.is_eligible_collateral,
       pv1.discount_rate, pv1.pv_total, pv1.pv_contract_residual, pv1.pv_eligible_collateral,
       pv0.pv_total
FROM camber_credit.leases l
JOIN camber_credit.vehicles v ON v.vin = l.vin
LEFT JOIN camber_credit.lease_snapshots s ON s.lease_id = l.lease_id AND s.asof_date = DATE '`+asofDate+`'
LEFT JOIN camber_credit.lease_valuations pv1 ON pv1.lease_id = l.lease_id AND pv1.asof_date = DATE '`+asofDate+`'
LEFT JOIN camber_credit.lease_valuations pv0 ON pv0.lease_id = l.lease_id AND pv0.asof_date = DATE '2025-10-31'
WHERE l.lease_id = $1`, id).Scan(
		&d.LeaseID, &d.VIN, &d.NewUsed, &d.OpenClosed, &d.ObligorType, &d.IsExtended,
		&d.TermMonths, &d.LeaseDate, &d.MaturityDate, &d.OrigCost,
		&d.ContractResidual, &d.PaymentRegular, &d.ALGModel, &d.LeaseDCF,
		&d.ModelYear, &d.Description, &d.FuelType,
		&d.StatusCode, &d.StatusName, &d.TerminationType, &d.TerminationTiming,
		&d.SoldMonth, &d.NetSalesProceeds, &d.PeriodPaymentCollected,
		&d.DaysDelinquent, &d.PaymentsRemaining, &d.IsEligible,
		&d.DiscountRate, &d.PVTotal, &d.PVContractResidual, &d.PVEligible,
		&d.PVTotalPrior)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"lease not found"}`, http.StatusNotFound)
			return
		}
		httpError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

func httpError(w http.ResponseWriter, err error) {
	log.Printf("query error: %v", err)
	http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
}

func defaultDSN() string {
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		return dsn
	}
	u, _ := user.Current()
	name := "postgres"
	if u != nil {
		name = u.Username
	}
	return fmt.Sprintf("postgres://%s@localhost:5432/camber", name)
}

func main() {
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	db, err := pgxpool.New(context.Background(), defaultDSN())
	if err != nil {
		log.Fatalf("db config: %v", err)
	}
	if err := db.Ping(context.Background()); err != nil {
		log.Fatalf("db ping: %v", err)
	}
	username := os.Getenv("DASH_USER")
	if username == "" {
		username = "russell"
	}
	password := os.Getenv("DASH_PASS")
	if password == "" {
		password = "camber2026"
	}
	sv := &server{db: db, username: username, password: password, sessions: map[string]bool{}}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/login", sv.handleLogin)
	mux.HandleFunc("POST /api/logout", sv.handleLogout)
	mux.HandleFunc("GET /api/me", sv.handleMe)
	mux.HandleFunc("GET /api/dashboard", sv.requireAuth(sv.handleDashboard))
	mux.HandleFunc("GET /api/leases", sv.requireAuth(sv.handleLeases))
	mux.HandleFunc("GET /api/leases/{id}", sv.requireAuth(sv.handleLease))
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})
	if st, err := os.Stat("../web/dist"); err == nil && st.IsDir() {
		mux.Handle("GET /", http.FileServer(http.Dir("../web/dist")))
	}

	log.Printf("camber dashboard api on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
