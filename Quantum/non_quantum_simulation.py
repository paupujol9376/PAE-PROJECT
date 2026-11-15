import pandas as pd, networkx as nx
from dimod import Binary, BinaryQuadraticModel
import neal

# ---------- 1. DATOS (ejemplo inventado; sustituye por los tuyos) ----------
edges = pd.DataFrame([
 ("S","A", 1.0, 0.8, 0.2, 0.3, 0.2, 1),
 ("S","B", 1.4, 0.2, 0.3, 0.2, 0.3, 1),
 ("A","B", 0.6, 0.5, 0.4, 0.4, 0.3, 1),
 ("A","T", 1.2, 0.7, 0.2, 0.3, 0.2, 1),
 ("B","C", 0.9, 0.2, 0.2, 0.1, 0.2, 1),
 ("C","T", 1.1, 0.3, 0.3, 0.2, 0.3, 1),
 ("B","T", 0.5, 0.9, 0.9, 0.8, 0.5, 0),   # puente caído -> se elimina
], columns=["u","v","km","riesgo","estado","familia","seguridad","ok"])
SRC, DST = "S", "T"
W = dict(km=0.25, riesgo=0.30, estado=0.15, familia=0.15, seguridad=0.15)

# ---------- 2. LIMPIEZA Y COSTE COMPUESTO ----------
edges = edges[edges.ok == 1].copy()
edges["cost"] = (W["km"]*edges.km/edges.km.max() + W["riesgo"]*edges.riesgo +
                 W["estado"]*edges.estado + W["familia"]*edges.familia +
                 W["seguridad"]*edges.seguridad) + 0.01
E = {(r.u, r.v): r.cost for r in edges.itertuples()}
nodes = sorted({n for e in E for n in e})
alpha = sum(E.values()) + 1

# ---------- 3. QUBO (Sección VI del paper, con xs = xt = 1) ----------
xe = {e: Binary(f"e_{e[0]}_{e[1]}") for e in E}
xn = {i: Binary(f"n_{i}") for i in nodes if i not in (SRC, DST)}
inc = lambda i: sum(xe[e] for e in E if i in e)
H = sum(E[e]*xe[e] for e in E)                 # H_C
H += alpha*(1 - inc(SRC))**2                   # H_s
H += alpha*(1 - inc(DST))**2                   # H_t
for i in xn:
    H += alpha*(2*xn[i] - inc(i))**2           # H_i
bqm = BinaryQuadraticModel(H)

# ---------- 4. SIMULATED ANNEALING ----------
res = neal.SimulatedAnnealingSampler().sample(bqm, num_reads=500, num_sweeps=2000, seed=1)
best = res.first
route = [e for e in E if best.sample[f"e_{e[0]}_{e[1]}"] == 1]
print("Tramos elegidos:", route, "| coste:", round(sum(E[e] for e in route), 3))

# ---------- 5. VERIFICACIÓN con Dijkstra ----------
G = nx.Graph(); [G.add_edge(u, v, w=c) for (u, v), c in E.items()]
print("Dijkstra:", nx.shortest_path(G, SRC, DST, weight="w"))