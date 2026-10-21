#!/usr/bin/env python3
"""Generate 01_schema.sql and the load_<report>.sql scripts from one column spec.

The spec below is the single source of truth for how each Vervent CSV column
maps to a Postgres column (name + type + parser). Re-run after editing it:

    python3 sql/generate_schema.py

Column spec entry: (csv_header, column_name, kind[, comment])
  kind: date | bool | big | int | small | num2 | num4 | num | char | text
"""
from __future__ import annotations

import os

HERE = os.path.dirname(os.path.abspath(__file__))

KIND_SQL = {
    "date": "date",
    "bool": "boolean",
    "big": "bigint",
    "int": "integer",
    "small": "smallint",
    "num2": "numeric(14,2)",
    "num4": "numeric(14,4)",
    "num": "numeric",
    "char": "char(1)",
    "text": "text",
}

KIND_PARSE = {
    "date": "vervent.parse_date({c})",
    "bool": "vervent.parse_bool({c})",
    "big": "vervent.parse_num({c})::bigint",
    "int": "vervent.parse_num({c})::integer",
    "small": "vervent.parse_num({c})::smallint",
    "num2": "vervent.parse_num({c})",
    "num4": "vervent.parse_num({c})",
    "num": "vervent.parse_num({c})",
    "char": "vervent.parse_text({c})",
    "text": "vervent.parse_text({c})",
}

# ---------------------------------------------------------------------------
# 20261019_AssetSummary_Daily_P50.csv — one row per asset
# ---------------------------------------------------------------------------
ASSET_SUMMARY = [
    ("STATE", "state", "text", "State where the asset is located"),
    ("COUNTY", "county", "text"),
    ("LEASE", "lease", "text", "Contract number; follow-on contracts carry a letter suffix (e.g. 500069007D = deficiency balance on 5000069007)"),
    ("ASSET_NO", "asset_no", "int", "LeasePak asset number"),
    ("PORT", "port", "small", "Portfolio code (50 = Camber)"),
    ("COMP", "comp", "small", "Company code"),
    ("REG", "reg", "small", "Region code"),
    ("OFF", "off", "text", "Office code (100, DEF = deficiency)"),
    ("NAME", "name", "text", "Customer/obligor name"),
    ("ADDRESS", "address", "text"),
    ("CITY", "city", "text"),
    ("ZIP", "zip", "text"),
    ("TERM", "term", "small", "Lease term in months"),
    ("LS_TYPE", "ls_type", "text", "Lease type code (code_set ls_type)"),
    ("DESCRIPTION", "description", "text", "Booked asset description"),
    ("IN_SVC_DATE", "in_svc_date", "date"),
    ("ACQUIS_DATE", "acquis_date", "date", "Date the asset was funded"),
    ("SOLD DATE", "sold_date", "date", "Asset sale date"),
    ("ORIG_COST", "orig_cost", "num2", "Original equipment cost per asset"),
    ("STATUS", "status", "text", "Asset status code (code_set asset_status)"),
    ("STATUS_DATE", "status_date", "date", "Date of last asset status change"),
    ("DEALER", "dealer", "int", "Dealer (vendor) code"),
    ("DEALER_NAME", "dealer_name", "text"),
    ("CONTR_STATUS", "contr_status", "text", "Contract status code (code_set ls_status)"),
    ("UDF13", "udf13", "text", "Asset UDF13 (dictionary: 'not sure if needed'); carries a list price / MSRP-like amount in the sample"),
    ("TAX TYPE", "tax_type", "text"),
    ("TAX CODE", "tax_code", "text", "Taxing entities in effect (code_set use_tax_code)"),
    ("CLASS", "class", "text", "Equipment class code"),
    ("ORIG_RCVBL", "orig_rcvbl", "num4", "Original receivable"),
    ("RESIDUAL", "residual", "num2", "Total residual value"),
    ("GUARANTEED", "guaranteed", "num2", "Guaranteed portion of the residual"),
    ("LESSEE_NO", "lessee_no", "int", "Lessee number"),
    ("INVENTORY", "inventory", "num2", "Inventoried value"),
    ("ORIG CONTR NO", "orig_contr_no", "text", "Contract UDF7 - original contract number"),
    ("NEW/USED", "new_used", "char", "N = new, U = used"),
    ("RENTAL_INCOME", "rental_income", "num", "Rental income YTD"),
    ("RESI_INCOME", "resi_income", "num", "Residual income YTD"),
    ("INTEREST_INCOME", "interest_income", "num", "Interest income YTD"),
    ("SALE PROCEEDS", "sale_proceeds", "num2", "Proceeds of the asset sale"),
    ("ASSET_AS_SCHED", "asset_as_sched", "num", "Share of the contract's original cost represented by this asset"),
    ("ACCOUNT_PAYABLE", "account_payable", "num2"),
    ("SERIAL NUMBER", "serial_number", "text", "VIN for vehicles; the contract number for deficiency-balance assets"),
    ("TITLE STATE", "title_state", "text"),
    ("TITLE NUMBER", "title_number", "text"),
    ("INV_COMMENT", "inv_comment", "text", "Asset UDF1"),
    ("EHELD_ORIG_CONTR", "eheld_orig_contr", "text", "Asset UDF2 (mislabeled header; holds an amount in the sample)"),
    ("EHELD_CUST_NAME", "eheld_cust_name", "text", "Asset UDF3 (mislabeled header; holds a m/d/yy date string in the sample)"),
    ("EHELD_LESSEE", "eheld_lessee", "text", "Asset UDF4 - equipment model year (mislabeled header)"),
    ("EHELD_RETURN", "eheld_return", "text", "Asset UDF5 - equipment manufacturer / make (mislabeled header)"),
    ("Model", "model", "text"),
    ("TRIM", "trim", "text"),
    ("Fuel Type", "fuel_type", "text"),
    ("Agreed Upon Val Cap", "agreed_upon_val_cap", "text"),
    ("Collateral Code", "collateral_code", "text"),
    ("MFG_VEND Inv No", "mfg_vend_inv_no", "text"),
    ("Curr Addr Validated Y/N", "curr_addr_validated_yn", "bool"),
    ("Curr Addr Validated Date", "curr_addr_validated_date", "date"),
    ("Orig Asset No", "orig_asset_no", "text"),
    ("Orig Lease No", "orig_lease_no", "text"),
    ("Orig Residual", "orig_residual", "text"),
    ("Pre Lease No", "pre_lease_no", "text"),
    ("Prev Commence", "prev_commence", "date"),
    ("Prev Residual", "prev_residual", "text"),
    ("Prev Asset No", "prev_asset_no", "text"),
    ("Curr REPO Status", "curr_repo_status", "text", "Repo status code (code_set repo_code)"),
    ("Curr REPO Status Date", "curr_repo_status_date", "date", "Delivered as YYMMDD"),
    ("SEC_NOTE", "sec_note", "text", "Asset UDF31"),
    ("ALLOW PPT ASSMT", "allow_ppt_assmt", "bool", "Property tax assessed on this asset"),
    ("REPORT PPT", "report_ppt", "bool", "Asset appears on the property tax assessor's report"),
    ("ANNUAL-MONTHLY", "annual_monthly", "text", "Contract UDF33: A = annual, M = manual"),
    ("UPFRONT STAX(Y/N)", "upfront_stax_yn", "bool", "Sales tax charged at lease start"),
    ("Appr Value", "appr_value", "text"),
    ("Appr Date", "appr_date", "date"),
    ("REPO Code", "repo_code", "text", "code_set repo_code"),
    ("REPO Code Date", "repo_code_date", "date"),
    ("ON_HAND", "on_hand", "text", "Asset UDF30"),
    ("ORIG_ASSET_ID", "orig_asset_id", "text", "Asset UDF32 - original asset number"),
    ("ENGINE", "engine", "text", "Asset UDF33"),
    ("MAN_INV_AMT", "man_inv_amt", "text", "Asset UDF34"),
    ("AGREED_VAL_CAP", "agreed_val_cap", "text", "Asset UDF35"),
    ("ORIG_RESID", "orig_resid", "text", "Asset UDF36 - original total residual"),
    ("INVESTOR STATUS", "investor_status", "text"),
]

# ---------------------------------------------------------------------------
# 20261019_Contract Summary_P50.csv — one row per contract
# ---------------------------------------------------------------------------
_UDF_CONTRACT = (
    [("CONTR UDF %d" % i, "contr_udf_%d" % i, "text") for i in range(1, 11)]
    + [("field10_s", "field10_s", "text", "Unlabeled column between CONTR UDF 10 and 11 (Y/N in the sample)")]
    + [("CONTR UDF %d" % i, "contr_udf_%d" % i, "text") for i in range(11, 21)]
    + [("CONTR UDF 20 1", "contr_udf_20_1", "text", "Second column labeled CONTR UDF 20 in the file")]
    + [("CONTR UDF %d" % i, "contr_udf_%d" % i, "text") for i in range(21, 43)]
    + [("CONTR UDF %d" % i, "contr_udf_%d" % i, "text") for i in range(60, 65)]
)

CONTRACT_SUMMARY = [
    ("AccountKey", "account_key", "big"),
    ("CustomerKey", "customer_key", "big"),
    ("AccountGroupKey", "account_group_key", "text"),
    ("AccountClassKey", "account_class_key", "big"),
    ("BookDateKey", "book_date_key", "date"),
    ("LeaseDateKey", "lease_date_key", "date"),
    ("CurrentDateKey", "current_date_key", "date"),
    ("MaturityDateKey", "maturity_date_key", "date"),
    ("PayoffDateKey", "payoff_date_key", "date"),
    ("LastActivityDateKey", "last_activity_date_key", "date"),
    ("CommencementDateKey", "commencement_date_key", "date"),
    ("AccruedThroughDateKey", "accrued_through_date_key", "date"),
    ("NextBillingDateKey", "next_billing_date_key", "date", "Delivered as MM/DD/YYYY despite the Key name"),
    ("ClosedDateKey", "closed_date_key", "date"),
    ("LastBillingDateKey", "last_billing_date_key", "date"),
    ("NextAccrualCutoffDateKey", "next_accrual_cutoff_date_key", "date"),
    ("LastDueDate", "last_due_date_key", "date", "CSV header LastDueDate (YYYYMMDD); _key suffix avoids clashing with LAST PAID DATE style columns"),
    ("LastPaidDate", "last_paid_date_key", "date", "CSV header LastPaidDate (YYYYMMDD); see also last_paid_date"),
    ("NextDueDate", "next_due_date_key", "date", "CSV header NextDueDate (MM/DD/YYYY); see also next_due"),
    ("PORT", "port", "small"),
    ("COMP", "comp", "small"),
    ("REG", "reg", "small"),
    ("OFF", "off", "text"),
    ("LEASE NO", "lease_no", "text", "Contract number; follow-on contracts carry a letter suffix"),
    ("LESSEE NO", "lessee_no", "int"),
    ("LS STATUS", "ls_status", "text", "Lease status code (code_set ls_status)"),
    ("LS STATUS DATE", "ls_status_date", "date"),
    ("AccountStatus", "account_status", "text", "Active / Closed"),
    ("IsAccountOpen", "is_account_open", "bool"),
    ("BOOK DATE", "book_date", "date"),
    ("LAST UPDATE", "last_update", "date", "Date of last cash posting, reversal, etc."),
    ("LEASE DATE", "lease_date", "date"),
    ("COMMENCE DATE", "commence_date", "date"),
    ("MATURITY DATE", "maturity_date", "date"),
    ("MATURITY DATE SS", "maturity_date_ss", "date"),
    ("LAST PAID DATE", "last_paid_date", "date"),
    ("NEXT DUE", "next_due", "date"),
    ("ACCRUED_TO_DATE", "accrued_to_date", "date"),
    ("ACCRUAL METHOD", "accrual_method", "text", "code_set accrual_method"),
    ("BUSINESS/PERSONAL", "business_personal", "char"),
    ("CLASS", "class", "char"),
    ("LS TYPE", "ls_type", "text", "code_set ls_type"),
    ("LS FORM", "ls_form", "text"),
    ("STMT_CODE", "stmt_code", "char", "Statement format"),
    ("USE_TAX_CODE", "use_tax_code", "text", "code_set use_tax_code"),
    ("LATE CODE", "late_code", "text", "code_set late_code"),
    ("OPEN/CLOSED", "open_closed", "char", "End-of-term condition: O = open-end, C = closed-end"),
    ("LATE CHG(Y/N)", "late_chg_yn", "bool"),
    ("GRACE DAYS", "grace_days", "small"),
    ("LESSOR YIELD", "lessor_yield", "num"),
    ("EARLY PAYOFF DISCOUNT RATE", "early_payoff_discount_rate", "num"),
    ("IRR", "irr", "num"),
    ("IRR W/O RESIDUAL", "irr_wo_residual", "num"),
    ("LESSEE NAME", "lessee_name", "text"),
    ("LESSEE STATE", "lessee_state", "text"),
    ("LESSEE REMIT CODE", "lessee_remit_code", "text"),
    ("OEC", "oec", "num2", "Original equipment cost"),
    ("ORIG COST", "orig_cost", "num2"),
    ("ORIG IDC", "orig_idc", "num2", "Original initial direct cost"),
    ("ORIG UNEARNED", "orig_unearned", "num2"),
    ("ORIG_UE_RESID", "orig_ue_resid", "num2", "Original unearned residual income"),
    ("TOT RESIDUAL", "tot_residual", "num2", "Unguaranteed + guaranteed residual"),
    ("UNGUAR RESI", "unguar_resi", "num4"),
    ("GUAR RESID", "guar_resid", "num2"),
    ("SECURITY D", "security_d", "num2", "Security deposit"),
    ("TERM", "term", "small"),
    ("CONTRACT RCVBL", "contract_rcvbl", "num2", "Remaining lease payments + guaranteed residual"),
    ("OUTSTANDING A/R", "outstanding_ar", "num2"),
    ("OUTSTANDING A/R SS", "outstanding_ar_ss", "num2"),
    ("DEF INC/DEF RES", "def_inc_def_res", "num2"),
    ("NET O/S A/R", "net_os_ar", "num2"),
    ("NET O/S A/R 1", "net_os_ar_1", "num2"),
    ("OTHER CHARGES", "other_charges", "num2"),
    ("REMAINING RECEIVABLES", "remaining_receivables", "num2"),
    ("REMAINING INTEREST", "remaining_interest", "num2", "Duplicate of remaining unearned income"),
    ("PAST DUE RECEIVABLES", "past_due_receivables", "num2"),
    ("LSOR_REMAIN_U/E", "lsor_remain_ue", "num2", "Current remaining unearned income"),
    ("LEASE INC REC", "lease_inc_rec", "num2"),
    ("SUSP INC ACCR", "susp_inc_accr", "num2"),
    ("UNEARNED_RESIDUAL", "unearned_residual", "num4"),
    ("NBV", "nbv", "num2", "Net book value"),
    ("UNAMOR_IDC_BOOK", "unamor_idc_book", "num2"),
    ("ACCRUED_PRIN", "accrued_prin", "num2"),
    ("RESID_INCOME_YTD", "resid_income_ytd", "num2"),
    ("RESI_INCOME", "resi_income", "num2", "Residual income, current period"),
    ("LESSOR_INCOME YTD", "lessor_income_ytd", "num2"),
    ("CURR_MON_IDC_AMORT", "curr_mon_idc_amort", "num2"),
    ("CURR_MON_IDC_BOOK", "curr_mon_idc_book", "num2"),
    ("UNEARNED_INCOME", "unearned_income", "num2"),
    ("1ST ASSET DESC", "first_asset_desc", "text"),
    ("BROKER FEES", "broker_fees", "num2"),
    ("BOOKED INTERIM RENT", "booked_interim_rent", "num2"),
    ("OS INTERIM RENT", "os_interim_rent", "num2"),
    ("BOOKED DOWN", "booked_down", "num2"),
    ("OS DOWN PMT", "os_down_pmt", "num2"),
    ("PAP", "pap", "bool", "Pre-authorized payment"),
    ("PAP EFF DATE", "pap_eff_date", "date"),
    ("DEALER", "dealer", "int"),
    ("DLR_NAME", "dlr_name", "text"),
    ("DAL_PHONE1", "dal_phone1", "text"),
    ("DAL_PHONE2", "dal_phone2", "text"),
    ("DAL_ADDR1", "dal_addr1", "text"),
    ("DAL_ADDR2", "dal_addr2", "text"),
    ("DAL_CITY", "dal_city", "text"),
    ("DAL_STATE", "dal_state", "text"),
    ("DAL_ZIP", "dal_zip", "text"),
    ("DAL_CONTACT", "dal_contact", "text"),
    ("EQUIP_LOCATION", "equip_location", "text"),
    ("DAYS_DEL", "days_del", "int", "Days delinquent"),
    ("DAYS_DEL SS", "days_del_ss", "int"),
    ("CURR_DELINQ", "curr_delinq", "text", "Delinquency age bucket"),
    ("CURR_DELINQ SS", "curr_delinq_ss", "text"),
    ("#30_DEL", "num_30_del", "int", "Times 16-30 days delinquent"),
    ("#60_DEL", "num_60_del", "int", "Times 31-60 days delinquent"),
    ("#90_DEL", "num_90_del", "int", "Times 61-90 days delinquent"),
    ("#91+_DEL", "num_91_plus_del", "int", "Times 91+ days delinquent"),
    ("MARK_UP", "mark_up", "num2"),
    ("CURR_MO_RENTAL", "curr_mo_rental", "num2"),
    ("LS_SOURCE", "ls_source", "text", "code_set ls_source"),
    ("COLL_CODE", "coll_code", "text", "Collection status (code_set coll_code)"),
    ("COLL_DATE", "coll_date", "date"),
    ("CURR_PYMT", "curr_pymt", "num4", "Current monthly payment"),
    ("PYMT_FREQ", "pymt_freq", "text"),
    ("BROKER", "broker", "int"),
    ("BROKER NAME", "broker_name", "text"),
    ("INVESTOR", "investor", "text"),
    ("ORIG_FILING_FEES", "orig_filing_fees", "num2"),
    ("UNAMORT_FILING_FEES", "unamort_filing_fees", "num2"),
    ("ORIG_DEALER_FEES", "orig_dealer_fees", "num2"),
    ("UNAMORT_DEALER_FEES", "unamort_dealer_fees", "num2"),
    ("ASSET_BRAND", "asset_brand", "text"),
    ("PRIN_PD_LTD", "prin_pd_ltd", "num2", "Principal paid life to date"),
    ("INT_RATE", "int_rate", "num"),
    ("LEASED EQUIP", "leased_equip", "num2"),
    ("ACCUM DEPR", "accum_depr", "num2"),
    ("UNBILLED OPER REC", "unbilled_oper_rec", "num2"),
    ("DEF OPER LEASE REV", "def_oper_lease_rev", "num2"),
    ("UNBILLED OPER INC", "unbilled_oper_inc", "num2"),
    ("IDR2_UNAMORT_REG_FEE", "idr2_unamort_reg_fee", "num2"),
    ("IDR3_UNAMORT_DLR_SUBSIDY", "idr3_unamort_dlr_subsidy", "num2"),
    ("OPEN COMM", "open_comm", "num2"),
    ("IDC2_SUSP_DLR_FEE", "idc2_susp_dlr_fee", "num2"),
    ("IDR2_ORIG_REG_FEE", "idr2_orig_reg_fee", "num2"),
    ("IDR2_SUSP_REG_FEE", "idr2_susp_reg_fee", "num2"),
    ("IDR3_ORIG_DLR_SUBSIDY", "idr3_orig_dlr_subsidy", "num2"),
    ("IDR3_SUSP_DLR_SUBSIDY", "idr3_susp_dlr_subsidy", "num2"),
    ("IDR4_SUSP_OPEN_COMM", "idr4_susp_open_comm", "num2"),
    *_UDF_CONTRACT,
    ("Mod_Reason", "mod_reason", "text"),
    ("Mod_Date", "mod_date", "date"),
    ("AS_OF_DATE", "as_of_date", "date", "System date of report generation"),
    ("SOURCE", "source", "text"),
    ("Business History", "business_history", "text"),
    ("Employment", "employment", "text"),
    ("Marital Status", "marital_status", "text"),
    ("Living Status", "living_status", "text"),
    ("Income Bracket", "income_bracket", "text"),
    ("Debt Payments", "debt_payments", "text"),
    ("Payment History", "payment_history", "text"),
    ("Credit Applications", "credit_applications", "text"),
    ("Credit Score Question", "credit_score_question", "text"),
    ("REG_FEE_INCOME", "reg_fee_income", "num2"),
    ("INTERIM_FEE_INCOME", "interim_fee_income", "num2"),
    ("OPER_LEASE_INC", "oper_lease_inc", "num2"),
    ("DEPRECIATION EXPENSE", "depreciation_expense", "num2"),
    ("CURR CONTRACT RCVBL", "curr_contract_rcvbl", "num2"),
    ("REMAINING PAYMENTS", "remaining_payments", "num", "Fractional count of payments left"),
    ("DOWN", "down", "num2", "Outstanding down payment balance"),
    ("SALESPERSON", "salesperson", "text"),
    ("DOC_APP_OFF", "doc_app_off", "text"),
    ("TOTAL PAST DUE", "total_past_due", "num2"),
    ("PRIN_RCVBL", "prin_rcvbl", "num2"),
    ("INT_RCVBL", "int_rcvbl", "num2"),
    ("ACCR_PRIN", "accr_prin", "num2"),
    ("NET YIELD", "net_yield", "num"),
    ("EST PAYOFF", "est_payoff", "num2"),
    ("CREDIT SCORE", "credit_score", "small"),
]

# ---------------------------------------------------------------------------
# 20261019_TransactionHistory_Daily_P50.csv — one row per posted transaction
# ---------------------------------------------------------------------------
TRANSACTION_HISTORY = [
    ("TransactionKey", "transaction_key", "big"),
    ("Portfolio", "portfolio", "small"),
    ("REPORTKEY", "report_key", "text", "Portfolio / company / region / office"),
    ("TransactionDateKey", "transaction_date_key", "date"),
    ("EffectiveDateKey", "effective_date_key", "date"),
    ("DateDueDateKey", "date_due_date_key", "date"),
    ("IsPayoff", "is_payoff", "bool"),
    ("IsNonCash", "is_non_cash", "bool"),
    ("IsPastDue", "is_past_due", "bool"),
    ("IsCashReportTransaction", "is_cash_report_transaction", "bool"),
    ("CONTRACTNUMBER", "contract_number", "text", "Contract number; follow-on contracts carry a letter suffix"),
    ("NAME", "name", "text"),
    ("DESCRIPTION", "description", "text", "Transaction code description"),
    ("TRANS", "trans", "text", "Transaction code (code_set tran_code)"),
    ("BANKCD", "bankcd", "text", "Bank code (code_set bank_code)"),
    ("DEBIT VECTOR", "debit_vector", "int", "Debit GL vector (gl_vector)"),
    ("CREDIT VECTOR", "credit_vector", "int", "Credit GL vector (gl_vector)"),
    ("CHECKNO", "checkno", "text"),
    ("POSTEDDATE", "posted_date", "date"),
    ("INVOICEDUEDATE", "invoice_due_date", "date"),
    ("TRANSACTIONAMOUNT", "transaction_amount", "num2"),
    ("PAYMENT", "payment", "num2", "Principal/interest payments"),
    ("PREPAYMENT", "prepayment", "num2"),
    ("PAYOFF", "payoff", "num2"),
    ("INVENTORYSALE", "inventory_sale", "num2"),
    ("PAYDOWN", "paydown", "num2"),
    ("PROPERTYTAX", "property_tax", "num2"),
    ("SALESTAX", "sales_tax", "num2"),
    ("LATECHARGE", "late_charge", "num2"),
    ("COLLECTIONFEE", "collection_fee", "num2"),
    ("ASSUMPTIONFEE", "assumption_fee", "num2"),
    ("LEGALFEE", "legal_fee", "num2"),
    ("PMTEXTENSION", "pmt_extension", "num2"),
    ("LSEEXTENSION", "lse_extension", "num2"),
    ("ITCFEES", "itc_fees", "num2"),
    ("FHUT", "fhut", "num2", "Federal highway use tax"),
    ("IDR", "idr", "num2", "Deferred interim rent / deferred lease fees"),
    ("LEASEREWRITE", "lease_rewrite", "num2"),
    ("OTHERFEES", "other_fees", "num2"),
    ("SECURITYDEPOSIT", "security_deposit", "num2"),
    ("SUSPENSE", "suspense", "num2"),
    ("RCR1", "rcr1", "num2", "Recurring charge 1"),
    ("RCR2", "rcr2", "num2"),
    ("RCR3", "rcr3", "num2"),
    ("PAYMENTAMOUNT", "payment_amount", "num2", "Total payment amount posted"),
    ("OPERINITS", "operinits", "text", "Operator initials"),
]

REPORTS = {
    "asset_summary": dict(
        cols=ASSET_SUMMARY,
        pk=("asof_date", "asset_no"),
        not_null=("asset_no",),  # LEASE is blank on pre-inventory deficiency assets (serial_number carries the contract no.)
        lease_col="lease",
        indexes=[("lease_no_norm",), ("serial_number",), ("status",)],
        comment="Vervent AssetSummary daily report: one row per asset (vehicle or deficiency-balance asset) per as-of date.",
    ),
    "contract_summary": dict(
        cols=CONTRACT_SUMMARY,
        pk=("asof_date", "lease_no"),
        not_null=("lease_no",),
        lease_col="lease_no",
        indexes=[("lease_no_norm",), ("ls_status",), ("account_key",)],
        comment="Vervent Contract Summary daily report: one row per contract (lease) per as-of date.",
    ),
    "transaction_history": dict(
        cols=TRANSACTION_HISTORY,
        pk=("transaction_key",),
        not_null=("transaction_key", "contract_number"),
        lease_col="contract_number",
        indexes=[("lease_no_norm",), ("contract_number", "posted_date"), ("asof_date",)],
        comment="Vervent TransactionHistory report: one row per posted transaction. Daily files carry the prior day's activity, monthly files the whole month; transaction_key is the identity so overlapping files upsert.",
    ),
}


def check_spec() -> None:
    for name, r in REPORTS.items():
        names = [c[1] for c in r["cols"]]
        dupes = {n for n in names if names.count(n) > 1}
        assert not dupes, f"{name}: duplicate column names {dupes}"
        for c in r["cols"]:
            assert c[2] in KIND_SQL, f"{name}: bad kind {c}"
        reserved = {"file_id", "asof_date", "lease_no_norm", "loaded_at"}
        assert not reserved & set(names), f"{name}: column clashes with a fixed column"


SCHEMA_HEAD = r"""-- =============================================================================
-- Camber — Vervent daily servicer reports
--   schema vervent: typed tables mirroring the three LeasePak CSV extracts
--   (AssetSummary, Contract Summary, TransactionHistory) plus a load registry.
-- Dialect: PostgreSQL 14+. Idempotent: psql -v ON_ERROR_STOP=1 -f 01_schema.sql
--
-- GENERATED by generate_schema.py from its column spec — edit the spec, not
-- this file. Column order follows the CSV header; the "-- CSV:" annotation on
-- each column is the exact header text it comes from.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS vervent;

-- -----------------------------------------------------------------------------
-- Parsers. The files are pipe-delimited text with space-padded codes, literal
-- NULL strings, and dates in three encodings. Every parser is strict: an
-- unrecognized non-blank value raises, so a format change fails the load
-- instead of silently becoming NULL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vervent.parse_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NULL THEN NULL
    WHEN btrim(t) = '' OR upper(btrim(t)) = 'NULL' THEN NULL
    ELSE btrim(t)
  END
$$;

CREATE OR REPLACE FUNCTION vervent.parse_date(t text) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text := vervent.parse_text(t);
BEGIN
  IF s IS NULL THEN
    RETURN NULL;
  ELSIF s ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN                   -- MM/DD/YYYY
    RETURN make_date(split_part(s, '/', 3)::int,
                     split_part(s, '/', 1)::int,
                     split_part(s, '/', 2)::int);
  ELSIF s ~ '^\d{8}$' THEN                                   -- YYYYMMDD (*DateKey)
    RETURN make_date(left(s, 4)::int, substr(s, 5, 2)::int, substr(s, 7, 2)::int);
  ELSIF s ~ '^\d{6}$' THEN                                   -- YYMMDD (repo status date)
    RETURN make_date(2000 + left(s, 2)::int, substr(s, 3, 2)::int, substr(s, 5, 2)::int);
  ELSIF s ~ '^\d{4}-\d{2}-\d{2}' THEN                        -- ISO, if a file passes through Excel
    RETURN left(s, 10)::date;
  END IF;
  RAISE EXCEPTION 'vervent.parse_date: unrecognized date value %', t;
END
$$;

CREATE OR REPLACE FUNCTION vervent.parse_num(t text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  -- strips thousands separators, $ and inner spaces; raises on anything else
  SELECT nullif(regexp_replace(vervent.parse_text(t), '[,$ ]', '', 'g'), '')::numeric
$$;

CREATE OR REPLACE FUNCTION vervent.parse_bool(t text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text := upper(vervent.parse_text(t));
BEGIN
  IF s IS NULL THEN RETURN NULL;
  ELSIF s IN ('1', 'Y', 'YES', 'T', 'TRUE') THEN RETURN true;
  ELSIF s IN ('0', 'N', 'NO', 'F', 'FALSE') THEN RETURN false;
  END IF;
  RAISE EXCEPTION 'vervent.parse_bool: unrecognized flag value %', t;
END
$$;

-- LeasePak gives follow-on contracts a letter suffix (deficiency balance
-- '500069007D' belongs to lease '5000069007'). Normalize back to the parent:
-- last char non-numeric -> first char + '0' + middle (dropping the suffix).
CREATE OR REPLACE FUNCTION vervent.norm_lease_no(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN s IS NULL THEN NULL
    WHEN right(s, 1) !~ '[0-9]' THEN left(s, 1) || '0' || substr(s, 2, length(s) - 2)
    ELSE s
  END
  FROM (SELECT vervent.parse_text(t)) x(s)
$$;

-- -----------------------------------------------------------------------------
-- Load registry — one row per file loaded. Reloading a filename replaces its
-- rows (report tables cascade on file_id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vervent.report_file (
  file_id     serial       PRIMARY KEY,
  report_type text         NOT NULL CHECK (report_type IN ('asset_summary', 'contract_summary', 'transaction_history')),
  cadence     text         CHECK (cadence IN ('daily', 'monthly')),
  asof_date   date         NOT NULL,   -- report date (YYYYMMDD prefix of the filename)
  filename    text         NOT NULL UNIQUE,
  sha256      char(64),
  row_count   integer,
  loaded_at   timestamptz  NOT NULL DEFAULT now()
);

-- One row per load attempt made by the Go processor (dashboard/api/pipeline),
-- so failures (header drift, unparseable values) are visible in the UI.
CREATE TABLE IF NOT EXISTS vervent.load_event (
  event_id    bigserial    PRIMARY KEY,
  at          timestamptz  NOT NULL DEFAULT now(),
  trigger     text         NOT NULL CHECK (trigger IN ('poll', 'manual', 'cli')),
  filename    text         NOT NULL,
  sha256      char(64),
  report_type text,
  asof_date   date,
  status      text         NOT NULL CHECK (status IN ('loaded', 'failed')),
  row_count   integer,
  message     text
);
CREATE INDEX IF NOT EXISTS load_event_at_idx ON vervent.load_event (at DESC);
"""


def sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def table_ddl(name: str, r: dict) -> str:
    cols = r["cols"]
    not_null = set(r["not_null"])
    width = max(len(c[1]) for c in cols) + 1
    lines = [
        f"-- -----------------------------------------------------------------------------",
        f"-- vervent.{name}",
        f"-- -----------------------------------------------------------------------------",
        f"CREATE TABLE IF NOT EXISTS vervent.{name} (",
        f"  {'file_id':<{width}} integer NOT NULL REFERENCES vervent.report_file (file_id) ON DELETE CASCADE,",
        f"  {'asof_date':<{width}} date NOT NULL,",
    ]
    for c in cols:
        hdr, col, kind = c[0], c[1], c[2]
        typ = KIND_SQL[kind]
        nn = " NOT NULL" if col in not_null else ""
        lines.append(f"  {col:<{width}} {typ}{nn},  -- CSV: {hdr}")
    lines.append(
        f"  {'lease_no_norm':<{width}} text GENERATED ALWAYS AS (vervent.norm_lease_no({r['lease_col']})) STORED,"
    )
    lines.append(f"  {'loaded_at':<{width}} timestamptz NOT NULL DEFAULT now(),")
    lines.append(f"  PRIMARY KEY ({', '.join(r['pk'])})")
    lines.append(");")
    for idx in r["indexes"]:
        iname = f"{name}_{'_'.join(idx)}_idx"
        lines.append(f"CREATE INDEX IF NOT EXISTS {iname} ON vervent.{name} ({', '.join(idx)});")
    lines.append(f"COMMENT ON TABLE vervent.{name} IS {sql_str(r['comment'])};")
    lines.append(
        f"COMMENT ON COLUMN vervent.{name}.lease_no_norm IS "
        f"{sql_str('Derived: ' + r['lease_col'] + ' with any follow-on letter suffix normalized to the parent lease number')};"
    )
    for c in cols:
        if len(c) > 3:
            lines.append(f"COMMENT ON COLUMN vervent.{name}.{c[1]} IS {sql_str(c[3])};")
    return "\n".join(lines) + "\n"


def load_sql(name: str, r: dict) -> str:
    cols = r["cols"]
    header = "|".join(c[0] for c in cols)
    src_cols = []
    for i, c in enumerate(cols):
        comma = "," if i < len(cols) - 1 else ""
        src_cols.append(f"  {c[1] + ' text' + comma:<34} -- CSV: {c[0]}")
    target_cols = ", ".join(c[1] for c in cols)
    parsed = ",\n".join(f"  {KIND_PARSE[c[2]].format(c=c[1])}" for c in cols)
    pk = set(r["pk"])
    upd_cols = [c[1] for c in cols if c[1] not in pk]
    upd = ",\n".join(f"  {c} = EXCLUDED.{c}" for c in ["file_id", "asof_date"] + upd_cols + ["loaded_at"])
    lines = [
        "-- GENERATED by generate_schema.py — do not edit by hand.",
        f"-- Loads one Vervent {name} CSV into vervent.{name}. Called by load.sh with:",
        "--   -v filename=<basename> -v asof=<YYYY-MM-DD> -v cadence=<daily|monthly|>",
        "--   -v sha=<sha256> -v rows=<data row count>",
        f"-- HEADER: {header}",
        "\\set ON_ERROR_STOP on",
        "BEGIN;",
        "",
        "CREATE TEMP TABLE src (",
        *src_cols,
        ") ON COMMIT DROP;",
        "",
        "-- the CSV is piped in on psql's stdin by load.sh (\\copy does not interpolate variables)",
        "\\copy src FROM pstdin WITH (FORMAT csv, DELIMITER '|', NULL 'NULL', HEADER true, ENCODING 'UTF8')",
        "",
        "DELETE FROM vervent.report_file WHERE filename = :'filename';",
        "INSERT INTO vervent.report_file (report_type, cadence, asof_date, filename, sha256, row_count)",
        f"VALUES ('{name}', nullif(:'cadence', ''), :'asof'::date, :'filename', nullif(:'sha', ''), :'rows'::int)",
        "RETURNING file_id \\gset",
        "",
        f"INSERT INTO vervent.{name} (file_id, asof_date, {target_cols})",
        "SELECT :file_id, :'asof'::date,",
        parsed,
        "FROM src",
        f"ON CONFLICT ({', '.join(r['pk'])}) DO UPDATE SET",
        upd + ";",
        "",
        "COMMIT;",
        "",
    ]
    return "\n".join(lines)


GO_HEAD = """// Code generated by sql/generate_schema.py from its column spec; DO NOT EDIT.
// Re-run `python3 sql/generate_schema.py` after changing the spec.

package pipeline

// Reports maps report_type to the definition the loader needs: the exact CSV
// header, the staging column names (same order), and the typed upsert from
// the text staging table. $1 = file_id, $2 = as-of date (YYYY-MM-DD).
var Reports = map[string]*Report{
"""


def go_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def go_report(name: str, r: dict) -> str:
    cols = r["cols"]
    target_cols = ", ".join(c[1] for c in cols)
    parsed = ",\n".join(f"  {KIND_PARSE[c[2]].format(c=c[1])}" for c in cols)
    pk = set(r["pk"])
    upd_cols = [c[1] for c in cols if c[1] not in pk]
    upd = ",\n".join(f"  {c} = EXCLUDED.{c}" for c in ["file_id", "asof_date"] + upd_cols + ["loaded_at"])
    insert = (
        f"INSERT INTO vervent.{name} (file_id, asof_date, {target_cols})\n"
        f"SELECT $1::int, $2::date,\n{parsed}\nFROM src\n"
        f"ON CONFLICT ({', '.join(r['pk'])}) DO UPDATE SET\n{upd}"
    )
    assert "`" not in insert
    header = ", ".join(go_str(c[0]) for c in cols)
    columns = ", ".join(go_str(c[1]) for c in cols)
    pkey = ", ".join(go_str(c) for c in r["pk"])
    return (
        f"\t{go_str(name)}: {{\n"
        f"\t\tName:       {go_str(name)},\n"
        f"\t\tTable:      {go_str('vervent.' + name)},\n"
        f"\t\tHeader:     []string{{{header}}},\n"
        f"\t\tColumns:    []string{{{columns}}},\n"
        f"\t\tPrimaryKey: []string{{{pkey}}},\n"
        f"\t\tInsertSQL: `{insert}`,\n"
        f"\t}},\n"
    )


def main() -> None:
    check_spec()
    schema = SCHEMA_HEAD + "\n" + "\n".join(table_ddl(n, r) for n, r in REPORTS.items())
    with open(os.path.join(HERE, "01_schema.sql"), "w") as f:
        f.write(schema)
    for n, r in REPORTS.items():
        with open(os.path.join(HERE, f"load_{n}.sql"), "w") as f:
            f.write(load_sql(n, r))
    go_path = os.path.join(HERE, "..", "dashboard", "api", "pipeline", "reports_gen.go")
    os.makedirs(os.path.dirname(go_path), exist_ok=True)
    with open(go_path, "w") as f:
        f.write(GO_HEAD + "".join(go_report(n, r) for n, r in REPORTS.items()) + "}\n")
    print("wrote 01_schema.sql, load_*.sql and dashboard/api/pipeline/reports_gen.go:",
          ", ".join(f"{n} ({len(r['cols'])} cols)" for n, r in REPORTS.items()))


if __name__ == "__main__":
    main()
