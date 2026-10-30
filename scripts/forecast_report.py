"""Forecast report in the console: metrics, tables and charts.

Calls the forecasting service the same way ForecastService.php does (GET with
X-API-Key), so the numbers are the ones iMAPS shows. The service has to be
running first on port 8002; from ../iMAPS-forecasting-service, either

    docker compose up -d                            # container iMAPS_forecast_microservice
    .venv/bin/uvicorn app.main:app --port 8002      # or without Docker

Then, from the iMAPS root:

    python3 scripts/forecast_report.py              # print metrics, open chart windows
    python3 scripts/forecast_report.py --top 48     # every barangay
    python3 scripts/forecast_report.py --save       # also write PNGs to storage/app/forecast-report/
    python3 scripts/forecast_report.py --save --no-show --json storage/app/forecast-report/response.json

FORECAST_SERVICE_URL and FORECAST_SERVICE_API_KEY are read from the
environment, falling back to .env. Needs only matplotlib.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SAVE_DIR = ROOT / "storage" / "app" / "forecast-report"

# Reference palette (dataviz skill): two categorical slots, validated together.
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e4e3df"
HISTORY = "#2a78d6"   # slot 1, blue
FORECAST = "#eb6834"  # slot 2, orange


def read_env(path: Path) -> dict:
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


def setting(name: str, env_file: dict, default: str = "") -> str:
    return os.environ.get(name) or env_file.get(name) or default


def service_settings() -> tuple[str, str, int]:
    """URL, API key and timeout, from the environment or iMAPS' .env."""
    env_file = read_env(ROOT / ".env")
    url = setting("FORECAST_SERVICE_URL", env_file, "http://localhost:8002/api/v1/forecast")
    api_key = setting("FORECAST_SERVICE_API_KEY", env_file)
    timeout = int(setting("FORECAST_SERVICE_TIMEOUT", env_file, "180"))
    if not api_key:
        sys.exit("FORECAST_SERVICE_API_KEY is not set (environment or .env).")
    return url, api_key, timeout


def fetch_forecast(url: str, api_key: str, timeout: int) -> dict:
    request = urllib.request.Request(
        url, headers={"X-API-Key": api_key, "accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        sys.exit(f"Forecasting service returned {exc.code}: {detail}")
    except (urllib.error.URLError, TimeoutError) as exc:
        sys.exit(
            f"Could not reach the forecasting service at {url} ({exc}).\n"
            "Start it from ../iMAPS-forecasting-service with:\n"
            "    docker compose up -d"
        )


def fmt(value, suffix=""):
    return "—" if value is None else f"{value}{suffix}"


def by_quarter(forecasts: list[dict]) -> dict[str, list[dict]]:
    grouped = {}
    for row in forecasts:
        grouped.setdefault(row["Quarter_Label"], []).append(row)
    return grouped


def print_window(result: dict) -> None:
    window = result["training_window"]
    quality = result["data_quality"]
    print("\n=== Training window ===")
    print(f"  {window['start']} to {window['end']}  "
          f"({window['quarters_used_for_modelling']} quarters, "
          f"last {window['holdout_quarters']} held out for validation)")
    print(f"  rows used: {quality['rows_used']} of {quality['rows_in_upload']}")
    if quality.get("unmatched_barangay_names"):
        print(f"  unmatched barangays: {quality['unmatched_barangay_names']}")


def print_metrics(result: dict) -> None:
    m = result["metrics"]
    print("\n=== Validation on held-out quarters (model vs naive baseline) ===")
    print(f"  {'metric':<16}{'model':>10}{'baseline':>10}")
    for label, key, suffix in [
        ("MAE", "mae", ""),
        ("wMAPE", "wmape", "%"),
        ("R²", "r2", ""),
        ("Municipal MAPE", "municipal_mape", "%"),
    ]:
        print(f"  {label:<16}{fmt(m.get('validation_' + key), suffix):>10}"
              f"{fmt(m.get('baseline_' + key), suffix):>10}")
    print("  Baseline = each barangay's last quarter repeated. Lower MAE/MAPE, "
          "higher R² is better.")


def print_totals(result: dict) -> None:
    print("\n=== Municipal totals (80% range) ===")
    for label, t in result["totals"].items():
        print(f"  {label}: {t['expected']:.1f}  [{t['lower_80']}–{t['upper_80']}]")


def print_barangays(result: dict, top: int) -> None:
    for label, rows in by_quarter(result["forecasts"]).items():
        rows = sorted(rows, key=lambda r: r["Expected"], reverse=True)[:top]
        print(f"\n=== {label}: top {len(rows)} barangays ===")
        print(f"  {'Barangay':<16}{'Predicted':>10}{'Expected':>10}{'80% range':>12}  Confidence")
        for r in rows:
            rng = f"{r['Lower_80']}–{r['Upper_80']}"
            print(f"  {r['Barangay']:<16}{r['Predicted_Quarterly_Clearances']:>10}"
                  f"{r['Expected']:>10.2f}{rng:>12}  {r['Confidence']}")


def print_report(result: dict, top: int) -> None:
    print_window(result)
    print_metrics(result)
    print_totals(result)
    print_barangays(result, top)


def style(ax, title):
    ax.set_facecolor(SURFACE)
    ax.set_title(title, loc="left", color=INK, fontsize=11, fontweight="bold")
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK_2, labelsize=9, length=0)


def chart_totals(plt, result):
    hist = result.get("history") or []
    totals = result["totals"]
    fig, ax = plt.subplots(figsize=(11, 4.8), facecolor=SURFACE)
    style(ax, "Locational clearances per quarter, Rosario")

    x_hist = list(range(len(hist)))
    y_hist = [q["total"] for q in hist]
    if hist:
        ax.plot(x_hist, y_hist, color=HISTORY, linewidth=2, label="Filed")

    x_fc = list(range(len(hist), len(hist) + len(totals)))
    exp = [t["expected"] for t in totals.values()]
    lo = [t["expected"] - t["lower_80"] for t in totals.values()]
    hi = [t["upper_80"] - t["expected"] for t in totals.values()]
    if hist:
        # Bridge the last filed quarter to the first forecast so the trend reads on.
        ax.plot([x_hist[-1], x_fc[0]], [y_hist[-1], exp[0]],
                color=FORECAST, linewidth=2, linestyle=(0, (3, 2)))
    ax.errorbar(x_fc, exp, yerr=[lo, hi], color=FORECAST, linewidth=2,
                marker="o", markersize=8, markeredgecolor=SURFACE,
                markeredgewidth=2, capsize=4, label="Forecast (80% range)")
    for x, t in zip(x_fc, totals.values()):
        ax.annotate(f"{t['expected']:.0f}", (x, t["expected"]), xytext=(8, 0),
                    textcoords="offset points", va="center", color=INK, fontsize=9)

    labels = [q["label"] for q in hist] + list(totals)
    step = -(-len(labels) // 8)  # at most ~8 labels, so they never collide
    ax.set_xticks(range(0, len(labels), step), labels[::step])
    ax.set_ylim(bottom=0)
    ax.legend(frameon=False, loc="upper left", labelcolor=INK_2, fontsize=9)
    fig.tight_layout()
    return fig


def chart_metrics(plt, metrics):
    rows = [("MAE (clearances)", "mae", False), ("wMAPE (%)", "wmape", False),
            ("Municipal MAPE (%)", "municipal_mape", False), ("R²", "r2", True)]
    rows = [r for r in rows if metrics.get("validation_" + r[1]) is not None]
    # Different scales, so one small panel per metric rather than a shared axis.
    fig, axes = plt.subplots(1, len(rows), figsize=(3 * len(rows), 3.6),
                             facecolor=SURFACE, squeeze=False)
    for ax, (title, key, higher_better) in zip(axes[0], rows):
        style(ax, title)
        vals = [metrics.get("validation_" + key), metrics.get("baseline_" + key)]
        bars = ax.bar(["Model", "Baseline"], [v or 0 for v in vals], width=0.55,
                      color=[FORECAST, HISTORY], edgecolor=SURFACE, linewidth=2)
        for bar, v in zip(bars, vals):
            below = (v or 0) < 0
            ax.annotate(fmt(v), (bar.get_x() + bar.get_width() / 2, bar.get_height()),
                        xytext=(0, -3 if below else 3), textcoords="offset points",
                        ha="center", va="top" if below else "bottom",
                        color=INK, fontsize=9)
        ax.set_xlabel("higher is better" if higher_better else "lower is better",
                      color=INK_2, fontsize=8)
        ax.margins(y=0.15)
    fig.suptitle("Validation on held-out quarters", x=0.01, ha="left",
                 color=INK, fontsize=12, fontweight="bold")
    fig.tight_layout()
    return fig


def chart_barangays(plt, result, top):
    grouped = by_quarter(result["forecasts"])
    quarters = list(result["totals"])
    first = sorted(grouped[quarters[0]], key=lambda r: r["Expected"], reverse=True)
    order = [r["Barangay"] for r in first[:top]]

    fig, axes = plt.subplots(1, len(quarters),
                             figsize=(6 * len(quarters), 0.3 * len(order) + 1.6),
                             facecolor=SURFACE, sharey=True, squeeze=False)
    for ax, label in zip(axes[0], quarters):
        rows = {r["Barangay"]: r for r in grouped[label]}
        q = [rows[name] for name in order]
        exp = [r["Expected"] for r in q]
        style(ax, f"{label}: expected clearances, 80% range")
        ax.grid(axis="y", visible=False)
        ax.grid(axis="x", color=GRID, linewidth=0.8)
        y = list(range(len(order)))
        ax.barh(y, exp, height=0.6, color=FORECAST, edgecolor=SURFACE, linewidth=2)
        ax.errorbar(exp, y,
                    xerr=[[e - r["Lower_80"] for e, r in zip(exp, q)],
                          [r["Upper_80"] - e for e, r in zip(exp, q)]],
                    fmt="none", ecolor=INK_2, elinewidth=1, capsize=2)
        ax.set_yticks(y, order)
    axes[0][0].invert_yaxis()  # shared y: inverting each panel would undo it
    fig.tight_layout()
    return fig


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--top", type=int, default=15,
                        help="barangays to list and chart (default 15)")
    parser.add_argument("--save", nargs="?", const=str(DEFAULT_SAVE_DIR), metavar="DIR",
                        help="write the charts as PNGs (default dir: storage/app/forecast-report)")
    parser.add_argument("--json", metavar="FILE", help="write the raw response here")
    parser.add_argument("--no-show", action="store_true", help="do not open chart windows")
    args = parser.parse_args()

    url, api_key, timeout = service_settings()
    print(f"Requesting forecast from {url} ...", flush=True)
    result = fetch_forecast(url, api_key, timeout)
    print_report(result, args.top)

    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(result, indent=2))
        print(f"\nRaw response written to {args.json}")

    import matplotlib
    if args.no_show:
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figures = {
        "totals": chart_totals(plt, result),
        "metrics": chart_metrics(plt, result["metrics"]),
        "barangays": chart_barangays(plt, result, args.top),
    }
    if args.save:
        out = Path(args.save)
        out.mkdir(parents=True, exist_ok=True)
        for name, fig in figures.items():
            fig.savefig(out / f"forecast_{name}.png", dpi=150, facecolor=SURFACE)
        print(f"Charts written to {out}/")
    if not args.no_show:
        plt.show()


if __name__ == "__main__":
    main()
