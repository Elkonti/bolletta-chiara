"""Turn the newest Portale Offerte files in data/ into the small JSON the
website loads (site/data/offers.json). Keeps household fixed-price
electricity offers and only what the calculator needs; field codes follow the
SII spec "Trasmissione Offerte Mercato Retail" v5.0.

Exits with an error, and writes nothing, when the data looks wrong, so a bad
day at the source never replaces a good file on the site."""
import glob, json, os, sys, datetime, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "site", "data", "offers.json")
MIN_OFFERS = 150            # a normal day has 400+; far fewer means a broken file

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
                              "vat": txt(s, "IVA_SCONTO") != "02", "name": txt(s, "NOME")})
    zones = [z for z in o.iter() if tag(z) == "ZoneOfferta"]
    words = " ".join((x.text or "") for x in o.iter() if tag(x) in ("NOME_OFFERTA", "DESCRIZIONE")).lower()
    return {
        "id": txt(o, "IdentificativiOfferta/PIVA_UTENTE") + "/" + txt(o, "IdentificativiOfferta/COD_OFFERTA"),
        "name": txt(o, "DettaglioOfferta/NOME_OFFERTA"),
        "site": txt(o, "DettaglioOfferta/Contatti/URL_SITO_VENDITORE"),
        "url": txt(o, "DettaglioOfferta/Contatti/URL_OFFERTA"),
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
    offers = [offer(o) for o in ET.parse(offers_file).getroot()
              if txt(o, "DettaglioOfferta/TIPO_CLIENTE") == "01" and txt(o, "DettaglioOfferta/TIPO_OFFERTA") == "01"]

    missing = [k for k in ("sigma1", "sigma2", "sigma3", "uc6s_d", "uc6p_d", "asos_dr", "arim_dr",
                           "acc_c_r_l", "iva_c", "cdispd") if k not in params]
    if missing:
        sys.exit(f"Parameters file is missing {missing}: not publishing")
    if len(offers) < MIN_OFFERS:
        sys.exit(f"Only {len(offers)} household fixed offers (expected {MIN_OFFERS}+): not publishing")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"date": f"{day[:4]}-{day[4:6]}-{day[6:]}",
                   "built": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes"),
                   "source": "ARERA – Portale Offerte, open data",
                   "params": params, "offers": offers}, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print(f"{len(offers)} offers for {day} → {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1e3:.0f} kB)")

if __name__ == "__main__":
    main()
