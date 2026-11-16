-- vervent_contracts: DDL generated from ContractSummary daily extract headers (225 source columns).
-- Source: /Users/ao/pipeline/vervent/YYYYMMDD_ContractSummary_Daily_P50.csv (pipe-delimited, header row).

CREATE TABLE IF NOT EXISTS vervent_contracts (
    account_key                   bigint,
    customer_key                  bigint,
    account_group_key             text,
    account_class_key             bigint,
    book_date_key                 date,
    lease_date_key                date,
    current_date_key              date,
    maturity_date_key             date,
    payoff_date_key               date,
    last_activity_date_key        date,
    commencement_date_key         date,
    accrued_through_date_key      date,
    next_billing_date_key         date,
    closed_date_key               date,
    last_billing_date_key         date,
    next_accrual_cutoff_date_key  date,
    last_due_date_key             date,
    last_paid_date_key            date,
    next_due_date_key             date,
    port                          integer,
    comp                          integer,
    reg                           integer,
    off                           text,
    lease_no                      text NOT NULL,
    lessee_no                     integer,
    ls_status                     text,
    ls_status_date                date,
    account_status                text,
    is_account_open               boolean,
    book_date                     date,
    last_update                   date,
    lease_date                    date,
    commence_date                 date,
    maturity_date                 date,
    maturity_date_ss              date,
    last_paid_date                date,
    next_due                      date,
    accrued_to_date               date,
    accrual_method                text,
    business_personal             text,
    class                         text,
    ls_type                       text,
    ls_form                       text,
    stmt_code                     text,
    use_tax_code                  text,
    late_code                     text,
    open_closed                   text,
    late_chg_y_n                  text,
    grace_days                    integer,
    lessor_yield                  numeric(20,10),
    early_payoff_discount_rate    numeric(20,10),
    irr                           numeric(20,10),
    irr_w_o_residual              text,
    lessee_name                   text,
    lessee_state                  text,
    lessee_remit_code             text,
    oec                           numeric(18,2),
    orig_cost                     numeric(18,2),
    orig_idc                      numeric(18,2),
    orig_unearned                 numeric(18,2),
    orig_ue_resid                 numeric(18,2),
    tot_residual                  numeric(18,2),
    unguar_resi                   numeric(18,2),
    guar_resid                    numeric(18,2),
    security_d                    numeric(18,2),
    term                          integer,
    contract_rcvbl                numeric(18,2),
    outstanding_a_r               numeric(18,2),
    outstanding_a_r_ss            numeric(18,2),
    def_inc_def_res               numeric(18,2),
    net_o_s_a_r                   numeric(18,2),
    net_o_s_a_r_1                 numeric(18,2),
    other_charges                 numeric(18,2),
    remaining_receivables         numeric(18,2),
    remaining_interest            numeric(18,2),
    past_due_receivables          numeric(18,2),
    lsor_remain_u_e               numeric(18,2),
    lease_inc_rec                 numeric(18,2),
    susp_inc_accr                 numeric(18,2),
    unearned_residual             numeric(18,2),
    nbv                           numeric(18,2),
    unamor_idc_book               numeric(18,2),
    accrued_prin                  numeric(18,2),
    resid_income_ytd              numeric(18,2),
    resi_income                   numeric(18,2),
    lessor_income_ytd             numeric(18,2),
    curr_mon_idc_amort            numeric(18,2),
    curr_mon_idc_book             numeric(18,2),
    unearned_income               numeric(18,2),
    first_asset_desc              text,
    broker_fees                   numeric(18,2),
    booked_interim_rent           numeric(18,2),
    os_interim_rent               numeric(18,2),
    booked_down                   numeric(18,2),
    os_down_pmt                   numeric(18,2),
    pap                           boolean,
    pap_eff_date                  date,
    dealer                        integer,
    dlr_name                      text,
    dal_phone1                    text,
    dal_phone2                    text,
    dal_addr1                     text,
    dal_addr2                     text,
    dal_city                      text,
    dal_state                     text,
    dal_zip                       text,
    dal_contact                   text,
    equip_location                text,
    days_del                      integer,
    days_del_ss                   integer,
    curr_delinq                   text,
    curr_delinq_ss                text,
    del_30_count                  integer,
    del_60_count                  integer,
    del_90_count                  integer,
    del_91_plus_count             integer,
    mark_up                       numeric(18,2),
    curr_mo_rental                numeric(18,2),
    ls_source                     text,
    coll_code                     text,
    coll_date                     text,
    curr_pymt                     numeric(18,2),
    pymt_freq                     text,
    broker                        integer,
    broker_name                   text,
    investor                      text,
    orig_filing_fees              numeric(18,2),
    unamort_filing_fees           numeric(18,2),
    orig_dealer_fees              numeric(18,2),
    unamort_dealer_fees           numeric(18,2),
    asset_brand                   text,
    prin_pd_ltd                   numeric(18,2),
    int_rate                      numeric(20,10),
    leased_equip                  numeric(18,2),
    accum_depr                    numeric(18,2),
    unbilled_oper_rec             numeric(18,2),
    def_oper_lease_rev            numeric(18,2),
    unbilled_oper_inc             numeric(18,2),
    idr2_unamort_reg_fee          numeric(18,2),
    idr3_unamort_dlr_subsidy      numeric(18,2),
    open_comm                     numeric(18,2),
    idc2_susp_dlr_fee             numeric(18,2),
    idr2_orig_reg_fee             numeric(18,2),
    idr2_susp_reg_fee             numeric(18,2),
    idr3_orig_dlr_subsidy         numeric(18,2),
    idr3_susp_dlr_subsidy         numeric(18,2),
    idr4_susp_open_comm           numeric(18,2),
    contr_udf_1                   text,
    contr_udf_2                   text,
    contr_udf_3                   text,
    contr_udf_4                   text,
    contr_udf_5                   text,
    contr_udf_6                   text,
    contr_udf_7                   text,
    contr_udf_8                   text,
    contr_udf_9                   text,
    contr_udf_10                  text,
    field10_s                     text,
    contr_udf_11                  text,
    contr_udf_12                  text,
    contr_udf_13                  numeric(18,2),
    contr_udf_14                  text,
    contr_udf_15                  text,
    contr_udf_16                  text,
    contr_udf_17                  numeric(18,2),
    contr_udf_18                  numeric(18,2),
    contr_udf_19                  text,
    contr_udf_20                  text,
    contr_udf_20_1                text,
    contr_udf_21                  text,
    contr_udf_22                  text,
    contr_udf_23                  text,
    contr_udf_24                  text,
    contr_udf_25                  text,
    contr_udf_26                  text,
    contr_udf_27                  text,
    contr_udf_28                  text,
    contr_udf_29                  text,
    contr_udf_30                  integer,
    contr_udf_31                  text,
    contr_udf_32                  text,
    contr_udf_33                  text,
    contr_udf_34                  text,
    contr_udf_35                  text,
    contr_udf_36                  numeric(18,2),
    contr_udf_37                  numeric(20,10),
    contr_udf_38                  text,
    contr_udf_39                  text,
    contr_udf_40                  numeric(18,2),
    contr_udf_41                  numeric(18,2),
    contr_udf_42                  numeric(18,2),
    contr_udf_60                  integer,
    contr_udf_61                  text,
    contr_udf_62                  text,
    contr_udf_63                  text,
    contr_udf_64                  text,
    mod_reason                    text,
    mod_date                      date,
    as_of_date                    date,
    source                        text,
    business_history              text,
    employment                    text,
    marital_status                text,
    living_status                 text,
    income_bracket                text,
    debt_payments                 text,
    payment_history               text,
    credit_applications           text,
    credit_score_question         text,
    reg_fee_income                numeric(18,2),
    interim_fee_income            numeric(18,2),
    oper_lease_inc                numeric(18,2),
    depreciation_expense          numeric(18,2),
    curr_contract_rcvbl           numeric(18,2),
    remaining_payments            numeric(18,6),
    down                          numeric(18,2),
    salesperson                   text,
    doc_app_off                   text,
    total_past_due                numeric(18,2),
    prin_rcvbl                    numeric(18,2),
    int_rcvbl                     numeric(18,2),
    accr_prin                     numeric(18,2),
    net_yield                     numeric(20,10),
    est_payoff                    numeric(18,2),
    credit_score                  integer,
    source_file                   text NOT NULL,
    file_date                     date NOT NULL,
    loaded_at                     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_vervent_contracts PRIMARY KEY (lease_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_vervent_contracts_account_key ON vervent_contracts (account_key);
CREATE INDEX IF NOT EXISTS ix_vervent_contracts_lessee_no ON vervent_contracts (lessee_no);
CREATE INDEX IF NOT EXISTS ix_vervent_contracts_ls_status ON vervent_contracts (ls_status);

COMMENT ON TABLE vervent_contracts IS 'Vervent portfolio 50 contracts (leases/loans). Latest snapshot per contract, upserted daily from *_ContractSummary_Daily_P50.csv.';

COMMENT ON COLUMN vervent_contracts.account_key IS '[AccountKey] Surrogate key for the contract (account). Unique; primary key of this file.';
COMMENT ON COLUMN vervent_contracts.customer_key IS '[CustomerKey] Surrogate key for the customer. Many-to-one with LESSEE NO.';
COMMENT ON COLUMN vervent_contracts.account_group_key IS '[AccountGroupKey] Account group; same values as CLASS (V = vehicle, EDEF = deficiency). Right-padded with spaces.';
COMMENT ON COLUMN vervent_contracts.account_class_key IS '[AccountClassKey] Surrogate key for the account class (2 values).';
COMMENT ON COLUMN vervent_contracts.book_date_key IS '[BookDateKey] BOOK DATE as YYYYMMDD integer. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.lease_date_key IS '[LeaseDateKey] LEASE DATE as YYYYMMDD integer. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.current_date_key IS '[CurrentDateKey] Identical to LeaseDateKey in every row of this extract. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.maturity_date_key IS '[MaturityDateKey] MATURITY DATE as YYYYMMDD integer. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.payoff_date_key IS '[PayoffDateKey] Date contract was paid off/closed, YYYYMMDD. Blank for active contracts. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.last_activity_date_key IS '[LastActivityDateKey] LAST UPDATE as YYYYMMDD integer (date of last account activity). Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.commencement_date_key IS '[CommencementDateKey] Identical to LastActivityDateKey in this extract (despite the name, NOT the commence date - use COMMENCE DATE). Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.accrued_through_date_key IS '[AccruedThroughDateKey] ACCRUED_TO_DATE as YYYYMMDD integer. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.next_billing_date_key IS '[NextBillingDateKey] Next billing date. NOTE: MM/DD/YYYY text, not a YYYYMMDD key. Active billing contracts only. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.closed_date_key IS '[ClosedDateKey] Date the contract closed, YYYYMMDD. Identical to PayoffDateKey. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.last_billing_date_key IS '[LastBillingDateKey] Date of last billing, YYYYMMDD. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.next_accrual_cutoff_date_key IS '[NextAccrualCutoffDateKey] Next accrual cutoff date, YYYYMMDD. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.last_due_date_key IS '[LastDueDate] Last payment due date, YYYYMMDD integer. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.last_paid_date_key IS '[LastPaidDate] Last payment date, YYYYMMDD integer. Source format YYYYMMDD.';
COMMENT ON COLUMN vervent_contracts.next_due_date_key IS '[NextDueDate] Next payment due date, MM/DD/YYYY. Same as NEXT DUE. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.port IS '[PORT] Portfolio code. Always 50.';
COMMENT ON COLUMN vervent_contracts.comp IS '[COMP] Company code (1 or 2).';
COMMENT ON COLUMN vervent_contracts.reg IS '[REG] Region code. Always 1.';
COMMENT ON COLUMN vervent_contracts.off IS '[OFF] Office / booking unit: 100 = standard vehicle, DEF = deficiency, CO = other office.';
COMMENT ON COLUMN vervent_contracts.lease_no IS '[LEASE NO] Contract (lease) number. Unique. Join key to AssetSummary.[LEASE] and TransactionHistory.[CONTRACTNUMBER].';
COMMENT ON COLUMN vervent_contracts.lessee_no IS '[LESSEE NO] Lessee (customer) number. Join key to AssetSummary.[LESSEE_NO].';
COMMENT ON COLUMN vervent_contracts.ls_status IS '[LS STATUS] Contract status code. A* = active (ANOR normal, AEXT extended, AXFR transferred, ARBK rebooked), H* = hold (HREP repossession, HSET settlement), N* = non-accrual/terminal (NPER, NPMT, NPHL are Closed; NMAT matured but still Active). See AccountStatus for the open/closed flag.';
COMMENT ON COLUMN vervent_contracts.ls_status_date IS '[LS STATUS DATE] Date LS STATUS last changed. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.account_status IS '[AccountStatus] Active or Closed.';
COMMENT ON COLUMN vervent_contracts.is_account_open IS '[IsAccountOpen] 1 = Active, 0 = Closed.';
COMMENT ON COLUMN vervent_contracts.book_date IS '[BOOK DATE] Date contract was booked into the system. 12/31/2022 = conversion date for migrated contracts. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.last_update IS '[LAST UPDATE] Date of last update/activity on the contract. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.lease_date IS '[LEASE DATE] Contract signing/lease date. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.commence_date IS '[COMMENCE DATE] Contract commencement date (start of payment schedule). Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.maturity_date IS '[MATURITY DATE] Scheduled maturity date. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.maturity_date_ss IS '[MATURITY DATE SS] Maturity date (snapshot copy). "SS" columns are point-in-time snapshot versions. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.last_paid_date IS '[LAST PAID DATE] Date of last payment received. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.next_due IS '[NEXT DUE] Next payment due date. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.accrued_to_date IS '[ACCRUED_TO_DATE] Date income has been accrued through. Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.accrual_method IS '[ACCRUAL METHOD] Income accrual method. AAPR (majority), RAPR (mostly deficiency contracts), ARES (1 row).';
COMMENT ON COLUMN vervent_contracts.business_personal IS '[BUSINESS PERSONAL] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.class IS '[CLASS] Contract class. V = vehicle, EDEF = deficiency balance.';
COMMENT ON COLUMN vervent_contracts.ls_type IS '[LS TYPE] Lease type. FIN = finance lease, INSL = installment loan.';
COMMENT ON COLUMN vervent_contracts.ls_form IS '[LS FORM] Lease document form code (5001, 5005, 0FT).';
COMMENT ON COLUMN vervent_contracts.stmt_code IS '[STMT_CODE] Statement/invoice code: I = invoice/statement sent, N = no statement.';
COMMENT ON COLUMN vervent_contracts.use_tax_code IS '[USE_TAX_CODE] Use-tax code; same values as AssetSummary.[TAX CODE].';
COMMENT ON COLUMN vervent_contracts.late_code IS '[LATE CODE] Late-charge method: PMAX = percentage capped at max, PERC = percentage, NONE.';
COMMENT ON COLUMN vervent_contracts.open_closed IS '[OPEN CLOSED] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.late_chg_y_n IS '[LATE CHG(Y N)] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.grace_days IS '[GRACE DAYS] Late-charge grace period in days (0 or 10).';
COMMENT ON COLUMN vervent_contracts.lessor_yield IS '[LESSOR YIELD] Lessor yield (annual %, e.g. 7.34 = 7.34%).';
COMMENT ON COLUMN vervent_contracts.early_payoff_discount_rate IS '[EARLY PAYOFF DISCOUNT RATE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.irr IS '[IRR] Internal rate of return (annual %).';
COMMENT ON COLUMN vervent_contracts.irr_w_o_residual IS '[IRR W O RESIDUAL] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.lessee_name IS '[LESSEE NAME] Lessee / customer name.';
COMMENT ON COLUMN vervent_contracts.lessee_state IS '[LESSEE STATE] Lessee state.';
COMMENT ON COLUMN vervent_contracts.lessee_remit_code IS '[LESSEE REMIT CODE] Remittance code. Always 5001.';
COMMENT ON COLUMN vervent_contracts.oec IS '[OEC] Original equipment cost, USD. Identical to ORIG COST.';
COMMENT ON COLUMN vervent_contracts.orig_cost IS '[ORIG COST] Original cost financed, USD.';
COMMENT ON COLUMN vervent_contracts.orig_idc IS '[ORIG IDC] Original initial direct costs, USD.';
COMMENT ON COLUMN vervent_contracts.orig_unearned IS '[ORIG UNEARNED] Original unearned income at booking, USD.';
COMMENT ON COLUMN vervent_contracts.orig_ue_resid IS '[ORIG_UE_RESID] Original unearned residual income, USD.';
COMMENT ON COLUMN vervent_contracts.tot_residual IS '[TOT RESIDUAL] Total residual value, USD.';
COMMENT ON COLUMN vervent_contracts.unguar_resi IS '[UNGUAR RESI] Unguaranteed residual, USD. Equals TOT RESIDUAL (no guaranteed residuals).';
COMMENT ON COLUMN vervent_contracts.guar_resid IS '[GUAR RESID] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.security_d IS '[SECURITY D] Security deposit. Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.term IS '[TERM] Contract term in months.';
COMMENT ON COLUMN vervent_contracts.contract_rcvbl IS '[CONTRACT RCVBL] Remaining contract receivable, USD. Identical to REMAINING RECEIVABLES.';
COMMENT ON COLUMN vervent_contracts.outstanding_a_r IS '[OUTSTANDING A R] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.outstanding_a_r_ss IS '[OUTSTANDING A R SS] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.def_inc_def_res IS '[DEF INC DEF RES] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.net_o_s_a_r IS '[NET O S A R] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.net_o_s_a_r_1 IS '[NET O S A R 1] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.other_charges IS '[OTHER CHARGES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.remaining_receivables IS '[REMAINING RECEIVABLES] Remaining scheduled receivables, USD.';
COMMENT ON COLUMN vervent_contracts.remaining_interest IS '[REMAINING INTEREST] Remaining unearned interest, USD.';
COMMENT ON COLUMN vervent_contracts.past_due_receivables IS '[PAST DUE RECEIVABLES] Past-due amount, USD; negative = credit balance. Same as TOTAL PAST DUE.';
COMMENT ON COLUMN vervent_contracts.lsor_remain_u_e IS '[LSOR_REMAIN_U E] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.lease_inc_rec IS '[LEASE INC REC] Lease income receivable (accrued, unbilled), USD.';
COMMENT ON COLUMN vervent_contracts.susp_inc_accr IS '[SUSP INC ACCR] Suspended (non-accrual) income accrued, USD.';
COMMENT ON COLUMN vervent_contracts.unearned_residual IS '[UNEARNED_RESIDUAL] Unearned residual income, USD.';
COMMENT ON COLUMN vervent_contracts.nbv IS '[NBV] Net book value / net investment, USD.';
COMMENT ON COLUMN vervent_contracts.unamor_idc_book IS '[UNAMOR_IDC_BOOK] Unamortized initial direct costs, USD.';
COMMENT ON COLUMN vervent_contracts.accrued_prin IS '[ACCRUED_PRIN] Accrued principal balance, USD. Same as ACCR_PRIN.';
COMMENT ON COLUMN vervent_contracts.resid_income_ytd IS '[RESID_INCOME_YTD] Residual income year-to-date, USD.';
COMMENT ON COLUMN vervent_contracts.resi_income IS '[RESI_INCOME] Residual income for the current period, USD.';
COMMENT ON COLUMN vervent_contracts.lessor_income_ytd IS '[LESSOR_INCOME YTD] Lessor (interest) income year-to-date, USD.';
COMMENT ON COLUMN vervent_contracts.curr_mon_idc_amort IS '[CURR_MON_IDC_AMORT] Current-month IDC amortization, USD.';
COMMENT ON COLUMN vervent_contracts.curr_mon_idc_book IS '[CURR_MON_IDC_BOOK] Current-month IDC booked, USD.';
COMMENT ON COLUMN vervent_contracts.unearned_income IS '[UNEARNED_INCOME] Unearned income balance, USD.';
COMMENT ON COLUMN vervent_contracts.first_asset_desc IS '[1ST ASSET DESC] Description of the first asset on the contract (e.g. "2021 JEEP WRANGLER").';
COMMENT ON COLUMN vervent_contracts.broker_fees IS '[BROKER FEES] Broker / dealer fees paid, USD.';
COMMENT ON COLUMN vervent_contracts.booked_interim_rent IS '[BOOKED INTERIM RENT] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.os_interim_rent IS '[OS INTERIM RENT] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.booked_down IS '[BOOKED DOWN] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.os_down_pmt IS '[OS DOWN PMT] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.pap IS '[PAP] Pre-authorized payment (auto-debit) flag. Always False.';
COMMENT ON COLUMN vervent_contracts.pap_eff_date IS '[PAP EFF DATE] Pre-authorized payment effective date (defaults to commence date). Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.dealer IS '[DEALER] Originating dealer number.';
COMMENT ON COLUMN vervent_contracts.dlr_name IS '[DLR_NAME] Originating dealer name.';
COMMENT ON COLUMN vervent_contracts.dal_phone1 IS '[DAL_PHONE1] LESSEE primary phone (10 digits). Despite the DAL_ prefix these are lessee contact fields. 0 / 9999999999 = placeholders.';
COMMENT ON COLUMN vervent_contracts.dal_phone2 IS '[DAL_PHONE2] Lessee secondary phone.';
COMMENT ON COLUMN vervent_contracts.dal_addr1 IS '[DAL_ADDR1] Lessee address line 1 (matches AssetSummary.ADDRESS for most rows).';
COMMENT ON COLUMN vervent_contracts.dal_addr2 IS '[DAL_ADDR2] Lessee address line 2.';
COMMENT ON COLUMN vervent_contracts.dal_city IS '[DAL_CITY] Lessee city.';
COMMENT ON COLUMN vervent_contracts.dal_state IS '[DAL_STATE] Lessee state.';
COMMENT ON COLUMN vervent_contracts.dal_zip IS '[DAL_ZIP] Lessee ZIP (5 or 9 digits, space-padded).';
COMMENT ON COLUMN vervent_contracts.dal_contact IS '[DAL_CONTACT] Lessee contact first name.';
COMMENT ON COLUMN vervent_contracts.equip_location IS '[EQUIP_LOCATION] State where equipment is located.';
COMMENT ON COLUMN vervent_contracts.days_del IS '[DAYS_DEL] Current days delinquent.';
COMMENT ON COLUMN vervent_contracts.days_del_ss IS '[DAYS_DEL SS] Days delinquent (snapshot).';
COMMENT ON COLUMN vervent_contracts.curr_delinq IS '[CURR_DELINQ] Current delinquency bucket: 1-30, 31-60, 61-90, 91-120, 121-150, 151-180, 181+. Blank = current.';
COMMENT ON COLUMN vervent_contracts.curr_delinq_ss IS '[CURR_DELINQ SS] Delinquency bucket (snapshot).';
COMMENT ON COLUMN vervent_contracts.del_30_count IS '[#30_DEL] Lifetime count of times 30 days delinquent.';
COMMENT ON COLUMN vervent_contracts.del_60_count IS '[#60_DEL] Lifetime count of times 60 days delinquent.';
COMMENT ON COLUMN vervent_contracts.del_90_count IS '[#90_DEL] Lifetime count of times 90 days delinquent.';
COMMENT ON COLUMN vervent_contracts.del_91_plus_count IS '[#91+_DEL] Lifetime count of times more than 90 days delinquent.';
COMMENT ON COLUMN vervent_contracts.mark_up IS '[MARK_UP] Dealer rate mark-up / reserve, USD (0-1000).';
COMMENT ON COLUMN vervent_contracts.curr_mo_rental IS '[CURR_MO_RENTAL] Current-month rental/interest income, USD.';
COMMENT ON COLUMN vervent_contracts.ls_source IS '[LS_SOURCE] Origination source: VEND = vendor/dealer, DRCT = direct, DEFB = deficiency balance.';
COMMENT ON COLUMN vervent_contracts.coll_code IS '[COLL_CODE] Collection status code (e.g. DXXX, IXXX, B3XX/B7XX = bankruptcy ch.13/ch.7, DECS = deceased). Blank = none.';
COMMENT ON COLUMN vervent_contracts.coll_date IS '[COLL_DATE] Collection code date. MIXED FORMATS: YYYYMMDD (8 chars), MMDDYY (6), MM/DD/YYYY (10) and others. Text.';
COMMENT ON COLUMN vervent_contracts.curr_pymt IS '[CURR_PYMT] Current periodic payment amount, USD.';
COMMENT ON COLUMN vervent_contracts.pymt_freq IS '[PYMT_FREQ] Payment frequency: MON = monthly in arrears, ADVM = monthly in advance.';
COMMENT ON COLUMN vervent_contracts.broker IS '[BROKER] Broker number (dealer-affiliated broker account).';
COMMENT ON COLUMN vervent_contracts.broker_name IS '[BROKER NAME] Broker name.';
COMMENT ON COLUMN vervent_contracts.investor IS '[INVESTOR] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.orig_filing_fees IS '[ORIG_FILING_FEES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.unamort_filing_fees IS '[UNAMORT_FILING_FEES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.orig_dealer_fees IS '[ORIG_DEALER_FEES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.unamort_dealer_fees IS '[UNAMORT_DEALER_FEES] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.asset_brand IS '[ASSET_BRAND] Asset brand. Mostly "None"/"General"/blank; few real makes. Low reliability.';
COMMENT ON COLUMN vervent_contracts.prin_pd_ltd IS '[PRIN_PD_LTD] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.int_rate IS '[INT_RATE] Interest rate as a decimal fraction (0.01762 = 1.762%). Contains a sentinel -21474.83648 (integer overflow) - exclude.';
COMMENT ON COLUMN vervent_contracts.leased_equip IS '[LEASED EQUIP] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.accum_depr IS '[ACCUM DEPR] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.unbilled_oper_rec IS '[UNBILLED OPER REC] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.def_oper_lease_rev IS '[DEF OPER LEASE REV] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.unbilled_oper_inc IS '[UNBILLED OPER INC] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr2_unamort_reg_fee IS '[IDR2_UNAMORT_REG_FEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr3_unamort_dlr_subsidy IS '[IDR3_UNAMORT_DLR_SUBSIDY] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.open_comm IS '[OPEN COMM] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idc2_susp_dlr_fee IS '[IDC2_SUSP_DLR_FEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr2_orig_reg_fee IS '[IDR2_ORIG_REG_FEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr2_susp_reg_fee IS '[IDR2_SUSP_REG_FEE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr3_orig_dlr_subsidy IS '[IDR3_ORIG_DLR_SUBSIDY] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr3_susp_dlr_subsidy IS '[IDR3_SUSP_DLR_SUBSIDY] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.idr4_susp_open_comm IS '[IDR4_SUSP_OPEN_COMM] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_1 IS '[CONTR UDF 1] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_2 IS '[CONTR UDF 2] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_3 IS '[CONTR UDF 3] Contract user-defined field 3: remit/branch code (5001; 50001 appears to be a typo).';
COMMENT ON COLUMN vervent_contracts.contr_udf_4 IS '[CONTR UDF 4] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_5 IS '[CONTR UDF 5] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_6 IS '[CONTR UDF 6] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_7 IS '[CONTR UDF 7] Contract UDF 7: Y/N flag.';
COMMENT ON COLUMN vervent_contracts.contr_udf_8 IS '[CONTR UDF 8] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_9 IS '[CONTR UDF 9] Contract UDF 9: "20N" (3 rows).';
COMMENT ON COLUMN vervent_contracts.contr_udf_10 IS '[CONTR UDF 10] Contract UDF 10: Y/N flag.';
COMMENT ON COLUMN vervent_contracts.field10_s IS '[field10_s] Y/N flag (mixed case "n"). Companion of CONTR UDF 10.';
COMMENT ON COLUMN vervent_contracts.contr_udf_11 IS '[CONTR UDF 11] Contract UDF 11: mix of Y/N and dollar amounts (10 rows). Unreliable.';
COMMENT ON COLUMN vervent_contracts.contr_udf_12 IS '[CONTR UDF 12] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_13 IS '[CONTR UDF 13] Contract UDF 13: dollar amount (1,023 rows).';
COMMENT ON COLUMN vervent_contracts.contr_udf_14 IS '[CONTR UDF 14] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_15 IS '[CONTR UDF 15] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_16 IS '[CONTR UDF 16] Contract UDF 16: bankruptcy/collection code (B3XX, B7XX, B7DC).';
COMMENT ON COLUMN vervent_contracts.contr_udf_17 IS '[CONTR UDF 17] Contract UDF 17: single value 10000.';
COMMENT ON COLUMN vervent_contracts.contr_udf_18 IS '[CONTR UDF 18] Contract UDF 18: dollar amount, commonly round values (10000, 12000, 15000) - likely annual mileage allowance or similar limit.';
COMMENT ON COLUMN vervent_contracts.contr_udf_19 IS '[CONTR UDF 19] Contract UDF 19: rate stored as text (e.g. 0.22, 0.20, 0.25) - likely excess-mileage charge per mile.';
COMMENT ON COLUMN vervent_contracts.contr_udf_20 IS '[CONTR UDF 20] Contract UDF 20: 8 rows, values 0.22 / N.';
COMMENT ON COLUMN vervent_contracts.contr_udf_20_1 IS '[CONTR UDF 20 1] Duplicate-named UDF 20 column: 8 rows, values 200.22 / 20N (appears to be data-entry noise).';
COMMENT ON COLUMN vervent_contracts.contr_udf_21 IS '[CONTR UDF 21] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_22 IS '[CONTR UDF 22] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_23 IS '[CONTR UDF 23] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_24 IS '[CONTR UDF 24] Contract UDF 24: Y/N flag (mixed case).';
COMMENT ON COLUMN vervent_contracts.contr_udf_25 IS '[CONTR UDF 25] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_26 IS '[CONTR UDF 26] Contract UDF 26: single value.';
COMMENT ON COLUMN vervent_contracts.contr_udf_27 IS '[CONTR UDF 27] Contract UDF 27: legacy/original contract number (numeric tail of LEASE NO for most rows).';
COMMENT ON COLUMN vervent_contracts.contr_udf_28 IS '[CONTR UDF 28] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_29 IS '[CONTR UDF 29] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_30 IS '[CONTR UDF 30] Contract UDF 30: small integer count (1-34).';
COMMENT ON COLUMN vervent_contracts.contr_udf_31 IS '[CONTR UDF 31] Contract UDF 31: dollar amount stored as text.';
COMMENT ON COLUMN vervent_contracts.contr_udf_32 IS '[CONTR UDF 32] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_33 IS '[CONTR UDF 33] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_34 IS '[CONTR UDF 34] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_35 IS '[CONTR UDF 35] Contract UDF 35: CLNT / BKPT (client / bankruptcy) code.';
COMMENT ON COLUMN vervent_contracts.contr_udf_36 IS '[CONTR UDF 36] Contract UDF 36: dollar amount; same values as MARK_UP.';
COMMENT ON COLUMN vervent_contracts.contr_udf_37 IS '[CONTR UDF 37] Contract UDF 37: small rate/factor (0.00167-0.22), likely a money factor.';
COMMENT ON COLUMN vervent_contracts.contr_udf_38 IS '[CONTR UDF 38] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.contr_udf_39 IS '[CONTR UDF 39] Contract UDF 39: Y/N flag.';
COMMENT ON COLUMN vervent_contracts.contr_udf_40 IS '[CONTR UDF 40] Contract UDF 40: dollar amount.';
COMMENT ON COLUMN vervent_contracts.contr_udf_41 IS '[CONTR UDF 41] Contract UDF 41: dollar amount.';
COMMENT ON COLUMN vervent_contracts.contr_udf_42 IS '[CONTR UDF 42] Contract UDF 42: dollar amount (4,982 rows).';
COMMENT ON COLUMN vervent_contracts.contr_udf_60 IS '[CONTR UDF 60] Contract UDF 60: credit score-like value (629-879).';
COMMENT ON COLUMN vervent_contracts.contr_udf_61 IS '[CONTR UDF 61] Contract UDF 61: phone type (BUS/CELL) mixed with other values.';
COMMENT ON COLUMN vervent_contracts.contr_udf_62 IS '[CONTR UDF 62] Contract UDF 62: Y/N or phone numbers (mixed).';
COMMENT ON COLUMN vervent_contracts.contr_udf_63 IS '[CONTR UDF 63] Contract UDF 63: phone type (CELL/HOME/BUS, mixed case).';
COMMENT ON COLUMN vervent_contracts.contr_udf_64 IS '[CONTR UDF 64] Contract UDF 64: Y/N mixed with numbers.';
COMMENT ON COLUMN vervent_contracts.mod_reason IS '[Mod_Reason] Reason for contract modification (free text, e.g. DECEASED, customer request).';
COMMENT ON COLUMN vervent_contracts.mod_date IS '[Mod_Date] Modification date, YYMMDD integer. Source format YYMMDD.';
COMMENT ON COLUMN vervent_contracts.as_of_date IS '[AS_OF_DATE] Extract as-of date (11/11/2026 for every row). Source format MM/DD/YYYY.';
COMMENT ON COLUMN vervent_contracts.source IS '[SOURCE] Source system/product line. Always VEH (vehicle).';
COMMENT ON COLUMN vervent_contracts.business_history IS '[Business History] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.employment IS '[Employment] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.marital_status IS '[Marital Status] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.living_status IS '[Living Status] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.income_bracket IS '[Income Bracket] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.debt_payments IS '[Debt Payments] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.payment_history IS '[Payment History] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.credit_applications IS '[Credit Applications] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.credit_score_question IS '[Credit Score Question] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.reg_fee_income IS '[REG_FEE_INCOME] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.interim_fee_income IS '[INTERIM_FEE_INCOME] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.oper_lease_inc IS '[OPER_LEASE_INC] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.depreciation_expense IS '[DEPRECIATION EXPENSE] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.curr_contract_rcvbl IS '[CURR CONTRACT RCVBL] Current contract receivable (billed + unbilled), USD; can be negative.';
COMMENT ON COLUMN vervent_contracts.remaining_payments IS '[REMAINING PAYMENTS] Number of remaining payments (6 decimals). Contains outliers (negative values and >2,000,000) - validate before use.';
COMMENT ON COLUMN vervent_contracts.down IS '[DOWN] Down payment. Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.salesperson IS '[SALESPERSON] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.doc_app_off IS '[DOC_APP_OFF] Not populated in this extract.';
COMMENT ON COLUMN vervent_contracts.total_past_due IS '[TOTAL PAST DUE] Total past-due amount, USD. Same as PAST DUE RECEIVABLES.';
COMMENT ON COLUMN vervent_contracts.prin_rcvbl IS '[PRIN_RCVBL] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.int_rcvbl IS '[INT_RCVBL] Always 0 in this extract.';
COMMENT ON COLUMN vervent_contracts.accr_prin IS '[ACCR_PRIN] Accrued principal, USD. Same as ACCRUED_PRIN.';
COMMENT ON COLUMN vervent_contracts.net_yield IS '[NET YIELD] Net yield (annual %, 10 decimals).';
COMMENT ON COLUMN vervent_contracts.est_payoff IS '[EST PAYOFF] Estimated payoff amount as of the extract date, USD.';
COMMENT ON COLUMN vervent_contracts.credit_score IS '[CREDIT SCORE] Lessee credit score at origination (472-899).';
COMMENT ON COLUMN vervent_contracts.source_file IS 'Name of the CSV file the row was loaded from.';
COMMENT ON COLUMN vervent_contracts.file_date IS 'Business date from the file-name prefix (YYYYMMDD_...). On upsert tables, guards against overwriting newer data with an older file.';
COMMENT ON COLUMN vervent_contracts.loaded_at IS 'Timestamp the row was inserted or last updated.';
