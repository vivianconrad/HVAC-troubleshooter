# build/gen-pt-tables.py
# One-time generator. Needs: pip install CoolProp
# Usage (from the project root): python build/gen-pt-tables.py
import json
import os
import sys

from CoolProp.CoolProp import PropsSI

PA_PER_PSI = 6894.757293168
ATM_PSI = 14.696

# R-454B nominal composition, mass percent (R-32 / R-1234yf).
R454B_MASS_R32 = 68.9
R454B_MASS_R1234YF = 31.1


def r454b_fluid_string():
    """Build a CoolProp HEOS mixture string from the nominal MASS fractions."""
    m32 = PropsSI("M", "R32")
    m1234 = PropsSI("M", "R1234yf")
    n32 = R454B_MASS_R32 / m32
    n1234 = R454B_MASS_R1234YF / m1234
    total = n32 + n1234
    return "HEOS::R32[%.10f]&R1234yf[%.10f]" % (n32 / total, n1234 / total)


GENERIC_SOURCE = (
    "Generated with CoolProp (Helmholtz equations of state). "
    "psig = absolute minus 14.696 psi (sea level). 1 F steps."
)

FLUIDS = {
    "R-410A": ("R410A", GENERIC_SOURCE),
    "R-32": ("R32", GENERIC_SOURCE),
    "R-454B": (
        r454b_fluid_string(),
        "COMPUTED, NOT A MANUFACTURER CHART. Calculated from the nominal composition "
        "(68.9/31.1 mass % R-32/R-1234yf) with the CoolProp HEOS mixture model. "
        "psig = absolute minus 14.696 psi (sea level). 1 F steps. "
        "MUST be verified against the manufacturer's published chart "
        "(Chemours Opteon XL41) before field use.",
    ),
}


def psig(pa):
    return round(pa / PA_PER_PSI - ATM_PSI, 2)


out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "pt")
os.makedirs(out_dir, exist_ok=True)

failed = []

for name, (cp_name, source) in FLUIDS.items():
    points = []
    for t_f in range(-40, 151):
        t_k = (t_f - 32) / 1.8 + 273.15
        try:
            bubble = psig(PropsSI("P", "T", t_k, "Q", 0, cp_name))
            dew = psig(PropsSI("P", "T", t_k, "Q", 1, cp_name))
        except Exception as err:
            print("ERROR: %s at %d F (%.2f K): %s" % (name, t_f, t_k, err), file=sys.stderr)
            print("Aborting %s; no table written for it." % name, file=sys.stderr)
            failed.append(name)
            points = None
            break
        points.append({"tF": t_f, "bubblePsig": bubble, "dewPsig": min(dew, bubble)})
    if points is None:
        continue
    doc = {"refrigerant": name, "source": source, "points": points}
    with open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    print("wrote", name, len(points), "points")

if failed:
    print("FAILED fluids: " + ", ".join(failed), file=sys.stderr)
    sys.exit(1)
