const AU='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/', DB='http://127.0.0.1:9000/', NS='.json?ns=pshop-music-default-rtdb';
const tok=async e=>(await fetch(AU+'accounts:signInWithPassword?key=x',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:'Test12345!',returnSecureToken:true})}).then(r=>r.json())).idToken;
const O={Authorization:'Bearer owner'};
const req=(m,p,t,b)=>fetch(DB+p+NS+(t?'&auth='+t:''),{method:m,body:b===undefined?undefined:JSON.stringify(b)}).then(r=>r.status);
(async()=>{ const R=(n,p,i)=>console.log((p?'PASS ':'FAIL ')+n+' | '+i);
 const [ad,ed,no,ta]=await Promise.all(['admin','editor','norole','test_user_a'].map(u=>tok(u+'@test.local')));
 let s;
 s=await req('GET','roles',no); R('S-04 user KHÔNG role đọc toàn bộ roles → DENY',s===401,'HTTP '+s);
 s=await req('GET','roles',ta); R('S-04 tenant user đọc toàn bộ roles → DENY',s===401,'HTTP '+s);
 s=await req('GET','roles',ed); R('S-04 editor đọc toàn bộ roles → DENY',s===401,'HTTP '+s);
 s=await req('GET','roles/uid_admin',ed); R('S-04 editor đọc role người khác → DENY',s===401,'HTTP '+s);
 s=await req('GET','roles/uid_editor',ed); R('S-04 editor đọc role CỦA MÌNH → ALLOW',s===200,'HTTP '+s);
 s=await req('GET','roles/uid_norole',no); R('S-04 user không role đọc roles/<mình> → ALLOW (trả null)',s===200,'HTTP '+s);
 s=await req('GET','roles',ad); R('S-04 admin đọc toàn bộ roles (trang Users) → ALLOW',s===200,'HTTP '+s);
 s=await req('GET','roles',null); R('S-04 chưa đăng nhập đọc roles (đã có admin) → DENY',s===401,'HTTP '+s);
 const snap=await fetch(DB+'siteContent'+NS,{headers:O}).then(r=>r.json());
 for (const k of ['menu','footer','settings']) { s=await req('PUT','siteContent/'+k+'/__TEST',ed,'x'); R('S-06 editor ghi siteContent/'+k+' → DENY',s===401,'HTTP '+s); }
 s=await req('PUT','siteContent',ed,{hacked:true}); R('S-06 editor ghi đè TOÀN BỘ siteContent → DENY',s===401,'HTTP '+s);
 for (const k of ['heroSlides','categoryTiles','mediaAssets']) { s=await req('PUT','siteContent/'+k+'/__TEST',ed,'x'); R('S-06 editor ghi siteContent/'+k+' (trang editor dùng) → ALLOW',s===200,'HTTP '+s); }
 s=await req('PUT','siteContent/menu/__TEST',ad,'x'); R('S-06 admin ghi siteContent/menu → ALLOW',s===200,'HTTP '+s);
 s=await req('PUT','siteContent/heroSlides/__TEST',null,'x'); R('S-06 chưa đăng nhập ghi siteContent → DENY',s===401,'HTTP '+s);
 s=await req('GET','siteContent',null); R('siteContent public đọc được → ALLOW',s===200,'HTTP '+s);
 await fetch(DB+'siteContent'+NS,{method:'PUT',headers:O,body:JSON.stringify(snap)});
})();
