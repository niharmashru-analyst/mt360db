import csv, random, math, os
random.seed(7)
CATS={'Skincare':['Moisturizer','Serum','Cleanser','Sunscreen'],'Makeup':['Foundation','Lipstick','Mascara','Eyeliner'],'Haircare':['Shampoo','Conditioner','Hair Oil'],'Fragrance':['EDP','EDT','Body Mist'],'Bath & Body':['Body Lotion','Body Wash','Hand Cream']}
BR=['Lumina','Verde','Blush & Co','Northline']
CH=[('Shoppers Stop','Department Store',1.0),('Nykaa Luxe','MBO',1.3),('Reliance Beauty','Department Store',0.9),('Sephora','MBO',1.1),('Renee EBO','EBO',0.8),('Airport Retail Co','Airport',0.6)]
REG={'North':{'Delhi':['New Delhi'],'Punjab':['Chandigarh','Ludhiana'],'UP':['Lucknow','Noida']},'West':{'Maharashtra':['Mumbai','Pune'],'Gujarat':['Ahmedabad','Surat']},'South':{'Karnataka':['Bangalore','Mysore'],'Tamil Nadu':['Chennai','Coimbatore'],'Telangana':['Hyderabad']},'East':{'West Bengal':['Kolkata'],'Odisha':['Bhubaneswar']}}
BGR={'North':'BGR North','West':'BGR West','South':'BGR South','East':'BGR East'}
stores=[];n=1
for cn,ct,w in CH:
    for i in range(random.randint(8,11)):
        rg=random.choice(list(REG));st=random.choice(list(REG[rg]));ci=random.choice(REG[rg][st])
        stores.append(dict(code=f'OUT{n:04d}',name=f'{cn} - {ci} {i+1}',chain=cn,type=ct,city=ci,state=st,region=rg,w=w*random.uniform(.5,1.8),trend=random.uniform(-.45,.3)));n+=1
skus=[];k=1
for c,subs in CATS.items():
    for s in subs:
        for i in range(random.randint(2,3)):
            r=random.random();par='Top 10' if r<.12 else 'Top 25' if r<.35 else 'Others'
            b=random.choice(BR)
            skus.append(dict(code=f'SKU{k:04d}',name=f'{b} {s} {chr(65+i)}',brand=b,cat=c,sub=s,mrp=round(random.uniform(199,2499)/10)*10-1,par=par,
              vel={'Top 10':random.uniform(9,20),'Top 25':random.uniform(3,9),'Others':random.uniform(.5,3)}[par],
              status=random.choices(['Active','Inactive','Delisted'],[.9,.07,.03])[0],trend=random.uniform(-.5,.35),peak=random.randint(0,11)));k+=1
listed={(s['code'],k['code']):(random.random()<{'Top 10':.92,'Top 25':.75,'Others':.5}[k['par']] and k['status']!='Delisted') for s in stores for k in skus}
months=[(2025+(3+i)//12,(3+i)%12+1) for i in range(18)]  # 2025-04 .. 2026-09
os.makedirs('data',exist_ok=True)
H=['Month','Outlet Code','Outlet Name','Chain Name','Chain Type','City','State','Region','SKU Code','SKU','Brand','Category','Sub Category','Pareto','Status','MRP','OP Stock','CL Stock','Stock Qty','Tertiary Qty','Target Value','BGR','Order Qty','Filled Qty','Fill Rate %','Margin %']
MG={'Skincare':45,'Makeup':50,'Haircare':35,'Fragrance':55,'Bath & Body':40}
rows_total=0
prev={}
for mi,(y,m) in enumerate(months):
    f=open(f'data/{y}-{m:02d}.csv','w',newline='');w=csv.writer(f);w.writerow(H)
    for s in stores:
        for k in skus:
            if not listed[(s['code'],k['code'])]: continue
            seas=1+.3*math.cos((m-11)/12*2*math.pi)+(.15 if k['peak']==m-1 else 0)
            g=1+(s["trend"]+k["trend"])*mi/17
            mu=k['vel']*s['w']*seas*max(g,.3)*random.lognormvariate(0,.25)
            if random.random()<.015: mu*=random.choice([.1,3.5])  # anomalies
            q=max(0,int(mu))
            op=prev.get((s['code'],k['code']),int(mu*random.uniform(1,3)))
            od=int(mu*random.uniform(.8,2.0))+random.randint(0,4)
            ful=int(od*random.choice([1,1,.95,.9,.8,.7])) if od else 0
            r=random.random()
            cl=0 if r<.07 else int(max(0,op+ful-q)) if r>.1 else int(q*random.uniform(5,9))
            prev[(s['code'],k['code'])]=cl
            tgt=round(q*k['mrp']*random.uniform(.85,1.2)*1.05)
            w.writerow([f'{y}-{m:02d}',s['code'],s['name'],s['chain'],s['type'],s['city'],s['state'],s['region'],k['code'],k['name'],k['brand'],k['cat'],k['sub'],k['par'],k['status'],k['mrp'],op,cl,'',q,tgt,BGR[s['region']],od,ful,'',MG[k['cat']]+random.randint(-3,3)])
            rows_total+=1
    f.close()
print(len(stores),'stores',len(skus),'skus',rows_total,'rows')
