"""Download the day's electricity offers and parameters from the Portale Offerte
open data (https://www.ilportaleofferte.it/portaleOfferte/it/open-data.page).
Usage: python fetch.py [YYYYMMDD]   (default: today)"""
import os, sys, datetime, urllib.request

BASE = "https://www.ilportaleofferte.it/portaleOfferte/resources/opendata/csv"
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

day = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().strftime("%Y%m%d")
month = f"{day[:4]}_{day[4:6]}"
files = [
    f"offerteML/{month}/PO_Offerte_E_MLIBERO_{day}.xml",
    f"parametriML/{month}/PO_Parametri_Mercato_Libero_E_{day}.csv",
]
os.makedirs(DATA, exist_ok=True)
for path in files:
    target = os.path.join(DATA, os.path.basename(path))
    if os.path.exists(target):
        print("already have", os.path.basename(path))
        continue
    urllib.request.urlretrieve(f"{BASE}/{path}", target)
    print(f"saved {os.path.basename(path)} ({os.path.getsize(target) / 1e6:.1f} MB)")
