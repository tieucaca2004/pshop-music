// SECURITY S-01/S-02 — chạy functions/routes/registration.js THẬT với
// firebase-admin trỏ Auth + Database Emulator (không mock handler).
// Cần emulator auth(9099)+database(9000) đang chạy, project pshop-music, có
// user editor@test.local / admin@test.local (mật khẩu Test12345!) và roles
// tương ứng (xem tests/e2e/README.md). Chạy: node tests/registration-security.test.js

process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000';
process.env.GCLOUD_PROJECT='pshop-music';
const F=require('path').join(__dirname,'..','functions')+'/';
const rq=require('module').createRequire(F+'index.js');const admin=rq('firebase-admin');
admin.initializeApp({projectId:'pshop-music',databaseURL:'http://127.0.0.1:9000?ns=pshop-music-default-rtdb'});
const {getDatabase,ServerValue}=rq('firebase-admin/database');admin.database=getDatabase;admin.database.ServerValue=ServerValue;admin.auth=rq('firebase-admin/auth').getAuth;
const { handle }=require(F+'routes/registration.js');
const MW=require(F+'shared/middleware.js'); // HTTP status thật theo hợp đồng sendError
const H={Authorization:'Bearer owner'};
function call(path, body, headers){ return new Promise(async r=>{ const res={}; const helpers={sendSuccess:(x,d,o)=>r({ok:true,status:(o&&o.status)||200,data:d}),sendError:(x,c,m)=>{ let st; MW.sendError({status(v){st=v;return this;},json(){return this;}},c,m); r({ok:false,code:c,msg:m,http:st}); }};
  const req={__pshPath:path,method:'POST',body,get:k=>(headers||{})[k]||(headers||{})[k.toLowerCase()]}; try{ const out=await handle(req,res,helpers); if(out===false||out===undefined) r({unhandled:true}); }catch(e){ r({threw:e.message}); } }); }
async function idToken(email,pw){ const j=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})}).then(r=>r.json()); return j.idToken; }
(async()=>{ const out=[]; const R=(n,pass,info)=>out.push((pass?'PASS ':'FAIL ')+n+(info?' | '+info:''));
 const email='test_sec_'+Date.now()+'@test.local';
 const reg=await call('/v1/register',{email,password:'Test12345!',displayName:'TEST_BUSINESS_SEC'+Date.now()});
 const uid=reg.data&&reg.data.uid; console.log('register:',reg.ok,reg.code||'',reg.msg||'');
 const role=uid?(await admin.database().ref('roles/'+uid).once('value')).val():null;
 R('S-01 đăng ký KHÔNG tạo roles/<uid> admin', !(role&&role.role==='admin'), 'roles/<uid>.role='+(role&&role.role));
 if(uid){ const tok=await idToken(email,'Test12345!');
   // Thử ghi dữ liệu CMS được bảo vệ bằng quyền của tài khoản vừa đăng ký (qua REST + Rules thật)
   const w=await fetch('http://127.0.0.1:9000/products/TEST_SEC.json?ns=pshop-music-default-rtdb&auth='+tok,{method:'PUT',body:JSON.stringify({name:'TEST_SEC'})});
   R('S-01 tài khoản mới đăng ký KHÔNG ghi được products', w.status!==200, 'HTTP '+w.status);
   await fetch('http://127.0.0.1:9000/products/TEST_SEC.json?ns=pshop-music-default-rtdb',{method:'DELETE',headers:H});
   const claims=(await admin.auth().getUser(uid)).customClaims; R('S-01 tenant vẫn có claim business_admin', !!(claims&&claims.roles&&claims.roles.business_admin&&claims.businessId), JSON.stringify(Object.keys(claims||{})));
 }
 // S-02
 const victim=await admin.auth().createUser({email:'test_victim_'+Date.now()+'@test.local',password:'Test12345!',emailVerified:false});
 let v=await call('/v1/register/verify-email',{uid:victim.uid});
 R('S-02 không token → bị từ chối (HTTP 401)', !v.ok && v.http===401 && (await admin.auth().getUser(victim.uid)).emailVerified===false, JSON.stringify(v).slice(0,80));
 const editorTok=await idToken('editor@test.local','Test12345!');
 v=await call('/v1/register/verify-email',{uid:victim.uid},{Authorization:'Bearer '+editorTok});
 R('S-02 user thường (editor) xác thực email người khác → bị từ chối (HTTP 403)', !v.ok && v.http===403 && (await admin.auth().getUser(victim.uid)).emailVerified===false, JSON.stringify(v).slice(0,80));
 v=await call('/v1/register/verify-email',{uid:victim.uid},{Authorization:'Bearer garbage'});
 R('S-02 token giả → bị từ chối (HTTP 401)', !v.ok && v.http===401, JSON.stringify(v).slice(0,80));
 v=await call('/v1/register/verify-email',{},{});
 R('S-02 request thiếu uid → lỗi', !v.ok, v.code);
 // super_admin hợp lệ vẫn dùng được
 await admin.database().ref('superAdmins/uid_admin').set({role:'super_admin',email:'admin@test.local'});
 const saTok=await idToken('admin@test.local','Test12345!');
 v=await call('/v1/register/verify-email',{uid:victim.uid},{Authorization:'Bearer '+saTok});
 R('S-02 super_admin → được phép', v.ok && (await admin.auth().getUser(victim.uid)).emailVerified===true, JSON.stringify(v).slice(0,80));
 v=await call('/v1/register/verify-email',{uid:'khong_ton_tai'},{Authorization:'Bearer '+saTok});
 R('S-02 super_admin + uid không tồn tại → NOT_FOUND (HTTP 404)', !v.ok && v.http===404, v.code);
 await admin.database().ref('superAdmins/uid_admin').remove(); await admin.auth().deleteUser(victim.uid);
 out.forEach(x=>console.log(x)); const f=out.filter(x=>x.startsWith('FAIL')).length; console.log(f?'registration-security: FAILED ('+f+')':'registration-security: OK'); process.exit(f?1:0); })();
