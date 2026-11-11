import json,networkx as nx,math
P=json.load(open('site/data/people.json'));R=json.load(open('site/data/relations.json'))
G=nx.Graph(); G.add_nodes_from(p['id'] for p in P)
W={'master_disciple':1.0,'kin':0.6,'marriage':0.6,'other':0.3}
for r in R:
    if G.has_edge(r['from'],r['to']): G[r['from']][r['to']]['weight']+=W[r['type']]
    else: G.add_edge(r['from'],r['to'],weight=W[r['type']])
comps=sorted(nx.connected_components(G),key=len,reverse=True)
H=G.subgraph(comps[0])
pos=nx.spring_layout(H,k=1.5/math.sqrt(H.number_of_nodes()),iterations=400,seed=7,weight='weight')
xs=[v[0] for v in pos.values()];ys=[v[1] for v in pos.values()]
S=3200/(max(xs)-min(xs))
out={k:[round((v[0]-min(xs))*S,1),round((v[1]-min(ys))*S,1)] for k,v in pos.items()}
W_=3200; H_=max(v[1] for v in out.values())
x=0
for c in comps[1:]:
    sub=G.subgraph(c); sp=nx.spring_layout(sub,seed=1) if len(c)>1 else {list(c)[0]:(0,0)}
    for k,v in sp.items(): out[k]=[round(x+60+v[0]*60,1),round(H_+150+v[1]*60,1)]
    x+=180
json.dump(out,open('site/data/layout.json','w'),separators=(',',':'))
print(len(out),[len(c) for c in comps])
