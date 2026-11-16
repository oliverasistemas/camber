-- vervent_transactions: DDL generated from TransactionHistory daily extract headers (46 source columns).
-- Source: /Users/ao/pipeline/vervent/YYYYMMDD_TransactionHistory_Daily_P50.csv (pipe-delimited, header row).

CREATE TABLE IF NOT EXISTS vervent_transactions (
    transaction_key             bigint NOT NULL,
    portfolio                   integer,
    report_key                  text,
    transaction_date_key        date,
    effective_date_key          date,
    date_due_date_key           date,
    is_payoff                   boolean,
    is_non_cash                 boolean,
    is_past_due                 boolean,
    is_cash_report_transaction  boolean,
    contract_number             text,
    name                        text,
    description                 text,
    trans                       integer,
    bank_cd                     integer,
    debit_vector                integer,
    credit_vector               integer,
    check_no                    text,
    posted_date                 date,
    invoice_due_date            date,
    transaction_amount          numeric(18,2),
    payment                     numeric(18,2),
    prepayment                  numeric(18,2),
    payoff                      numeric(18,2),
    inventory_sale              numeric(18,2),
    paydown                     numeric(18,2),
    property_tax                numeric(18,2),
    sales_tax                   numeric(18,2),
    late_charge                 numeric(18,2),
    collection_fee              numeric(18,2),
    assumption_fee              numeric(18,2),
    legal_fee                   numeric(18,2),
    pmt_extension               numeric(18,2),
    lse_extension               numeric(18,2),
    itc_fees                    numeric(18,2),
    fhut                        numeric(18,2),
    idr                         numeric(18,2),
    lease_rewrite               numeric(18,2),
    other_fees                  numeric(18,2),
    security_deposit            numeric(18,2),
    suspense                    numeric(18,2),
    rcr1                        numeric(18,2),
    rcr2                        numeric(18,2),
    rcr3                        numeric(18,2),
    payment_amount              numeric(18,2),
    oper_inits                  text,
    source_file                 text NOT NULL,
    file_date                   date NOT NULL,
    loaded_at                   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_vervent_transactions PRIMARY KEY (transaction_key)
);

CREATE INDEX IF NOT EXISTS ix_vervent_transactions_contract_number ON vervent_transactions (contract_number);
CREATE INDEX IF NOT EXISTS ix_vervent_transactions_transaction_date_key ON vervent_transactions (transaction_date_key);

COMMENT ON TABLE vervent_transactions IS 'Vervent portfolio 50 posted transactions. Append-only, loaded daily from *_TransactionHistory_Daily_P50.csv.';

COMMENT ON COLUMN vervent_transactions.transaction_key IS '[TransactionKey] Surrogate key for the transaction. Unique; primary key of this file.';
COMMENT ON COLUMN vervent_transactions.portfolio IS '[Portfolio] Portfolio code. Always 50.';
COMMENT ON COLUMN vervent_transactions.report_key IS '[REPORTKEY] Concatenated "PORT COMP REG OFF" key (e.g. "50 1 1 100", "50 1 1 DEF").';
COMMENT ON COLUMN vervent_transactions.transaction_date_key IS '[TransactionDateKey] Transaction (posting) date, YYYYMMDD. Single day in this daily file (20261110). Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_transactions.effective_date_key IS '[EffectiveDateKey] Effective date of the transaction, YYYYMMDD. Blank for system accruals. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_transactions.date_due_date_key IS '[DateDueDateKey] Due date of the invoice the transaction applies to, YYYYMMDD. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_transactions.is_payoff IS '[IsPayoff] 1 = transaction is part of a payoff.';
COMMENT ON COLUMN vervent_transactions.is_non_cash IS '[IsNonCash] 1 = non-cash transaction (accruals, assessments, waivers, reversals).';
COMMENT ON COLUMN vervent_transactions.is_past_due IS '[IsPastDue] 1 = applied to a past-due invoice.';
COMMENT ON COLUMN vervent_transactions.is_cash_report_transaction IS '[IsCashReportTransaction] 1 = included in cash receipts reporting.';
COMMENT ON COLUMN vervent_transactions.contract_number IS '[CONTRACTNUMBER] Contract number. Join key to ContractSummary.[LEASE NO]. Blank on 2 rows.';
COMMENT ON COLUMN vervent_transactions.name IS '[NAME] Lessee / customer name.';
COMMENT ON COLUMN vervent_transactions.description IS '[DESCRIPTION] Transaction type description (paired 1:1 with TRANS).';
COMMENT ON COLUMN vervent_transactions.trans IS '[TRANS] Transaction code. Families: 1xx = booking (100 new lease, 130 inventory asset); 2xx = payments (200 normal, 202 partial, 220 late charge, 226 property tax, 242 use tax, 248 prepayment, 22xx lease-fee payments); 26xx = lease-fee assessments; 3xx = accruals (301 accrual, 351 accrual reversal); 4xx = payment reversals; 500 = early payoff; 6xx = assessments/waivers (600 late charge, 601 collection charge, 603 property tax, 651 coll. charge waiver); 900/901 = suspense credit/debit. Right-padded with a space.';
COMMENT ON COLUMN vervent_transactions.bank_cd IS '[BANKCD] Bank/deposit account code for cash transactions (125, 129, 131, 137, 141). Blank for non-cash.';
COMMENT ON COLUMN vervent_transactions.debit_vector IS '[DEBIT VECTOR] GL debit vector (account mapping code).';
COMMENT ON COLUMN vervent_transactions.credit_vector IS '[CREDIT VECTOR] GL credit vector (account mapping code).';
COMMENT ON COLUMN vervent_transactions.check_no IS '[CHECKNO] Check/reference number (numeric, or text such as "WEBACH" for web ACH).';
COMMENT ON COLUMN vervent_transactions.posted_date IS '[POSTEDDATE] Posting date (MM/DD/YYYY). Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_transactions.invoice_due_date IS '[INVOICEDUEDATE] Due date of the invoice paid (MM/DD/YYYY). Same as DateDueDateKey. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_transactions.transaction_amount IS '[TRANSACTIONAMOUNT] Absolute transaction amount, USD (always positive).';
COMMENT ON COLUMN vervent_transactions.payment IS '[PAYMENT] Portion applied to regular rent/payment, USD (negative on reversals).';
COMMENT ON COLUMN vervent_transactions.prepayment IS '[PREPAYMENT] Portion applied as prepayment, USD.';
COMMENT ON COLUMN vervent_transactions.payoff IS '[PAYOFF] Portion applied to payoff, USD.';
COMMENT ON COLUMN vervent_transactions.inventory_sale IS '[INVENTORYSALE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.paydown IS '[PAYDOWN] Portion applied as principal paydown, USD.';
COMMENT ON COLUMN vervent_transactions.property_tax IS '[PROPERTYTAX] Portion applied to property tax, USD.';
COMMENT ON COLUMN vervent_transactions.sales_tax IS '[SALESTAX] Portion applied to sales/use tax, USD.';
COMMENT ON COLUMN vervent_transactions.late_charge IS '[LATECHARGE] Portion applied to late charges, USD.';
COMMENT ON COLUMN vervent_transactions.collection_fee IS '[COLLECTIONFEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.assumption_fee IS '[ASSUMPTIONFEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.legal_fee IS '[LEGALFEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.pmt_extension IS '[PMTEXTENSION] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.lse_extension IS '[LSEEXTENSION] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.itc_fees IS '[ITCFEES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.fhut IS '[FHUT] Federal heavy-use tax. Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.idr IS '[IDR] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.lease_rewrite IS '[LEASEREWRITE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.other_fees IS '[OTHERFEES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.security_deposit IS '[SECURITYDEPOSIT] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.suspense IS '[SUSPENSE] Amount moved into (+, SUSPENSE CR) or out of (-, SUSPENSE DR) unapplied suspense, USD.';
COMMENT ON COLUMN vervent_transactions.rcr1 IS '[RCR1] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.rcr2 IS '[RCR2] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.rcr3 IS '[RCR3] Always 0 in this extract.';
COMMENT ON COLUMN vervent_transactions.payment_amount IS '[PAYMENTAMOUNT] Signed cash amount of the transaction, USD (sum of the component columns); 0 for non-cash.';
COMMENT ON COLUMN vervent_transactions.oper_inits IS '[OPERINITS] Initials/ID of the operator or process that posted the entry (e.g. EOP = end-of-period batch, ZER, SMR, NAN, LPI, JPA, MPO).';
COMMENT ON COLUMN vervent_transactions.source_file IS 'Name of the CSV file the row was loaded from.';
COMMENT ON COLUMN vervent_transactions.file_date IS 'Business date from the file-name prefix (YYYYMMDD_...). On upsert tables, guards against overwriting newer data with an older file.';
COMMENT ON COLUMN vervent_transactions.loaded_at IS 'Timestamp the row was inserted or last updated.';
