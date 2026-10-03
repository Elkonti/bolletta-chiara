"""Download the day's electricity offers and parameters from the Portale Offerte
open data (https://www.ilportaleofferte.it/portaleOfferte/it/open-data.page).
Usage: python fetch.py [YYYYMMDD]   (default: today, else yesterday if today's
files aren't published yet). Folder: $BOLLETTA_DATA or ./data"""
import os, sys, datetime, urllib.error, urllib.request

BASE = "https://www.ilportaleofferte.it/portaleOfferte/resources/opendata/csv"
DATA = os.environ.get("BOLLETTA_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

def paths(day):
    month = f"{day[:4]}_{day[4:6]}"
    return [f"offerteML/{month}/PO_Offerte_E_MLIBERO_{day}.xml",
            f"parametriML/{month}/PO_Parametri_Mercato_Libero_E_{day}.csv"]

# "Prezzi storici – indici a pubblica diffusione": monthly PUN since 2020, used to
# estimate variable-price offers. Optional: if it fails, fixed offers still publish.
INDEX_URL = "https://www.ilportaleofferte.it/portaleOfferte/resources/cms/documents/5d6f1085b4d5f20821af55764e647671.csv"

def get_index(day):
    target = os.path.join(DATA, f"PO_Indici_Storici_{day}.csv")
    if os.path.exists(target):
        return
    try:
        urllib.request.urlretrieve(INDEX_URL, target + ".part")
        os.replace(target + ".part", target)
        print(f"saved {os.path.basename(target)}")
    except (urllib.error.URLError, OSError) as e:
        print(f"index file not downloaded ({e}): variable offers use the previous one, if any")

def get(day):
    os.makedirs(DATA, exist_ok=True)
    for path in paths(day):
        target = os.path.join(DATA, os.path.basename(path))
        if os.path.exists(target):
            print("already have", os.path.basename(path))
            continue
        tmp = target + ".part"                      # a dropped download never looks complete
        urllib.request.urlretrieve(f"{BASE}/{path}", tmp)
        os.replace(tmp, target)
        print(f"saved {os.path.basename(path)} ({os.path.getsize(target) / 1e6:.1f} MB)")
    get_index(day)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        get(sys.argv[1])
    else:
        today = datetime.date.today()
        for day in (today, today - datetime.timedelta(days=1)):
            try:
                get(day.strftime("%Y%m%d"))
                break
            except urllib.error.HTTPError as e:
                print(f"{day}: not published yet ({e.code})")
        else:
            sys.exit("No files for today or yesterday")
