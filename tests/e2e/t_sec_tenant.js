const { launch, newPage, BASE } = require('./cms');
const AU='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/', DB='http://127.0.0.1:9000/', NS='?ns=pshop-music-default-rtdb';
const O={Authorization:'Bearer owner','Content-Type':'application/json'};
async function mk(uid,email,bid){ await fetch(AU+'projects/pshop-music/accounts',{method:'POST',headers:O,body:JSON.stringify({localId:uid,email,password:'Test12345!',emailVerified:true})});
 await fetch(AU+'projects/pshop-music/accounts:update',{method:'POST',headers:O,body:JSON.stringify({localId:uid,customAttributes:JSON.stringify({businessId:bid,roles:{business_admin:true}})})}); }
const tok=async e=>(await fetch(AU+'accounts:signInWithPassword?key=x',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:'Test12345!',returnSecureToken:true})}).then(r=>r.json())).idToken;
(async()=>{ const R=(n,p,i)=>console.log((p?'PASS ':'FAIL ')+n+(i?' | '+i:''));
 await mk('TEST_USER_A','test_user_a@test.local','TEST_BUSINESS_A'); await mk('TEST_USER_B','test_user_b@test.local','TEST_BUSINESS_B');
 for (const [b,u] of [['TEST_BUSINESS_A','TEST_USER_A'],['TEST_BUSINESS_B','TEST_USER_B']])
  await fetch(DB+'businesses/'+b+'.json'+NS,{method:'PUT',headers:O,body:JSON.stringify({info:{businessId:b,displayName:b,ownerUid:u},users:{[u]:{role:'business_admin'}},orders:{o1:{total:1,note:'SECRET_'+b}},products:{p1:{name:'SECRET_'+b}}})});
 const ta=await tok('test_user_a@test.local');
 for (const p of ['info','orders','users/TEST_USER_A','customers']) { const own=await fetch(DB+'businesses/TEST_BUSINESS_A/'+p+'.json'+NS+'&auth='+ta); const other=await fetch(DB+'businesses/TEST_BUSINESS_B/'+p.replace('TEST_USER_A','TEST_USER_B')+'.json'+NS+'&auth='+ta);
   R('A đọc '+p+' của A (ALLOW) / của B (DENY)', own.status===200 && other.status===401, own.status+'/'+other.status); }
 const wr=await fetch(DB+'businesses/TEST_BUSINESS_B/products/x.json'+NS+'&auth='+ta,{method:'PUT',body:'{"name":"hack"}'}); R('A ghi products của B → DENY', wr.status===401, 'HTTP '+wr.status);
 const pub=await fetch(DB+'businesses/TEST_BUSINESS_B/products.json'+NS); R('products B đọc công khai (Rules .read:true — thiết kế storefront)', pub.status===200, 'HTTP '+pub.status);
 const b=await launch(); const {page,log}=await newPage(b); let fired=false; page.on('dialog',()=>{fired=true;});
 await page.goto(BASE+'/platform/login/'); await page.waitForTimeout(2500);
 await page.evaluate(()=>firebase.auth().signInWithEmailAndPassword('test_user_a@test.local','Test12345!')); await page.waitForTimeout(1500);
 await page.goto(BASE+'/platform/workspace/dashboard.html?bid=TEST_BUSINESS_B'); await page.waitForTimeout(6000);
 const body=await page.evaluate(()=>document.body.innerText);
 R('A mở dashboard?bid=B → KHÔNG thấy dữ liệu B', !body.includes('SECRET_TEST_BUSINESS_B'), 'hiển thị nhãn: '+JSON.stringify(await page.$eval('#wsBid',e=>e.textContent)));
 const payload=encodeURIComponent('x"><img src=x onerror="alert(document.domain)">');
 await page.goto(BASE+'/platform/workspace/dashboard.html?bid='+payload); await page.waitForTimeout(4000);
 const injected=await page.$$eval('#wsNav img',a=>a.length);
 for (const pg of ['layout']) { await page.goto(BASE+'/platform/workspace/'+pg+'.html?bid='+payload); await page.waitForTimeout(3000); R(pg+'.html: bid chứa HTML KHÔNG chèn vào trang', !fired && (await page.$$eval('#wsNav img',a=>a.length))===0); }
 R('bid chứa HTML KHÔNG được chèn vào trang (XSS)', !fired && injected===0, 'alert='+fired+' img injected='+injected);
 const ls=await page.evaluate(()=>localStorage.getItem('psh_bid')); R('bid độc KHÔNG lưu vào localStorage', !(ls||'').includes('<'), JSON.stringify(ls));
 await page.evaluate(()=>localStorage.removeItem('psh_bid'));
 await page.goto(BASE+'/platform/workspace/dashboard.html?bid=TEST_BUSINESS_A'); await page.waitForTimeout(4000);
 R('bid hợp lệ vẫn hoạt động (nav có link ?bid=TEST_BUSINESS_A)', await page.$$eval('#wsNav a',a=>a.length>0&&a.every(x=>x.href.endsWith('bid=TEST_BUSINESS_A'))));
 console.log('errors',JSON.stringify(log.errors)); await b.close(); })();
