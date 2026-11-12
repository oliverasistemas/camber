#!/usr/bin/env python3
"""Generate synthetic Vervent P50 mock data as JSON.

Every row carries every column from ../sql/0*_vervent_*.sql (snake_case, as the
tables store them), so the JSON looks like a `SELECT *` from those tables.
All names, addresses, VINs and amounts are fabricated; nothing is copied from the
real extracts. Codes (statuses, transaction codes, vectors) use values observed in
the extracts so the data behaves like the real thing.

    python3 generate_mock.py            # writes contracts.json, assets.json, transactions.json
    python3 generate_mock.py --contracts 200 --seed 7
"""

import argparse
import json
import random
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SQL_DIR = HERE.parent / "sql"
AS_OF = date(2026, 11, 11)
LOADED_AT = datetime(2026, 11, 11, 6, 0, tzinfo=timezone.utc).isoformat()

FIRST = ["James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "Daniel",
         "Elizabeth", "Kevin", "Susan", "Brian", "Angela", "Jason", "Nicole", "Eric", "Rachel",
         "Tyler", "Megan", "Marcus", "Tanya", "Owen", "Priya", "Luis", "Grace"]
LAST = ["Harlow", "Benton", "Mercer", "Okafor", "Lindqvist", "Ramirez", "Castell", "Whitford",
        "Dunmore", "Pryor", "Navarro", "Kessler", "Ashby", "Vance", "Moreau", "Talbot", "Quinlan",
        "Reyes", "Holloway", "Strand"]
BUSINESSES = ["Gateway Plumbing LLC", "Riverbend Landscaping Inc", "Northside Electric Co",
              "Clayton Catering LLC", "Meramec Hauling Inc", "Brightline HVAC LLC",
              "Oak Hollow Builders Inc", "Lakeside Floral Co"]
STREETS = ["Maple Ave", "Oak St", "Cedar Ln", "Ridge Rd", "Lakeview Dr", "Sycamore Ct",
           "Highland Blvd", "Willow Way", "Elm St", "Briar Path"]
# (state, county, city, zip)
PLACES = [("MO", "ST LOUIS", "SAINT LOUIS", "63101"), ("MO", "ST LOUIS", "CHESTERFIELD", "63017"),
          ("MO", "ST CHARLES", "O'FALLON", "63366"), ("MO", "JEFFERSON", "ARNOLD", "63010"),
          ("MO", "JACKSON", "KANSAS CITY", "64105"), ("MO", "GREENE", "SPRINGFIELD", "65806"),
          ("IL", "ST CLAIR", "BELLEVILLE", "62220"), ("IL", "MADISON", "EDWARDSVILLE", "62025"),
          ("IL", "COOK", "CHICAGO", "60601"), ("FL", "ORANGE", "ORLANDO", "32801"),
          ("TX", "TRAVIS", "AUSTIN", "78701"), ("MA", "NORFOLK", "WALPOLE", "02081")]
DEALERS = [(130001, "Gateway Auto Leasing", "SAINT LOUIS", "MO", "63110"),
           (130002, "Midwest Fleet Sales", "CHESTERFIELD", "MO", "63005"),
           (130003, "Riverfront Imports", "BELLEVILLE", "IL", "62221"),
           (130004, "Heartland Motor Leasing", "KANSAS CITY", "MO", "64108")]
VEHICLES = [("TOYOTA", "SEQUOIA", "GAS"), ("FORD", "TRANSIT", "GAS"), ("JEEP", "WRANGLER", "GAS"),
            ("KIA", "TELLURIDE", "GAS"), ("TESLA", "MODEL Y", "ELECTRIC"), ("FORD", "F-150", "GAS"),
            ("CHEVROLET", "SILVERADO", "DIESEL"), ("HONDA", "CR-V", "HYBRID"),
            ("RIVIAN", "R1S", "ELECTRIC"), ("BMW", "X5", "GAS")]
ACTIVE_STATUSES = ["ANOR", "AEXT", "AXFR", "ARBK"]
CLOSED_STATUSES = ["NPMT", "NPER", "NMAT"]
TAX_CODES = ["ALL", "NOEX", "NOPF", "STCN", "STCI", "PERM"]
DELINQ_BUCKETS = [(30, "1-30"), (60, "31-60"), (90, "61-90"), (120, "91-120"), (150, "121-150"),
                  (180, "151-180")]

# (trans code, description, debit vector, credit vector, is_non_cash, amount field, operator)
TXN_TYPES = [
    (301, "ACCRUAL NORMAL CYCLE", 624, 523, True, None, "EOP"),
    (351, "ACC REV NORMAL CYCLE", 523, 624, True, None, "EOP"),
    (200, "PAYMENT NORMAL", 3, 5, False, "payment", "LPI"),
    (202, "PARTIAL PAYMENT", 3, 5, False, "payment", "SMR"),
    (242, "PAYMENT USE TAX", 11, 53, False, "sales_tax", "LPI"),
    (226, "PAYMENT PROPERTY TAX", 129, 84, False, "property_tax", "ZER"),
    (220, "PAYMENT LATE CHARGE", 3, 80, False, "late_charge", "NAN"),
    (248, "PRE-PAYMENT", 3, 34, False, "prepayment", "LPI"),
]


def sql_columns(path):
    """[(column, sql_type)] from a CREATE TABLE file, in table order."""
    body = path.read_text().split("(", 1)[1].rsplit(");", 1)[0]
    cols = []
    for line in body.splitlines():
        m = re.match(r'\s+("?[a-z_0-9]+"?)\s+([a-z]+(?:\(\d+,\d+\))?)', line)
        if m and m.group(1).upper() not in {"PRIMARY", "CONSTRAINT"}:
            cols.append((m.group(1).strip('"'), m.group(2)))
    return cols


def blank_row(cols):
    """Unpopulated columns: 0 for money/rates (as in the extracts), null for everything else."""
    return {c: (0 if t.startswith("numeric") else None) for c, t in cols}


def iso(d):
    return d.isoformat() if d else None


def money(x):
    return round(x, 2)


def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, min(d.day, 28))


def vin(rng):
    chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"
    return "".join(rng.choice(chars) for _ in range(17))


def phone(rng):
    return f"{rng.choice([314, 636, 618, 816])}{rng.randint(2000000, 9999999)}"


class Generator:
    def __init__(self, seed):
        self.rng = random.Random(seed)
        self.c_cols = sql_columns(SQL_DIR / "01_vervent_contracts.sql")
        self.a_cols = sql_columns(SQL_DIR / "02_vervent_assets.sql")
        self.t_cols = sql_columns(SQL_DIR / "03_vervent_transactions.sql")
        self.contracts, self.assets, self.transactions = [], [], []
        self.next_account = 2000000000100
        self.next_customer = 2000000002600
        self.next_asset = 150000
        self.next_txn = 2000021540000

    def lessee(self):
        r = self.rng
        place = r.choice(PLACES)
        business = r.random() < 0.2
        name = r.choice(BUSINESSES) if business else f"{r.choice(FIRST)} {r.choice('ABCDEFGHJKLMNPRSTW')}. {r.choice(LAST)}"
        return {
            "lessee_no": r.randint(124000, 129999),
            "name": name.upper(),
            "address": f"{r.randint(100, 19999)} {r.choice(STREETS)}".upper(),
            "state": place[0], "county": place[1], "city": place[2], "zip": place[3],
            "business": business,
        }

    def contract(self, lease_no, who, dealer, vehicle, *, deficiency_of=None):
        r = self.rng
        c = blank_row(self.c_cols)
        is_def = deficiency_of is not None
        if is_def:
            commence = deficiency_of["closed"] + timedelta(days=r.randint(10, 60))
            term = 1
            cost = money(r.uniform(800, 9000))
            rate = 0.0
            pmt = cost
        else:
            commence = AS_OF - timedelta(days=r.randint(60, 1800))
            term = r.choice([24, 36, 39, 42, 48, 60])
            cost = money(r.uniform(18000, 72000))
            rate = round(r.uniform(4.5, 12.5), 7)
            pmt = money(cost * (rate / 1200) / (1 - (1 + rate / 1200) ** -term))
        maturity = add_months(commence, term)
        months_elapsed = (AS_OF.year - commence.year) * 12 + AS_OF.month - commence.month - (AS_OF.day < min(commence.day, 28))
        months_elapsed = max(0, min(term, months_elapsed))

        closed = is_def and r.random() < 0.3 or (not is_def and r.random() < 0.45)
        if closed:
            status = r.choice(["NPMT"] if is_def else CLOSED_STATUSES)
            closed_on = min(AS_OF - timedelta(days=r.randint(5, 400)), maturity)
            closed_on = max(closed_on, commence + timedelta(days=30))
        else:
            status = r.choice(["ANOR"] if is_def else ACTIVE_STATUSES)
            closed_on = None

        days_del = 0 if closed or r.random() < 0.8 else r.choice([12, 25, 41, 67, 95, 133, 170, 210])
        bucket = next((b for lim, b in DELINQ_BUCKETS if days_del and days_del <= lim), "181+" if days_del > 180 else None)
        remaining_pmts = 0 if closed else max(term - months_elapsed, 1)
        remaining = money(pmt * remaining_pmts)
        past_due = money(pmt * (days_del // 30 + (1 if days_del else 0)))
        residual = 0 if is_def else money(cost * r.uniform(0.25, 0.45))
        unearned = money(max(pmt * term - cost, 0))
        last_paid = (closed_on or AS_OF - timedelta(days=days_del + r.randint(0, 25))) if months_elapsed else None
        next_due = None if closed else add_months(commence, months_elapsed + 1)
        book = commence + timedelta(days=r.randint(0, 20))

        c.update({
            "account_key": self.next_account, "customer_key": self.next_customer,
            "account_group_key": "EDEF" if is_def else "V", "account_class_key": 2000000003039,
            "book_date_key": iso(book), "lease_date_key": iso(commence), "current_date_key": iso(commence),
            "maturity_date_key": iso(maturity), "payoff_date_key": iso(closed_on) if status == "NPER" else None,
            "last_activity_date_key": iso(last_paid or book), "commencement_date_key": iso(commence),
            "accrued_through_date_key": iso(next_due), "next_billing_date_key": iso(next_due),
            "closed_date_key": iso(closed_on),
            "last_billing_date_key": iso(add_months(commence, months_elapsed)) if months_elapsed else None,
            "next_accrual_cutoff_date_key": iso(add_months(next_due, 1)) if next_due else None,
            "last_due_date_key": iso(add_months(commence, months_elapsed)) if months_elapsed else None,
            "last_paid_date_key": iso(last_paid), "next_due_date_key": iso(next_due),
            "port": 50, "comp": r.choice([1, 1, 1, 2]), "reg": 1,
            "off": "DEF" if is_def else r.choice(["100"] * 12 + ["CO"]),
            "lease_no": lease_no, "lessee_no": who["lessee_no"],
            "ls_status": status, "ls_status_date": iso(closed_on or AS_OF - timedelta(days=r.randint(1, 300))),
            "account_status": "Closed" if closed else "Active", "is_account_open": not closed,
            "book_date": iso(book), "last_update": iso(AS_OF - timedelta(days=r.randint(0, 14))),
            "lease_date": iso(commence), "commence_date": iso(commence), "maturity_date": iso(maturity),
            "maturity_date_ss": iso(maturity), "last_paid_date": iso(last_paid), "next_due": iso(next_due),
            "accrued_to_date": iso(next_due),
            "accrual_method": "RAPR" if is_def else "AAPR",
            "business_personal": "B" if who["business"] else "P",
            "class": "EDEF" if is_def else "V", "ls_type": "INSL" if is_def else "FIN",
            "ls_form": str(r.choice([5001, 5005, 5010])), "stmt_code": r.choice("IIIIN"),
            "use_tax_code": r.choice(TAX_CODES),
            "late_code": "NONE" if is_def else r.choice(["PMAX", "PMAX", "PERC"]),
            "late_chg_y_n": "N" if is_def else "Y", "grace_days": 10,
            "lessor_yield": rate, "early_payoff_discount_rate": 0, "irr": round(rate * 0.85, 7),
            "lessee_name": who["name"], "lessee_state": who["state"], "lessee_remit_code": "5001",
            "oec": cost, "orig_cost": cost, "orig_unearned": unearned,
            "orig_ue_resid": money(residual * 0.15), "tot_residual": residual, "guar_resid": residual,
            "term": term, "contract_rcvbl": money(pmt * term),
            "outstanding_a_r": past_due, "outstanding_a_r_ss": past_due,
            "net_o_s_a_r": past_due, "net_o_s_a_r_1": past_due,
            "remaining_receivables": remaining,
            "remaining_interest": money(unearned * remaining_pmts / term) if term else 0,
            "past_due_receivables": past_due,
            "nbv": 0 if closed else money(remaining + residual - unearned * remaining_pmts / term),
            "accrued_prin": 0 if closed else money(remaining * 0.9),
            "first_asset_desc": vehicle["description"],
            "booked_down": money(r.choice([0, 0, 500, 1000, 2500])),
            "pap": r.random() < 0.6, "pap_eff_date": iso(commence),
            "dealer": dealer[0], "dlr_name": dealer[1].upper(), "dal_phone1": phone(r),
            "dal_addr1": f"{r.randint(1000, 9999)} {r.choice(STREETS)}".upper(),
            "dal_city": dealer[2], "dal_state": dealer[3], "dal_zip": dealer[4],
            "equip_location": who["state"],
            "days_del": days_del, "days_del_ss": days_del, "curr_delinq": bucket, "curr_delinq_ss": bucket,
            "del_30_count": r.choice([0, 0, 0, 1, 2, 4]), "del_60_count": r.choice([0, 0, 0, 1]),
            "del_90_count": 0, "del_91_plus_count": 1 if days_del > 90 else 0,
            "mark_up": 200 if not is_def else 0, "curr_mo_rental": money(pmt * 0.06),
            "ls_source": "DEFB" if is_def else r.choice(["VEND"] * 9 + ["DRCT"]),
            "curr_pymt": pmt, "pymt_freq": "MON",
            "broker": dealer[0] + 1, "broker_name": dealer[1].upper(), "asset_brand": "None",
            "prin_pd_ltd": money(cost - remaining * 0.9) if not closed else cost, "int_rate": 0,
            "contr_udf_13": 0, "contr_udf_30": int(lease_no.rstrip("D")[-5:]),
            "contr_udf_19": "5001", "contr_udf_25": r.choice("YN"), "contr_udf_26": r.choice("YN"),
            "mod_reason": None, "mod_date": None, "as_of_date": iso(AS_OF), "source": "VEH",
            "curr_contract_rcvbl": remaining, "remaining_payments": float(remaining_pmts),
            "total_past_due": past_due, "accr_prin": 0 if closed else money(remaining * 0.9),
            "net_yield": rate, "est_payoff": 0 if closed else money(remaining * 0.93 + residual),
            "credit_score": None if is_def else r.randint(560, 830),
            "source_file": "20261111_ContractSummary_Daily_P50.csv", "file_date": iso(AS_OF),
            "loaded_at": LOADED_AT,
        })
        c["down"] = c["booked_down"]
        self.next_account += 1
        self.next_customer += 1
        self.contracts.append(c)
        return {"row": c, "commence": commence, "closed": closed_on, "pmt": pmt, "cost": cost,
                "residual": residual, "status": status, "term": term, "is_def": is_def}

    def asset(self, lease_no, who, dealer, vehicle, k, orig_lease=None):
        r = self.rng
        a = blank_row(self.a_cols)
        is_def = k["is_def"]
        closed = k["closed"]
        if is_def:
            status = "NLSE"
        elif closed:
            status = "USLD" if k["status"] in ("NPER", "NMAT") else r.choice(["USLD", "URIN"])
        else:
            status = "ULSE" if r.random() < 0.15 else "NLSE"
        rental = 0 if is_def else round(k["pmt"] * r.uniform(5, 30), 12)
        a.update({
            "state": who["state"], "county": who["county"], "lease": lease_no,
            "asset_no": self.next_asset, "port": 50, "comp": k["row"]["comp"], "reg": 1,
            "off": k["row"]["off"], "name": who["name"], "address": who["address"],
            "city": who["city"], "zip": who["zip"], "term": k["term"],
            "ls_type": k["row"]["ls_type"], "description": vehicle["description"] if not is_def else "DEFICIENCY BALANCE",
            "in_svc_date": iso(k["commence"]), "acquis_date": iso(k["commence"]),
            "sold_date": iso(closed) if status == "USLD" else None,
            "orig_cost": 0.01 if is_def else k["cost"], "status": status,
            "status_date": iso(closed or k["commence"]),
            "dealer": dealer[0], "dealer_name": dealer[1].upper(), "contr_status": k["status"],
            "udf_13": float(r.choice([35420, 43410, 51200])),
            "tax_type": "SALE" if is_def else "TLA", "tax_code": k["row"]["use_tax_code"],
            "class": k["row"]["class"],
            "orig_rcvbl": 0.01 if is_def else money(k["cost"] * 0.6), "residual": k["residual"],
            "guaranteed": 0, "lessee_no": who["lessee_no"], "inventory": 0.01 if is_def else 0,
            "orig_contr_no": orig_lease,
            "rental_income": rental, "resi_income": round(rental * 0.4, 12),
            "interest_income": round(rental * 0.01, 12),
            "sale_proceeds": money(k["residual"] * r.uniform(0.9, 1.2)) if status == "USLD" else 0,
            "asset_as_sched": 1.0, "account_payable": 0,
            "serial_number": None if is_def else vin(r),
            "title_state": None if is_def else who["state"],
            "title_number": None if is_def else str(r.randint(10**10, 10**11 - 1)),
            "eheld_lessee": vehicle["year"], "eheld_return": vehicle["make"], "model": vehicle["model"],
            "fuel_type": None if is_def else vehicle["fuel"],
            "orig_asset_no": int(lease_no.rstrip("D")[-5:]), "orig_lease_no": int(lease_no.rstrip("D")[-5:]),
            "curr_repo_status": "RTCS" if status == "USLD" and r.random() < 0.5 else None,
            "allow_ppt_assmt": "Y", "report_ppt": "N" if is_def else r.choice("YN"),
            "source_file": "20261111_AssetSummary_Daily_P50.csv", "file_date": iso(AS_OF),
            "loaded_at": LOADED_AT,
        })
        self.next_asset += 1
        self.assets.append(a)

    def txn(self, k, who, kind, when, amount=None):
        r = self.rng
        code, desc, dv, cv, non_cash, field, ops = kind
        t = blank_row(self.t_cols)
        if amount is None:
            amount = {None: k["pmt"] * 0.02, "payment": k["pmt"], "sales_tax": k["pmt"] * 0.08,
                      "property_tax": r.uniform(80, 900), "late_charge": min(k["pmt"] * 0.05, 50),
                      "prepayment": k["pmt"] * r.uniform(0.5, 2)}[field]
        amount = money(amount)
        row = k["row"]
        t.update({
            "transaction_key": self.next_txn, "portfolio": 50,
            "report_key": f"50 {row['comp']} 1 {row['off']}",
            "transaction_date_key": iso(when),
            "effective_date_key": None if non_cash else iso(when),
            "date_due_date_key": None if non_cash else iso(when + timedelta(days=14)),
            "is_payoff": code == 500, "is_non_cash": non_cash,
            "is_past_due": bool(row["days_del"]) and not non_cash,
            "is_cash_report_transaction": not non_cash and r.random() < 0.3,
            "contract_number": row["lease_no"], "name": who["name"], "description": desc,
            "trans": code, "bank_cd": None, "debit_vector": dv, "credit_vector": cv,
            "check_no": None if non_cash else str(r.randint(10000, 99999)),
            "posted_date": iso(when), "invoice_due_date": None if non_cash else iso(when + timedelta(days=14)),
            "transaction_amount": amount, "payment_amount": 0 if non_cash else amount,
            "oper_inits": ops,
            "source_file": f"{when:%Y%m%d}_TransactionHistory_Daily_P50.csv", "file_date": iso(when),
            "loaded_at": LOADED_AT,
        })
        if field:
            t[field] = amount
        self.next_txn += 1
        self.transactions.append(t)

    def transactions_for(self, k, who):
        r = self.rng
        start = k["commence"]
        end = k["closed"] or AS_OF
        if not k["is_def"]:
            self.txn(k, who, (100, "NEW LEASE ADD", 7, 2, True, None, "SMR"), start, k["cost"])
        # Month-end accruals and payments over the last few months of the contract's life.
        month = max(start, end - timedelta(days=150))
        while month <= end:
            self.txn(k, who, TXN_TYPES[0], month)
            if r.random() < 0.05:
                self.txn(k, who, TXN_TYPES[1], month + timedelta(days=1))
            pay_day = month + timedelta(days=r.randint(1, 20))
            if pay_day <= end and not (k["row"]["days_del"] > 30 and pay_day > AS_OF - timedelta(days=k["row"]["days_del"])):
                main = TXN_TYPES[3] if r.random() < 0.1 else TXN_TYPES[2]
                self.txn(k, who, main, pay_day, k["pmt"] * (r.uniform(0.3, 0.8) if main[0] == 202 else 1))
                if k["row"]["use_tax_code"] != "NOEX":
                    self.txn(k, who, TXN_TYPES[4], pay_day)
                extra = r.random()
                if extra < 0.08:
                    self.txn(k, who, TXN_TYPES[6], pay_day)
                elif extra < 0.12:
                    self.txn(k, who, TXN_TYPES[5], pay_day)
                elif extra < 0.15:
                    self.txn(k, who, TXN_TYPES[7], pay_day)
            month = add_months(month, 1)
        if k["status"] == "NPER":
            self.txn(k, who, (500, "PAYOFF EARLY", 3, 5, False, "payoff", "MPO"), k["closed"],
                     k["cost"] * r.uniform(0.3, 0.7))

    def run(self, n):
        r = self.rng
        lease_numbers = r.sample(range(15000, 99999), n)
        for i, num in enumerate(lease_numbers):
            lease_no = f"50000{num:05d}"
            who = self.lessee()
            dealer = r.choice(DEALERS)
            make, model, fuel = r.choice(VEHICLES)
            year = str(r.randint(2016, 2026))
            vehicle = {"year": year, "make": make, "model": model, "fuel": fuel,
                       "description": f"{year} {make} {model}"}
            k = self.contract(lease_no, who, dealer, vehicle)
            self.asset(lease_no, who, dealer, vehicle, k)
            self.transactions_for(k, who)

            # Some repossessed/charged-off contracts leave a deficiency balance on a new "D" contract,
            # numbered by dropping one leading zero and appending D (5000069007 -> 500069007D).
            if k["closed"] and k["status"] == "NPMT" and r.random() < 0.6:
                d_no = f"5000{num:05d}D"
                dk = self.contract(d_no, who, dealer, vehicle, deficiency_of=k)
                dk["row"]["first_asset_desc"] = "DEFICIENCY BALANCE"
                self.asset(d_no, who, dealer, vehicle, dk, orig_lease=lease_no)
                self.transactions_for(dk, who)

        # A couple of orphan deficiency assets with no lease, as in the real extract.
        for _ in range(2):
            who = self.lessee()
            a = blank_row(self.a_cols)
            a.update({"state": who["state"], "county": who["county"], "asset_no": self.next_asset,
                      "port": 50, "comp": 1, "reg": 1, "off": "DEF", "address": who["address"],
                      "city": who["city"], "zip": who["zip"], "term": 1,
                      "description": "DEFICIENCY BALANCE",
                      "in_svc_date": iso(AS_OF - timedelta(days=40)),
                      "acquis_date": iso(AS_OF - timedelta(days=40)), "orig_cost": 0.01,
                      "status": "NLSE", "status_date": iso(AS_OF - timedelta(days=40)),
                      "tax_type": "SALE", "class": "EDEF", "inventory": 0.01,
                      "source_file": "20261111_AssetSummary_Daily_P50.csv", "file_date": iso(AS_OF),
                      "loaded_at": LOADED_AT})
            self.next_asset += 1
            self.assets.append(a)

        self.transactions.sort(key=lambda t: (t["transaction_date_key"], t["transaction_key"]))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--contracts", type=int, default=60, help="number of original (non-deficiency) contracts")
    p.add_argument("--seed", type=int, default=50)
    p.add_argument("--out", type=Path, default=HERE)
    args = p.parse_args()

    g = Generator(args.seed)
    g.run(args.contracts)
    for name, rows in [("contracts", g.contracts), ("assets", g.assets), ("transactions", g.transactions)]:
        path = args.out / f"{name}.json"
        path.write_text(json.dumps(rows, indent=2) + "\n")
        print(f"wrote {len(rows):>4} rows -> {path}")


if __name__ == "__main__":
    main()
