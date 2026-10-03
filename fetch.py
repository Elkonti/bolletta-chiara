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
