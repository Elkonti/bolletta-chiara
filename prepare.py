"""Turn the newest Portale Offerte files in data/ into the small JSON the
website loads (site/data/offers.json). Keeps household electricity
offers (fixed price, and variable price on the PUN) and only what the
calculator needs; field codes follow the
SII spec "Trasmissione Offerte Mercato Retail" v5.0.

Exits with an error, and writes nothing, when the data looks wrong, so a bad
day at the source never replaces a good file on the site."""
import glob, json, os, sys, datetime, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("BOLLETTA_DATA") or os.path.join(ROOT, "data")
OUT = os.environ.get("BOLLETTA_OUT") or os.path.join(ROOT, "site", "data", "offers.json")
MIN_OFFERS = 150            # a normal day has 400+ fixed offers; far fewer means a broken file
PUN_INDEXES = ("01", "12")  # IDX_PREZZO_ENERGIA: PUN, PUN Index GME (others not priced yet)
INDEX_MAX_AGE = 6           # months: an older index file leaves variable offers out

def newest(pattern):
    files = sorted(glob.glob(os.path.join(DATA, pattern)))
    if not files:
        sys.exit(f"No {pattern} in {DATA}: run python fetch.py first")
    return files[-1]

tag = lambda e: e.tag.split("}")[-1]
kids = lambda e, n: [c for c in e if tag(c) == n]
def txt(e, path):
    for p in path.split("/"):
        e = next((c for c in e if tag(c) == p), None)
        if e is None:
            return None
    return (e.text or "").strip()
num = lambda s: float(s) if s not in (None, "") else None

def pun_index(day):
    """Mean monthly PUN (€/kWh) over the last 12 months in the portal's historical
    index file. The portal itself uses forward prices that aren't open data, so
    variable offers are an estimate: "if prices stay as in the last 12 months"."""
    files = sorted(glob.glob(os.path.join(DATA, "PO_Indici_Storici_*.csv")))
    if not files:
        return None, "no index file"
    rows = [l.split(";") for l in open(files[-1], encoding="latin-1").read().splitlines()[1:]]
    pun = [(r[0], float(r[1].replace(",", "."))) for r in rows
           if len(r) > 1 and r[0].isdigit() and len(r[0]) == 6 and r[1].strip()]
    pun = sorted(pun)[-12:]
    if len(pun) < 12:
        return None, f"only {len(pun)} months of PUN"
    last = pun[-1][0]
    age = (int(day[:4]) - int(last[:4])) * 12 + int(day[4:6]) - int(last[4:6])
    if age > INDEX_MAX_AGE:
        return None, f"PUN data ends {last}, {age} months ago"
    values = [v for _, v in pun]
    if not all(0.02 <= v <= 1 for v in values):
        return None, "PUN values out of range"
    return {"pun": round(sum(values) / 12, 6), "from": pun[0][0], "to": last,
            "source": "Portale Offerte – Prezzi storici, indici a pubblica diffusione"}, None

def months(iv):
    d = txt(iv, "PeriodoValidita/DURATA")
    return int(d) if d and d.lstrip("-").isdigit() else None

def offer(o):
    comps = []
    for c in kids(o, "ComponenteImpresa"):
        if txt(c, "MACROAREA") == "06" and txt(c, "TIPOLOGIA") == "02":
            continue                                # optional green energy: not in the estimate
        ivs = [{"unit": txt(i, "UNITA_MISURA"), "band": txt(i, "FASCIA_COMPONENTE") or "01",
                "price": float(txt(i, "PREZZO")), "months": months(i),
                "from": num(txt(i, "CONSUMO_DA")), "to": num(txt(i, "CONSUMO_A"))}
               for i in kids(c, "IntervalloPrezzi")]
        if ivs:
            comps.append({"name": txt(c, "NOME"), "intervals": ivs})
    discounts = []
    for s in kids(o, "Sconto"):
        if txt(s, "Condizione/CONDIZIONE_APPLICAZIONE") != "00" or txt(s, "VALIDITA") == "03":
            continue                                # conditional, or only after 12 months
        for ps in kids(s, "PrezziSconto"):
            discounts.append({"unit": txt(ps, "UNITA_MISURA"), "value": float(txt(ps, "PREZZO")),
                              "vat": txt(s, "IVA_SCONTO") != "02", "name": txt(s, "NOME"),
                              "months": months(s), "from": num(txt(ps, "VALIDO_DA")),
                              "to": num(txt(ps, "VALIDO_FINO"))})
    zones = [z for z in o.iter() if tag(z) == "ZoneOfferta"]
    words = " ".join((x.text or "") for x in o.iter() if tag(x) in ("NOME_OFFERTA", "DESCRIZIONE")).lower()
    variable = txt(o, "DettaglioOfferta/TIPO_OFFERTA") == "02"
    return {
        "id": txt(o, "IdentificativiOfferta/PIVA_UTENTE") + "/" + txt(o, "IdentificativiOfferta/COD_OFFERTA"),
        "name": txt(o, "DettaglioOfferta/NOME_OFFERTA"),
        "site": txt(o, "DettaglioOfferta/Contatti/URL_SITO_VENDITORE"),
        "url": txt(o, "DettaglioOfferta/Contatti/URL_OFFERTA"),
        "variable": variable,
        "coef": (num(txt(o, "RiferimentiPrezzoEnergia/COEFFICIENTE")) or 1.0) if variable else None,
        "durationMonths": int(txt(o, "DettaglioOfferta/DURATA") or -1),
        "bands": txt(o, "TipoPrezzo/TIPOLOGIA_FASCE"),
        "kwhMin": num(txt(o, "CaratteristicheOfferta/CONSUMO_MIN")),
        "kwhMax": num(txt(o, "CaratteristicheOfferta/CONSUMO_MAX")),
        "regions": sorted({(x.text or "").strip() for z in zones for x in z.iter() if tag(x) == "REGIONE"}),
        "provinces": sorted({(x.text or "").strip() for z in zones for x in z.iter() if tag(x) == "PROVINCIA"}),
        "secondHome": "seconda casa" in words or "non resident" in words,
        "components": comps,
        "dispatch": [{"code": txt(d, "TIPO_DISPACCIAMENTO"), "value": num(txt(d, "VALORE_DISP"))}
                     for d in kids(o, "Dispacciamento")],
        "discounts": discounts,
        "conditions": [txt(c, "DESCRIZIONE") for c in kids(o, "CondizioniContrattuali")
                       if txt(c, "LIMITANTE") == "01"],
        "validUntil": (txt(o, "ValiditaOfferta/DATA_FINE") or "")[:10],
    }

def main():
    offers_file, params_file = newest("PO_Offerte_E_MLIBERO_*.xml"), newest("PO_Parametri_Mercato_Libero_E_*.csv")
    day = os.path.basename(offers_file).rsplit("_", 1)[1][:8]
    params = {l.split(",")[0]: float(l.split(",")[1])
              for l in open(params_file, encoding="utf-8").read().splitlines()[1:]}
    index, why = pun_index(day)
    if why:
        print(f"Variable offers left out: {why}")
    household = [o for o in ET.parse(offers_file).getroot() if txt(o, "DettaglioOfferta/TIPO_CLIENTE") == "01"]
    offers = [offer(o) for o in household if txt(o, "DettaglioOfferta/TIPO_OFFERTA") == "01"]
    fixed = len(offers)
    if index:
        offers += [offer(o) for o in household if txt(o, "DettaglioOfferta/TIPO_OFFERTA") == "02"
                   and txt(o, "RiferimentiPrezzoEnergia/IDX_PREZZO_ENERGIA") in PUN_INDEXES]

    missing = [k for k in ("sigma1", "sigma2", "sigma3", "uc6s_d", "uc6p_d", "asos_dr", "arim_dr",
                           "acc_c_r_l", "iva_c", "cdispd") if k not in params]
    if missing:
        sys.exit(f"Parameters file is missing {missing}: not publishing")
    if fixed < MIN_OFFERS:
        sys.exit(f"Only {fixed} household fixed offers (expected {MIN_OFFERS}+): not publishing")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"date": f"{day[:4]}-{day[4:6]}-{day[6:]}",
                   "built": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes"),
                   "source": "ARERA – Portale Offerte, open data",
                   "params": params, "index": index, "offers": offers}, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print(f"{fixed} fixed + {len(offers) - fixed} variable offers for {day} → {OUT} ({os.path.getsize(OUT) / 1e3:.0f} kB)")

if __name__ == "__main__":
    main()
