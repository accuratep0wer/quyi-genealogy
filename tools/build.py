import json,re,urllib.parse
from opencc import OpenCC
cc=OpenCC('t2s')
P=json.load(open('pages.json')); RED=P.pop('__redirects__')
CAT=set(json.load(open('titles.json')))
LINEAGE='相声演员师承关系'
def wurl(t): return 'https://zh.wikipedia.org/wiki/'+urllib.parse.quote(t.replace(' ','_'))
CN={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12}
ZIBEI={4:'德',5:'寿',6:'宝',7:'文',8:'明'}
SP={cc.convert(t):t for t in P}
SR={cc.convert(a):b for a,b in RED.items()}
def canon(t):
    t=t.strip().replace('_',' ')
    t=re.sub(r'#.*','',t).strip()
    if not t: return None
    t=t[0].upper()+t[1:] if t[0].isascii() else t
    t=RED.get(t,t); t=SR.get(cc.convert(t),t)
    return cc.convert(t)
def page_of(k):
    t=SP.get(k)
    return t if t and '相声' in P[t] else None
def disp(t): return cc.convert(re.sub(r'\s*[\(（][^)）]*[\)）]\s*$','',t.replace('_',' ')).strip())
people={}; order=[]
def person(key,name=None,**kw):
    if key not in people:
        people[key]={'id':None,'key':key,'name':name or disp(key),'aliases':[],'generation':None,'gen_source':None,
                     'birth':None,'death':None,'notes':[],'sources':[],'wiki':page_of(key)}
        order.append(key)
    p=people[key]
    for k,v in kw.items():
        if k=='alias' and v and v!=p['name'] and v not in p['aliases']: p['aliases'].append(v)
        elif k=='note' and v and v not in p['notes']: p['notes'].append(v)
        elif k=='source' and v and v not in p['sources']: p['sources'].append(v)
    return p
rels={}
def rel(t,a,b,detail='',src=None,conf='documented',note=None):
    if a==b: return
    k=(t,a,b) if t=='master_disciple' or t=='other' else (t,)+tuple(sorted([a,b]))
    if t=='other': k=(t,a,b,detail)
    r=rels.get(k)
    if not r:
        r=rels[k]={'type':t,'from':a,'to':b,'detail':detail,'sources':[],'confidence':conf,'notes':[]}
    if src and src not in r['sources']: r['sources'].append(src)
    if conf=='disputed': r['confidence']='disputed'
    if note and note not in r['notes']: r['notes'].append(note)
    if detail and detail not in r['detail']: r['detail']=(r['detail']+'；' if r['detail'] else '')+detail
    return r
byname={}
def norm(n): return cc.convert(n).replace('崑','昆')
def reg(key):
    for n in [people[key]['name']]+[re.sub(r'（.*?）','',a) for a in people[key]['aliases']]:
        n=norm(n); byname.setdefault(n,[])
        if key not in byname[n]: byname[n].append(key)
def lookup(name,gen=None):
    n=norm(name.strip())
    if n in byname:
        if gen:
            m=[k for k in byname[n] if people[k]['generation']==gen]
            if m: return m[-1]
        return byname[n][-1]
    return None
LINK=re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')
def clean(s):
    s=re.sub(r'\{\{notetag[^{}]*(\{\{[^{}]*\}\}[^{}]*)*\}\}','',s)
    s=re.sub(r'<ref[^>]*/>','',s); s=re.sub(r'<ref[^>]*>.*?</ref>','',s)
    s=re.sub(r'-\{([^}]*)\}-',r'\1',s)
    s=s.replace("'''",'').replace("''",'')
    return s
def parse_item(it):
    """returns (key,name,alias,flags)"""
    flags=set()
    if '{{dn' in it: flags.add('dn')
    it=re.sub(r'\{\{[^}]*\}\}','',it).strip()
    if '？' in it or '?' in it: flags.add('q')
    if it.startswith(('（','(')): it=it.strip('（）() ？?')
    else: it=it.replace('？','').replace('?','').strip()
    alias=None
    m=re.match(r'^(.*?)[（(](.*)[）)]$',it)
    if m:
        it,al=m.group(1).strip(),m.group(2)
        lm=LINK.search(al); alias=disp(lm.group(2) or lm.group(1)) if lm else al.strip()
    lm=LINK.search(it)
    if lm:
        tgt,lab=lm.group(1),lm.group(2)
        key=canon(tgt); name=disp(lab.strip() if lab else tgt)
        return key,name,alias,flags,True
    name=re.sub(r'\s','',it)
    if not name: return None
    return name,name,alias,flags,False
SRC_L=wurl(LINEAGE)
raw=open('wiki_raw.txt').read()
gen_from=gen_to=None; section_disputed=False; haiqing=False
manual_skip=set()
for line in raw.split('\n'):
    h=re.match(r'^==([^=].*?)==\s*$',line)
    if h:
        t=h.group(1)
        m=re.match(r'第(.+?)代.*?——第(.+?)代',t)
        if m: gen_from,gen_to=CN.get(m.group(1)),CN.get(m.group(2)); section_disputed=False; haiqing=False
        elif '海青' in t: haiqing=True; gen_from=gen_to=None
        elif '参考' in t: break
        continue
    h3=re.match(r'^===+(.*?)===+',line)
    if h3:
        section_disputed='存疑' in h3.group(1); continue
    if not line.startswith('*') or haiqing: continue
    line=clean(line[1:].strip())
    parts=re.split(r'——|一一',line,maxsplit=1)
    if len(parts)<2: continue
    left,right=parts
    left=re.sub(r'（[^）]*人[^）]*）','',left).strip()
    left=re.sub(r'（[^）]*）','',left).strip()
    lm=LINK.search(left)
    if lm: mkey=canon(lm.group(1)); mname=disp(lm.group(2) or lm.group(1))
    else:
        mname=cc.convert(re.sub(r'\s','',left))
        if mname=='孙世达': mname='孙士达'
        if mname=='徐德奎': mname='徐德魁'
        mkey=lookup(mname,gen_from) or mname
    mp=person(mkey,mname,source=SRC_L)
    if mp['generation'] is None and gen_from: mp['generation']=gen_from; mp['gen_source']='谱系表'
    reg(mkey)
    if mname=='郭德纲': continue  # handled from 郭德纲 page
    for it in right.split('、'):
        it=it.strip()
        if not it: continue
        r=parse_item(it)
        if not r: continue
        key,name,alias,flags,linked=r
        # homonym handling
        if key in people:
            existing=[x for x in rels.values() if x['type']=='master_disciple' and x['to']==key and x['from']!=mkey]
            if existing and not section_disputed:
                key=key+'#'+mkey; 
                person(key,name,note='与另一同名者无法确认是否同一人，暂分开收录',source=SRC_L)
        p=person(key,name,alias=alias,source=SRC_L)
        if p['generation'] is None and gen_to: p['generation']=gen_to; p['gen_source']='谱系表'
        reg(key)
        conf='disputed' if (section_disputed or flags) else 'documented'
        note=None
        if section_disputed: note='维基谱系表列于“存疑”'
        if 'dn' in flags: note='维基谱系表标注需消歧/存疑'
        if 'q' in flags: note='原表带问号，归属存疑'
        rel('master_disciple',mkey,key,'',SRC_L,conf,note)
# haiqing manual
chain=[('冯崑治','彭国良','中间传承不详，原表注“中间不详”'),('彭国良','陈连仲',None)]
for a,b,n in chain:
    person(b,b,source=SRC_L); reg(b)
    rel('master_disciple',lookup(a) or a,b,'',SRC_L,'disputed',n or '未见于逐代表，仅列于“海青或未明传承”')
for d in ['范伟','严翔','潘海涛','韩立新','浦立明','陈云飞']:
    k=canon({'陈云飞':'陳雲飛(相聲演員)'}.get(d,d)); person(k,d,source=SRC_L); reg(k); rel('master_disciple','陈连仲',k,'',SRC_L)
for m,ds in [('魏龙豪',['傅谛','白原','高培钧']),('陈逸安',['王振全','叶怡均'])]:
    mk=canon(m); person(mk,m,source=SRC_L,note='海青或未明传承（台湾）'); reg(mk)
    for d in ds:
        k=canon('叶怡君' if d=='叶怡均' else d); person(k,d,source=SRC_L); reg(k); rel('master_disciple',mk,k,'',SRC_L)
person(canon('杨议'),'杨议',source=SRC_L,note='谱系表列于“海青或未明传承”'); reg(canon('杨议'))

# ---- 郭德纲 box (德云社家谱)
GDG=canon('郭德纲'); SRC_G=wurl('郭德纲'); SRC_JP='http://www.morningpost.com.cn/2016/0901/1484844_7.shtml'
s=P['郭德纲']; box=s[s.find('==师承关系=='):]
for ke,lab in [('“云”字科','云'),('“鹤”字科','鹤'),('“九”字科','九'),('“霄”字科','霄'),('口盟弟子','口盟')]:
    i=box.find(ke); seg=box[i:box.find('|-',i+len(ke)+5)]
    for lm in LINK.finditer(seg):
        k=canon(lm.group(1)); n=disp(lm.group(2) or lm.group(1))
        p=person(k,n,source=SRC_G,note=f'德云社{lab}字科' if lab!='口盟' else '郭德纲口盟弟子')
        if lm.group(2) and disp(lm.group(1))!=n: person(k,alias=disp(lm.group(1)))
        reg(k)
        if p['generation'] is None: p['generation']=9; p['gen_source']='推定'
        if lab=='口盟': rel('other',GDG,k,'口盟弟子（口头收徒，未正式摆知）',SRC_G)
        elif n in ('李云杰','李云天'): rel('master_disciple',GDG,k,'德云社家谱列入云字科',SRC_G,'disputed','维基谱系表注：无公开资料证明其在相声门改拜郭德纲（李云杰原拜杨进明）')
        else: rel('master_disciple',GDG,k,f'{lab}字科',SRC_G); rels[('master_disciple',GDG,k)]['sources'].append(SRC_JP) if SRC_JP not in rels[('master_disciple',GDG,k)]['sources'] else None
for n in ['何云伟','曹云金']:
    k=canon(n); person(k,n,source=SRC_G,note='原德云社云字科，2016年《德云社家谱》中被逐出师门'); reg(k)
    people[k]['generation']=people[k]['generation'] or 9
    rel('master_disciple',GDG,k,'原云字科弟子，2016年被郭德纲宣布逐出师门（清门）',SRC_G,'disputed','师徒关系曾存在，后被一方解除，双方各执一词')
person(canon('张鹤文'),'张鹤文',note='原郭德纲鹤字科，后改拜李菁'); 
rel('master_disciple',GDG,canon('张鹤文'),'原鹤字科，后改拜李菁',SRC_L,'disputed','维基谱系表注：张鹤文改拜李菁')
# 杨志刚 dispute
rel('other',canon('杨志刚'),GDG,'早年老师（双方对是否正式拜师存在争议，2006年起名誉纠纷）',SRC_G,'disputed','郭德纲正式相声门师父为侯耀文（2004年拜师）')
# ---- infobox modules on individual pages
def field(s,name):
    m=re.search(r'\|\s*'+name+r'\s*=(.*?)(?=\n\s*\||\n\}\}|\}\}\s*\n)',s,re.S)
    return m.group(1).strip() if m else ''
def year(v):
    m=re.search(r'(1[6-9]\d\d|20[0-2]\d)',v); return int(m.group(1)) if m else None
pagekeys={}
for t,s in P.items():
    if '相声' not in s: continue
    k=canon(t)
    mod=re.search(r'Crosstalk actor master-apprentice relation module(.*?)\n\s*\}\}',s,re.S)
    is_perf = t in CAT or mod
    if k not in people and not is_perf: continue
    if k not in people and not mod: 
        continue
    pp=person(k,disp(t),source=wurl(t)); pp['wiki']=t; reg(k); pagekeys[k]=t
    b=field(s,'出生日期') or field(s,'出生'); d=field(s,'逝世日期') or field(s,'逝世')
    m=re.search(r'\{\{\s*[bB][dD]\|(\d{4})年[^|]*\|[^|]*\|?(\d{4})?',s)
    pp['birth']=pp['birth'] or year(b) or (int(m.group(1)) if m else None)
    dd=year(d) if d else None
    if d and re.search(r'death date and age\|(\d{4})',d): dd=int(re.search(r'death date and age\|(\d{4})',d).group(1))
    if d and re.search(r'dda\|(\d{4})',d): dd=int(re.search(r'dda\|(\d{4})',d).group(1))
    if not dd and m and m.group(2): dd=int(m.group(2))
    pp['death']=pp['death'] or dd
    bn=field(s,'本名')
    bn=clean(re.sub(r'<[^>]+>','',bn)); bn=re.sub(r'\[\[|\]\]','',bn).strip()
    if bn and len(bn)<12: person(k,alias=cc.convert(bn)+'（本名）')
    if mod:
        body=mod.group(1)
        g=re.search(r'\|\s*世代\s*=\s*([一二三四五六七八九十]+)',body)
        if g and g.group(1) in CN:
            gv=CN[g.group(1)]
            if pp['generation'] and pp['generation']!=gv: person(k,note=f'代数存在不同说法：谱系表推为第{pp["generation"]}代，个人条目记为第{gv}代')
            else: pp['generation']=gv; pp['gen_source']='个人条目'
        ms=re.search(r'\|\s*师承\s*=(.*?)(?=\n\s*\||$)',body,re.S)
        if ms:
            for lm in LINK.finditer(clean(ms.group(1))):
                mk=canon(lm.group(1)); mn=disp(lm.group(2) or lm.group(1))
                if mk==k: continue
                same=[r['from'] for r in rels.values() if r['type']=='master_disciple' and r['to']==k and people[r['from']]['name']==mn]
                if same: mk=same[0]
                mp=person(mk,mn,source=wurl(t)); reg(mk)
                if mk==GDG and k in [r['to'] for r in rels.values() if r['from']==GDG]: continue
                rel('master_disciple',mk,k,'',wurl(t))
        ds=re.search(r'\|\s*徒弟\s*=(.*?)(?=\n\s*\|\s*\S+\s*=|$)',body,re.S)
        if ds and k!=GDG:
            for lm in LINK.finditer(clean(ds.group(1))):
                dk=canon(lm.group(1)); dn=disp(lm.group(2) or lm.group(1))
                if dk==k or '见下文' in dn: continue
                # homonym check: if dk exists with homonym-split variant whose master is k, use that
                alt=dk+'#'+k
                if dk in people and people[dk]['generation'] and pp['generation'] and abs(people[dk]['generation']-pp['generation']-1)>1 and not any(r['from']==k and r['to']==dk for r in rels.values()):
                    person(alt,dn,source=wurl(t),note='与另一同名者（第%d代）不是同一人，分开收录'%people[dk]['generation'])
                if alt in people: dk=alt
                else:
                    same=[r['to'] for r in rels.values() if r['type']=='master_disciple' and r['from']==k and people[r['to']]['name']==dn]
                    if same: dk=same[0]
                dp=person(dk,dn,source=wurl(t)); reg(dk)
                rel('master_disciple',k,dk,'',wurl(t))
# ---- kin / marriage from infobox
KINF={'配偶':'marriage','父母':'kin','儿女':'kin','子女':'kin','亲属':'kin','家人':'kin'}
INLAW=re.compile(r'岳|婿|媳|嫂|姻|妻|夫|连襟|妯娌')
for k,t in list(pagekeys.items()):
    s=P[t]
    for f,typ in KINF.items():
        v=field(s,f)
        if not v: continue
        v=clean(v)
        segs=re.split(r'<br\s*/?>|、|，|,|；|\n',v)
        for seg in segs:
            for lm in LINK.finditer(seg):
                ok=canon(lm.group(1)); on=disp(lm.group(2) or lm.group(1))
                if ok==k or ok is None: continue
                lab=LINK.sub('',seg); lab=re.sub(r'\{\{.*?(\}\}|$)','',lab); lab=re.sub(r'<.*?(>|$)','',lab)
                lab=re.sub(r'[：:（）()\s\*\|]','',lab)
                extra=''
                if re.search(r'\d|离异|離異|已故',lab): extra='（'+lab+'）' if '离' in lab or '離' in lab else ''; lab=''
                tp=typ
                if f=='配偶': lab='配偶'+extra; tp='marriage'
                if re.search(r'[义義干乾](父|子|女|母)',lab): tp='other'
                elif INLAW.search(lab or ''): tp='marriage'
                if not lab: lab={'父母':'父/母','儿女':'子女','子女':'子女'}.get(f,'亲属')
                lab=lab[:20]
                cand=[x for x in byname.get(on,[]) if people[x].get('role','performer')=='performer']
                mnote=None
                if ok not in people and len(cand)==1:
                    ok=cand[0]; mnote='亲属条目与谱系人物按同名合并，建议核对'
                if ok not in people:
                    person(ok,on,source=wurl(t),note='非谱系内人物（仅因亲缘/姻缘收录）'); people[ok]['role']='relative'
                reg(ok)
                rel(tp,k,ok,f'{on}是{people[k]["name"]}的{lab}',wurl(t),note=mnote)
# ---- curated extras
def R(t,a,b,det,src,conf='documented',note=None):
    for x in (a,b):
        if canon(x) not in people: person(canon(x),x,source=src); reg(canon(x))
    rel(t,canon(a),canon(b),det,src,conf,note)
for d in ['朱少文','阿彦涛','沈春和']:
    r=rels.get(('master_disciple',canon('张三禄'),canon(d)))
    if r: r['confidence']='disputed'; r['notes'].append('《江湖丛谈》只说张三禄为相声始创艺人之一，与朱、阿、沈是否直系师徒尚无定论；另有说法称阿、沈为朱绍文的代拉师弟')
R('other','朱少文','阿彦涛','代拉师弟（朱绍文代师收徒）',wurl('阿彦涛'))
R('other','朱少文','沈春和','代拉师弟（朱绍文代师收徒）',wurl('沈春和'))
R('other','李伯祥','侯耀文','代拉师弟（1994年代师赵佩茹收侯耀文）',wurl('侯耀文'))
R('other','于谦 (相声演员)','秦霄贤','引师（2019年头霄摆知）',wurl('秦霄贤'))
R('other','侯震','秦霄贤','保师（2019年头霄摆知）',wurl('秦霄贤'))
R('other','高峰 (相声演员)','秦霄贤','代师（2019年头霄摆知）',wurl('秦霄贤'))
R('marriage','马德禄','恩绪','马德禄是恩绪的门婿（女婿）',wurl('马三立'))
R('kin','马三立','恩绪','恩绪是马三立的外祖父',wurl('马三立'))
gdl=people.get(canon('高德亮'))
if gdl: gdl['notes'].append('据传因年纪小而自降一辈（第4代“德”或第5代“寿”），其一支（高凤山→石富宽→于谦）辈分特殊，缺乏权威文献佐证')
for x in ['高凤山','石富宽','于谦 (相声演员)']:
    if canon(x) in people: people[canon(x)]['notes'].append('属高德亮一支，辈分说法特殊（见高德亮）')
for n in ['韩德江']:
    k=lookup(n); 
    if k: people[k]['notes'].append('歌手韩红的父亲')

W=wurl
CUR=[
 ('kin','侯耀华','侯耀文','侯耀华是侯耀文的胞兄（均为侯宝林之子）','侯耀华'),
 ('kin','侯宝林','侯震','侯震是侯宝林的孙子（长子侯耀中之子）','侯震'),
 ('kin','刘宝瑞','侯冠男','侯冠男是刘宝瑞的外孙','刘宝瑞'),
 ('kin','师世元','师胜杰','师世元是师胜杰的父亲','师胜杰'),
 ('kin','高秀琴','师胜杰','高秀琴是师胜杰的母亲','师胜杰'),
 ('marriage','师世元','高秀琴','师世元与高秀琴为夫妻（高秀琴给师世元捧哏后结为夫妻）','师胜杰'),
 ('kin','常连安','常宝堃','常宝堃是常连安的长子','常宝堃'),
 ('kin','常连安','常宝霖','常宝霖是常连安之子','常宝堃'),
 ('kin','常连安','常宝霆','常宝霆是常连安之子','常宝霆'),
 ('kin','常连安','常宝丰','常宝丰是常连安之子','常宝堃'),
 ('kin','常连安','常宝庆','常宝庆是常连安之子','常宝堃'),
 ('kin','常宝堃','常贵田','常贵田是常宝堃之子','常宝堃'),
 ('kin','常宝华','常贵田','常贵田是常宝华的侄子','常宝华'),
 ('marriage','郭德纲','王惠','王惠是郭德纲的妻子','张云雷'),
 ('kin','王惠','张云雷','张云雷是王惠的表弟','张云雷'),
 ('kin','李洁尘','李伯祥','李伯祥是李洁尘之子','李伯祥'),
 ('kin','杨少华','杨威','杨威是杨少华的长子','杨少华 (相声演员)'),
 ('kin','杨少华','杨健 (相声演员)','杨健是杨少华的四子（同名者较多，按名合并，建议核对）','杨少华 (相声演员)'),
 ('kin','王长友','王文林','王文林是王长友之子','王文林'),
 ('marriage','田立禾','张文霞','张文霞是田立禾的妻子（亦为相声演员）','田立禾'),
 ('kin','贾冀光','贾仑','贾仑是贾冀光之子，自幼随父学艺','贾仑'),
 ('marriage','赵小林','马贵荣','马贵荣是赵小林的妻子','赵小林'),
 ('marriage','金炳昶','富兰英','富兰英是金炳昶的妻子（1957年结婚）','金炳昶'),
 ('kin','马三立','马敬伯','马敬伯是马三立的侄子','马敬伯'),
 ('kin','于谦 (相声演员)','于云霆','于云霆（本名于思洋）是于谦之子','郭德纲'),
 ('kin','马德禄','马桂元','马桂元是马德禄之子（马三立之兄）','马三立'),
 ('other','侯宝林','马志明 (相声演员)','带（代）拉师弟：马志明拜朱阔泉，为侯宝林的代拉师弟','马志明 (相声演员)'),
 ('other','何云伟','高筱宝','2007年曾被安排给何云伟当徒弟，后改拜栾云平','高筱宝'),
 ('master_disciple','赵小林','孙越 (相声演员)','早年师承赵小林，后拜师石富宽','孙越 (相声演员)'),
 ('master_disciple','赵得亮','贾仑','贾仑先后拜师赵德亮（谱系表作“赵得亮”）、侯耀文','贾仑'),
]
for t,a,b,det,src in CUR:
    ka=lookup(disp(a)) if canon(a) not in people else canon(a)
    kb=lookup(disp(b)) if canon(b) not in people else canon(b)
    for kx,x in ((ka,a),(kb,b)):
        pass
    if not ka: ka=canon(a); person(ka,disp(a),source=W(src),note='非谱系内人物（仅因亲缘/姻缘收录）'); people[ka]['role']='relative'; reg(ka)
    if not kb: kb=canon(b); person(kb,disp(b),source=W(src),note='非谱系内人物（仅因亲缘/姻缘收录）'); people[kb]['role']='relative'; reg(kb)
    rel(t,ka,kb,det,W(src))
for k in list(rels):
    r=rels[k]
    if r['type']=='kin' and people[r['to']]['name'] in ('陈子贞',) : r['notes']=[]; r['sources'].append(W('陈涌泉'))
    if r['type']=='marriage' and people[r['to']]['name']=='金珠': r['notes']=['金珠条目及金炳昶条目均说明其为金炳昶徒弟、巩汉林妻子']

BP='http://www.bianpian.cn/zatan/136.html'; EU='http://www.eupeople.com.cn/yw/2024021167634.html'
MIAO1='https://www.daojiaowang.org/index.php/post/14906.html'; MIAO2='https://www.kxting.com/article/20221008/273080.html'
SUP=[
 ('苗阜',['沈及旺','刘宣均','赵银磊','王关钦','冯楗涵'],MIAO1,'documented','苗阜于青曲社鼓楼店收徒，引师郑宏伟、保师罗健、代师王声（网络转载报道，未见权威媒体原文）'),
 ('苗阜',['韩海亮','张海博','吕纳超','张纳驰','李纳伟'],MIAO2,'disputed','仅见网络问答整理；“海”“纳”为青曲社科班字辈，可能是科班学员而非苗阜本人摆知弟子'),
 ('孟鹤堂',['陈浩'],W('孟鹤堂'),'documented','2022年拜师，孟鹤堂首徒'),
 ('侯震',['庄子建','洪晨','张国堂','高磊'],BP,'documented','德云社相关整理文章'),
 ('孙越 (相声演员)',['吕硕','孙子钊','栗世锦'],BP,'documented','德云社相关整理文章；孙子钊又作“孙钊”'),
 ('郑好',['陈奉清','魏奉强','李奉开','张奉友'],BP,'documented','“奉”字科；德云社相关整理文章'),
 ('尹九宴',['王诚意','苏诚誉'],BP,'documented','德云社相关整理文章'),
 ('闫云达',['张筱云'],EU,'documented','筱字科；网络整理家谱'),
 ('高鹤彩',['张筱鑫','霍筱森','方筱淼','肖筱焱','刘筱垚'],EU,'documented','筱字科；网络整理家谱'),
 ('房鹤迪',['刘展宏','王展奇','金展萌','李展杰','马展缇','秦展昭','郭展堂','尹展久','刘展秦'],EU,'documented','“展”字；网络整理家谱'),
 ('高峰 (相声演员)',['宋昊然'],BP,'documented','“昊”字科'),
 ('郭德纲',['闫云达'],BP,'documented','云字科，2011年1月2日补摆知；见2016年《德云社家谱》云字科名单'),
 ('郭德纲',['陈霄华'],BP,'disputed','2019年头霄第一批摆知；后被辞退，公开报道未提清门'),
]
for m,ds,src,conf,det in SUP:
    mk=canon(m) if canon(m) in people else (lookup(disp(m)) or canon(m))
    if mk not in people: person(mk,disp(m),source=src); reg(mk)
    for d in ds:
        dk=lookup(d)
        same=[r['to'] for r in rels.values() if r['type']=='master_disciple' and r['from']==mk and people[r['to']]['name']==d]
        dk=same[0] if same else canon(d)
        if dk not in people: person(dk,d,source=src); reg(dk)
        else: person(dk,source=src)
        if d=='孙子钊': person(dk,alias='孙钊')
        rel('master_disciple',mk,dk,det,src,conf)
for t,a,b,det,src,conf in [
 ('kin','岳云鹏','陈浩','陈浩是岳云鹏的外甥（据曲艺博主微博）','https://www.sina.cn/news/detail/4797063117938991.html','disputed'),
 ('kin','张文顺','宁云祥','宁云祥是张文顺的外孙','http://www.bianpian.cn/zatan/136.html','documented'),
 ('kin','张德燕','宁云祥','据整理文章称宁云祥是张德燕之子','http://www.bianpian.cn/zatan/136.html','disputed'),
 ('kin','张继平','张云藩','张云藩是张继平之子（亦为郭德纲干儿子）','http://www.bianpian.cn/zatan/136.html','documented'),
]:
    ka=lookup(a) or canon(a); kb=lookup(b) or canon(b)
    for k_,n_ in ((ka,a),(kb,b)):
        if k_ not in people: person(k_,n_,source=src); reg(k_)
    rel(t,ka,kb,det,src,conf)


# ---- cross-reference: jammyfu/xiangsheng-genealogy (MIT; cited dataset)
import glob,os
JREPO='https://github.com/jammyfu/xiangsheng-genealogy'
JD='ref/jammyfu/data/'
jsrc={x['id']:x['url'] for x in json.load(open(JD+'sources.json'))['sources']}
jp={}
for f in glob.glob(JD+'people/*.json'):
    d=json.load(open(f)); jp[d['id']]=d
def jkey(pid):
    d=jp.get(pid)
    if not d: return None
    n=norm(d['name']); n={'烧饼':'朱云峰'}.get(n,n)
    ks=byname.get(n,[])
    perf=[k for k in ks if people[k].get('role','performer')=='performer']
    if len(perf)==1: return perf[0]
    if len(perf)>1:
        g=d.get('generationIndex')
        m=[k for k in perf if people[k]['generation']==g]
        if len(m)==1: return m[0]
        return perf[0]
    k=canon(d['name']); person(k,n,source=JREPO,note='据参考项目 jammyfu/xiangsheng-genealogy 补入'); reg(k)
    if d.get('generationIndex'): people[k]['generation']=d['generationIndex']; people[k]['gen_source']='参考项目'
    return k
JSTAT={'matched':0,'new':0,'flag':0}
for e in json.load(open(JD+'edges.json'))['edges']:
    if '口盟' in (e.get('note') or ''): continue
    a,b=jkey(e['from']),jkey(e['to'])
    if not a or not b or a==b: continue
    srcs=[jsrc.get(x) for x in e.get('sources',[]) if jsrc.get(x)]
    k=('master_disciple',a,b)
    note=e.get('note')
    if k in rels:
        JSTAT['matched']+=1
        r=rels[k]
        if JREPO not in r['sources']: r['sources'].append(JREPO)
        if e.get('disputed'):
            JSTAT['flag']+=1
            r['confidence']='disputed'
            r['notes'].append('参考项目 jammyfu/xiangsheng-genealogy 标为存疑'+('：'+note if note else ''))
        elif note: r['notes'].append('参考项目注：'+note)
    else:
        JSTAT['new']+=1
        r=rel('master_disciple',a,b,'',None,'disputed' if e.get('disputed') else 'documented','据参考项目 jammyfu/xiangsheng-genealogy 补入'+('：'+note if note else ''))
        for x in srcs+[JREPO]:
            if x not in r['sources']: r['sources'].append(x)
for pid,d in jp.items():
    k=jkey(pid)
    if k and d.get('notes'):
        for n_ in d['notes']: person(k,note='参考项目注：'+cc.convert(n_))
    if k and d.get('birthYear') and not people[k]['birth']: people[k]['birth']=d['birthYear']
    if k and d.get('deathYear') and not people[k]['death']: people[k]['death']=d['deathYear']
print('jammyfu',JSTAT)

# merge same-name nodes sharing a master
def merge(a,b):
    for k in list(rels):
        r=rels.pop(k)
        if r['from']==b: r['from']=a
        if r['to']==b: r['to']=a
        nk=(r['type'],r['from'],r['to'],r['detail']) if r['type']=='other' else ((r['type'],r['from'],r['to']) if r['type']=='master_disciple' else (r['type'],)+tuple(sorted([r['from'],r['to']])))
        if nk in rels:
            for s_ in r['sources']:
                if s_ not in rels[nk]['sources']: rels[nk]['sources'].append(s_)
        else: rels[nk]=r
    pa,pb=people[a],people.pop(b); order.remove(b)
    for f in ('aliases','notes','sources'):
        for v in pb[f]:
            if v not in pa[f]: pa[f].append(v)
    for f in ('wiki','birth','death'):
        pa[f]=pa[f] or pb[f]
from collections import defaultdict
for k in list(order):
    if k not in people: continue
    n=norm(people[k]['name'])
    hosts=[x for x in order if x!=k and x in people and n in [norm(re.sub(r'（.*?）','',a)) for a in people[x]['aliases']]]
    if len(hosts)==1 and people[k].get('role','performer')=='performer': merge(hosts[0],k)
again=True
while again:
    again=False
    nm=defaultdict(list)
    for k in order: nm[people[k]['name']].append(k)
    for n,ks in nm.items():
        if len(ks)<2: continue
        ms={k:{r['from'] for r in rels.values() if r['type']=='master_disciple' and r['to']==k} for k in ks}
        for i in range(len(ks)):
            for j in range(i+1,len(ks)):
                if ms[ks[i]]&ms[ks[j]]:
                    merge(ks[i],ks[j]); again=True; break
            if again: break
        if again: break

# generation inference
changed=True
while changed:
    changed=False
    for r in rels.values():
        if r['type']!='master_disciple': continue
        a,b=people[r['from']],people[r['to']]
        if b['generation'] is None and a['generation']:
            b['generation']=a['generation']+1; b['gen_source']='按师承推定'; changed=True
        elif a['generation'] is None and b['generation']:
            a['generation']=b['generation']-1; a['gen_source']='按师承推定'; changed=True
# ids
for i,k in enumerate(order): people[k]['id']='p%04d'%(i+1)
idof={k:people[k]['id'] for k in order}
outP=[]
for k in order:
    p=people[k]
    if p['generation'] in ZIBEI: p['zibei']=ZIBEI[p['generation']]
    p['wiki_url']=wurl(p['wiki']) if p.get('wiki') else None
    p.setdefault('role','performer')
    p['sources']=p['sources'] or [SRC_L]
    p.pop("key")
    outP.append(p)
outR=[]
for i,r in enumerate(rels.values()):
    r['id']='r%05d'%(i+1); r['from']=idof[r['from']]; r['to']=idof[r['to']]
    outR.append(r)
json.dump(outP,open('site/data/people.json','w'),ensure_ascii=False,indent=0)
json.dump(outR,open('site/data/relations.json','w'),ensure_ascii=False,indent=0)
from collections import Counter
print(len(outP),Counter(r['type'] for r in outR),Counter(r['confidence'] for r in outR))
print(Counter(p['generation'] for p in outP))
