"""Yearly cost of every household fixed-price electricity offer on the
Portale Offerte, following the SII spec "Trasmissione Offerte Mercato Retail"
v5.0 (12/11/2025). Usage: python bill.py [kWh/year] [kW] [region] [province]

Independent reference for the website's calculator (site/calc.js):
tests/compare.mjs checks that both give the same totals."""
import sys, glob, os, statistics, xml.etree.ElementTree as ET

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
def newest(pattern):
    files = sorted(glob.glob(os.path.join(DATA, pattern)))
    if not files:
        sys.exit(f"No {pattern} in {DATA}: run python fetch.py first")
    return files[-1]
OFFERS = newest("PO_Offerte_E_MLIBERO_*.xml")
PARAMS = newest("PO_Parametri_Mercato_Libero_E_*.csv")
KWH = float(sys.argv[1]) if len(sys.argv) > 1 else 2700
KW = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
REGION = sys.argv[3] if len(sys.argv) > 3 else "03"      # ISTAT region code; 03 = Lombardia
PROVINCE = sys.argv[4] if len(sys.argv) > 4 else None   # ISTAT province code, e.g. 020 = Mantova
# Assumed household split over the time bands (not in the open data).
BANDS = {"01": 0.33, "02": 0.31, "03": 0.36}

P = {l.split(",")[0]: float(l.split(",")[1])
     for l in open(PARAMS, encoding="utf-8").read().splitlines()[1:]}

tag = lambda e: e.tag.split("}")[-1]
kids = lambda e, n: [c for c in e if tag(c) == n]
def txt(e, path):
    for p in path.split("/"):
        e = next((c for c in e if tag(c) == p), None)
        if e is None:
            return None
    return (e.text or "").strip()

def band_weights(tipologia_fasce):
    if tipologia_fasce == "01":                     # single rate
        return {"01": 1.0}
    if tipologia_fasce == "91":                     # F1 + (F2+F3)
        return {"01": BANDS["01"], "91": BANDS["02"] + BANDS["03"]}
    if tipologia_fasce == "03":                     # F1, F2, F3
        return dict(BANDS)
    return None                                     # peak/off-peak or custom bands: skipped

def in_tier(iv):
    lo, hi = txt(iv, "CONSUMO_DA"), txt(iv, "CONSUMO_A")
    return (not lo or KWH >= float(lo)) and (not hi or float(hi) == 0 or KWH <= float(hi))

def first_year(ivs):
    """Price for the first 12 months: intervals with DURATA < 12 weigh by their months."""
    timed = [(min(int(txt(i, "PeriodoValidita/DURATA")), 12), float(txt(i, "PREZZO")))
             for i in ivs if (txt(i, "PeriodoValidita/DURATA") or "-1").lstrip("-").isdigit()
             and 0 < int(txt(i, "PeriodoValidita/DURATA") or -1) < 12]
    rest = [float(txt(i, "PREZZO")) for i in ivs
            if not (0 < int(txt(i, "PeriodoValidita/DURATA") or -1) < 12)]
    if not timed:
        return statistics.mean(rest)
    used = sum(m for m, _ in timed)
    later = statistics.mean(rest) if rest else timed[-1][1]
    return (sum(m * p for m, p in timed) + (12 - used) * later) / 12

def cost(o):
    w = band_weights(txt(o, "TipoPrezzo/TIPOLOGIA_FASCE"))
    if w is None:
        return None
    energy = fixed = 0.0
    for c in kids(o, "ComponenteImpresa"):
        macro, typ = txt(c, "MACROAREA"), txt(c, "TIPOLOGIA")
        if macro == "06" and typ == "02":           # optional green energy: not in the estimate
            continue
        ivs = [i for i in kids(c, "IntervalloPrezzi") if in_tier(i)]
        if not ivs:
            continue
        unit = txt(ivs[0], "UNITA_MISURA")
        if unit == "03":                            # €/kWh, per band, losses included
            by_band = {}
            for i in ivs:
                by_band.setdefault(txt(i, "FASCIA_COMPONENTE") or "01", []).append(i)
            if set(by_band) == {"01"}:
                energy += first_year(by_band["01"]) * KWH
            elif set(w) <= set(by_band):
                energy += sum(first_year(by_band[b]) * share * KWH for b, share in w.items())
            else:
                return None
        elif unit == "01":                          # €/year
            fixed += first_year(ivs)
        elif unit == "02":                          # €/kW per year
            fixed += first_year(ivs) * KW
        elif unit == "05":                          # one-off €
            fixed += first_year(ivs)
        else:
            return None

    disp = 0.0
    for d in kids(o, "Dispacciamento"):
        code = txt(d, "TIPO_DISPACCIAMENTO")
        if code in ("01", "02", "14"):
            disp = max(disp, P["cdispd"] * KWH)     # household dispatch charge (CdispD)
        elif code == "99":
            disp += float(txt(d, "VALORE_DISP") or 0) * KWH

    discount_vat = discount_novat = 0.0
    for s in kids(o, "Sconto"):
        if txt(s, "Condizione/CONDIZIONE_APPLICAZIONE") != "00":   # conditional: not counted (spec)
            continue
        if txt(s, "VALIDITA") == "03":                             # only after 12 months
            continue
        for ps in kids(s, "PrezziSconto"):
            v, unit = float(txt(ps, "PREZZO")), txt(ps, "UNITA_MISURA")
            amount = {"01": v, "05": v, "02": v * KW, "03": v * KWH,
                      "06": v / 100 * (energy + fixed)}.get(unit, 0.0)
            if txt(s, "IVA_SCONTO") == "02":
                discount_novat += amount
            else:
                discount_vat += amount

    network = P["sigma1"] + P["sigma2"] * KW + P["sigma3"] * KWH + P["uc6s_d"] * KW + P["uc6p_d"] * KWH
    system = (P["asos_dr"] + P["arim_dr"]) * KWH
    monthly = KWH / 12
    exempt = KW <= 3 and monthly <= 150             # residential ≤3 kW, ≤150 kWh/month
    excise = 0.0 if exempt else P["acc_c_r_l"] * KWH  # 150–220 kWh/month partial rule not modelled
    taxable = energy + fixed + disp + network + system + excise - discount_vat
    vat = taxable * P["iva_c"]
    total = taxable + vat - discount_novat
    return dict(total=total, energy=energy, fixed=fixed, dispatch=disp, network=network,
                system=system, excise=excise, discount=discount_vat + discount_novat, vat=vat)

def available_here(o):
    zones = [z for z in o.iter() if tag(z) == "ZoneOfferta"]
    regions = {(x.text or "").strip() for z in zones for x in z.iter() if tag(x) == "REGIONE"}
    provinces = {(x.text or "").strip() for z in zones for x in z.iter() if tag(x) == "PROVINCIA"}
    if not regions and not provinces:
        return True                                 # no zones, or an empty section = all of Italy (spec)
    return REGION in regions or (PROVINCE is not None and PROVINCE in provinces)

def second_home(o):
    words = " ".join((x.text or "") for x in o.iter() if tag(x) in ("NOME_OFFERTA", "DESCRIZIONE")).lower()
    return "seconda casa" in words or "non resident" in words

rows, skipped, regional = [], 0, 0
for o in ET.parse(OFFERS).getroot():
    if txt(o, "DettaglioOfferta/TIPO_CLIENTE") != "01" or txt(o, "DettaglioOfferta/TIPO_OFFERTA") != "01":
        continue
    lo, hi = txt(o, "CaratteristicheOfferta/CONSUMO_MIN"), txt(o, "CaratteristicheOfferta/CONSUMO_MAX")
    if (lo and KWH < float(lo)) or (hi and float(hi) and KWH > float(hi)):
        continue
    if not available_here(o):
        regional += 1
        continue
    if second_home(o):                              # priced for residents here
        continue
    c = cost(o)
    if c is None or not (0.02 <= c["energy"] / KWH <= 1.0):   # malformed offers (e.g. €/MWh as €/kWh)
        skipped += 1
        continue
    c["key"] = txt(o, "IdentificativiOfferta/PIVA_UTENTE") + "/" + txt(o, "IdentificativiOfferta/COD_OFFERTA")
    c["name"] = txt(o, "DettaglioOfferta/NOME_OFFERTA")
    c["site"] = txt(o, "DettaglioOfferta/Contatti/URL_SITO_VENDITORE")
    c["months"] = txt(o, "DettaglioOfferta/DURATA")
    rows.append(c)

rows.sort(key=lambda r: r["total"])
if os.environ.get("BILL_JSON"):                     # reference output for tests/compare.mjs
    import json
    json.dump({r["key"]: round(r["total"], 2) for r in rows}, sys.stdout)
    sys.exit()
print(f"{KWH:.0f} kWh/year, {KW} kW, resident: {len(rows)} fixed offers priced in region {REGION}, {regional} only sold elsewhere, {skipped} unreadable")
pick = lambda q: rows[round(q * (len(rows) - 1))]
for label, r in [("cheapest", rows[0]), ("10%", pick(.1)), ("25%", pick(.25)),
                 ("median", pick(.5)), ("75%", pick(.75)), ("dearest", rows[-1])]:
    print(f"{label:8} €{r['total']:6.0f}  {r['total']/KWH:.3f} €/kWh  energy {r['energy']/KWH:.3f} €/kWh"
          f"  fee €{r['fixed']:.0f}  {r['months']} mo  {r['name'][:28]} ({r['site']})")
m = pick(.5)
print("median breakdown:", ", ".join(f"{k} €{m[k]:.0f}" for k in
      ("energy", "fixed", "network", "system", "dispatch", "excise", "discount", "vat")))
print("top 5:")
for r in rows[:5]:
    print(f"  €{r['total']:6.0f}  {r['name'][:40]}  ({r['site']})  energy {r['energy']/KWH:.4f} fee €{r['fixed']:.0f} disc €{r['discount']:.0f}")
