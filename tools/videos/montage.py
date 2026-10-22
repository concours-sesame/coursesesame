# Calendrier, piste sonore, sous-titres : python montage.py script.json dossier
import json,sys,re,subprocess,numpy as np,soundfile as sf
d=json.load(open(sys.argv[1])); out=sys.argv[2]
dur={(i,j):(f,t) for i,j,f,t in json.load(open(out+'/durees.json'))}
PETITS={'à','a','de','d\'','la','le','les','l\'','un','une','des','du','et','ou','en','au','aux','par','pour','sur','dans','qui','que','ne','se','son','sa','ses','il','elle','vous','n\'a','est','pas','avec','contre','sans','mais','si'}
SR=24000; DEBUT=0.6; ENTRE=0.28; APRES=0.75
audio=[np.zeros(int(SR*DEBUT))]; t=DEBUT; T={'scenes':[],'morceaux':[]}
def morceaux(phrase,a,b):
    mots=phrase.split(); groupes=[];g=[]
    for m in mots:
        g.append(m)
        petit=m.strip('*').lower() in PETITS
        if (len(' '.join(g).replace('*',''))>=26 and not petit) or m.endswith((':',',',';')): groupes.append(g);g=[]
    if g:
        if groupes and len(' '.join(g))<10: groupes[-1]+=g
        else: groupes.append(g)
    # équilibre des astérisques coupés entre deux groupes
    txt=[' '.join(x) for x in groupes]; ouvert=False; res=[]
    for x in txt:
        if ouvert: x='*'+x
        n=x.count('*'); ouvert = n%2==1
        if ouvert: x=x+'*'
        res.append(x)
    L=sum(len(x.replace('*','')) for x in res); c=a
    for x in res:
        e=c+(b-a)*len(x.replace('*',''))/L; T['morceaux'].append({'debut':round(c,3),'fin':round(e,3),'texte':x}); c=e
for i,sc in enumerate(d['scenes']):
    s={'debut':round(t- (DEBUT if i==0 else 0),3),'phrases':[]}
    for j,p in enumerate(sc['dit']):
        f,du=dur[(i,j)]; w,sr=sf.read(f); assert sr==SR
        audio.append(w); s['phrases'].append({'debut':round(t,3),'fin':round(t+du,3)})
        morceaux(p.replace('« ','« ').replace(' »',' »'),t,t+du); t+=du
        g=ENTRE if j<len(sc['dit'])-1 else APRES
        audio.append(np.zeros(int(SR*g))); t+=g
    if sc['type']=='outro': audio.append(np.zeros(int(SR*1.6))); t+=1.6
    s['fin']=round(t,3); T['scenes'].append(s)
T['duree']=round(t,3)
T['contenuDebut']=T['scenes'][1]['debut']; T['contenuFin']=T['scenes'][-1]['debut']
sf.write(out+'/voix.wav',np.concatenate(audio),SR)
json.dump(T,open(out+'/calendrier.json','w'),ensure_ascii=False)
print('durée',T['duree'],'s,',len(T['morceaux']),'sous-titres')
