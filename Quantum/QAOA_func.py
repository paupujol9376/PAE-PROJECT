import math
import itertools
import networkx as nx
from dimod import Binary, BinaryQuadraticModel
import neal


def qubo_best_path(nodes, r, src, dst, cost_fn=None, alpha=None,
                   num_reads=500, num_sweeps=2000, seed=None, eps=0.01):
    """
    Troba el millor camí src -> dst usant un QUBO + simulated annealing.

    Paràmetres
    ----------
    nodes   : dict {id: (x, y)} o llista de (x, y) (els ids seran els índexs).
    r       : radi; dos nodes estan connectats si la seva distància <= r.
    src,dst : ids dels nodes d'origen i destí.
    cost_fn : opcional, cost_fn(u, v, d) -> cost de l'aresta (u,v) amb distància d.
              Per defecte, el cost és la distància euclidiana.
    alpha   : pes de les penalitzacions (per defecte sum(costos) + 1).
    eps     : cost mínim afegit a cada aresta (evita costos 0).

    Retorna
    -------
    dict amb: path (llista de nodes), cost, edges, energy
    o None si no hi ha cap camí possible.
    """
    if not isinstance(nodes, dict):
        nodes = dict(enumerate(nodes))
    if src not in nodes or dst not in nodes:
        raise ValueError("src i dst han de ser a la llista de nodes")

    # ---------- 1. Arestes dins del radi r ----------
    E = {}
    for u, v in itertools.combinations(nodes, 2):
        d = math.dist(nodes[u], nodes[v])
        if d <= r:
            c = cost_fn(u, v, d) if cost_fn else d
            E[(u, v)] = c + eps

    G = nx.Graph()
    G.add_nodes_from(nodes)
    G.add_weighted_edges_from([(u, v, c) for (u, v), c in E.items()])
    if not nx.has_path(G, src, dst):
        return None

    # Reduïm el problema a la component connexa de src (menys variables)
    comp = nx.node_connected_component(G, src)
    E = {e: c for e, c in E.items() if e[0] in comp and e[1] in comp}
    if alpha is None:
        alpha = sum(E.values()) + 1

    # ---------- 2. QUBO ----------
    xe = {e: Binary(f"e_{k}") for k, e in enumerate(E)}
    inner = [i for i in comp if i not in (src, dst)]
    xn = {i: Binary(f"n_{k}") for k, i in enumerate(inner)}

    inc = lambda i: sum((xe[e] for e in E if i in e), start=0)

    H = sum(E[e] * xe[e] for e in E)             # cost total
    H += alpha * (1 - inc(src)) ** 2             # src: grau 1
    H += alpha * (1 - inc(dst)) ** 2             # dst: grau 1
    for i in inner:
        H += alpha * (2 * xn[i] - inc(i)) ** 2   # nodes intermedis: grau 0 o 2
    bqm = BinaryQuadraticModel(H)

    # ---------- 3. Simulated annealing ----------
    res = neal.SimulatedAnnealingSampler().sample(
        bqm, num_reads=num_reads, num_sweeps=num_sweeps, seed=seed)

    # ---------- 4. Primera mostra (per energia) que sigui un camí vàlid ----------
    edge_names = {e: f"e_{k}" for k, e in enumerate(E)}
    for datum in res.data(["sample", "energy"], sorted_by="energy"):
        chosen = [e for e, name in edge_names.items() if datum.sample[name] == 1]
        path = _decode_path(chosen, src, dst)
        if path is not None:
            return {"path": path,
                    "cost": sum(E[e] for e in chosen),
                    "edges": chosen,
                    "energy": datum.energy}
    return None  # cap mostra vàlida: augmenta num_reads / num_sweeps


def _decode_path(chosen, src, dst):
    """Retorna el camí src->dst si les arestes triades formen exactament un camí simple."""
    if not chosen:
        return None
    H = nx.Graph(chosen)
    if src not in H or dst not in H:
        return None
    # Grau: 1 a src/dst, 2 a la resta -> un camí (+ possibles cicles separats)
    if H.degree(src) != 1 or H.degree(dst) != 1:
        return None
    if any(H.degree(n) != 2 for n in H if n not in (src, dst)):
        return None
    # Hi ha d'haver una sola component (si no, hi ha cicles desconnectats)
    if nx.number_connected_components(H) != 1:
        return None
    return nx.shortest_path(H, src, dst)


# ---------------- Exemple d'ús ----------------
if __name__ == "__main__":
    pts = {"S": (0, 0), "A": (1, 0.5), "B": (1, -0.5), "C": (2, 0), "T": (3, 0)}
    out = qubo_best_path(pts, r=1.5, src="S", dst="T", seed=1)
    print(out)

    # Verificació amb Dijkstra
    G = nx.Graph()
    for u, v in itertools.combinations(pts, 2):
        d = math.dist(pts[u], pts[v])
        if d <= 1.5:
            G.add_edge(u, v, w=d + 0.01)
    print("Dijkstra:", nx.shortest_path(G, "S", "T", weight="w"))