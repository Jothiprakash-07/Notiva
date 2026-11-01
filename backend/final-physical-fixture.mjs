import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import User from './models/user.js';
import Session from './models/Session.js';
import { createAccessToken } from './services/accessToken.js';
dotenv.config({quiet:true});
await mongoose.connect(process.env.MONGO_URI);
try {
 const user = await User.findById('6adf3a52d0c8a6d4a7dc37ba');
 const session = await Session.findOne({userId:user._id,revokedAt:null});
 assert.ok(session && +session.expiresAt > Date.now());
 // Reuse the active device session; do not replace credentials or alter membership directly.
 const token = createAccessToken(user, session.sessionId);
 const api = async(method,path,body,expected=200) => {
  const r=await fetch('http://127.0.0.1:5000/api/organizations'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await r.json(); assert.equal(r.status,expected,JSON.stringify(value)); return value;
 };
 const file='../.build-tools/final-physical-fixture.json';
 let state;
 if(fs.existsSync(file)) state=JSON.parse(fs.readFileSync(file));
 else {
  const org=(await api('POST','',{name:'FINAL Vivo Validation 2026-10-26'},201)).organization;
  state={organizationId:org.id,accountId:String(user._id),items:[]};
  fs.writeFileSync(file,JSON.stringify(state,null,2));
 }
 const root='/'+state.organizationId;
 if(process.argv[2]==='alarms') {
  const at=new Date(Math.ceil((Date.now()+180000)/60000)*60000).toISOString();
  for(const [index,type] of ['reminder','task','event'].entries()) {
   const result=await api('POST',root+'/shared-items',{type,title:`FINAL Vivo ${type}`,clientRequestId:`final-vivo-${type}-${at}`,schedule:{startAt:at,preAlertMinutes:1,...(type==='event'?{endAt:new Date(Date.parse(at)+3600000).toISOString()}:{})},targets:[{targetType:'organization'}],...(type==='task'?{completionMode:'collective',collectiveRule:'any'}:{}),...(index===0?{recurrence:{repeat:'daily',timeZone:'Asia/Kolkata'}}:{})},201);
   state.items.push({id:result.item.id,type,startAt:at});
  }
  fs.writeFileSync(file,JSON.stringify(state,null,2));
 }
 console.log(JSON.stringify(state));
} finally { await mongoose.disconnect(); }
