import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanHistory,cleanServices} from '../core.js';
import {authMessage} from '../auth-messages.js';
test('history validates identities, bounds payloads, keeps newest 20 and deduplicates batches',()=>{
 const batches=Array.from({length:25},(_,i)=>({id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),createdAt:new Date(2026,0,i+1).toISOString(),picks:[{id:i+1,type:'movie',title:'<script>data</script>',reason:'x'.repeat(1000)}]}));
 const result=cleanHistory([...batches,batches[24],{id:'fake',picks:[]}]);assert.equal(result.length,20);assert.equal(result[0].picks[0].id,25);assert.equal(result[0].picks[0].reason.length,500);assert.equal(result[0].picks[0].title,'<script>data</script>');
 assert.deepEqual(cleanServices(['netflix','netflix','bad','all']),['netflix']);assert.equal(cleanServices(undefined),null);
});
test('auth failures explain confirmation, delivery restrictions and expired links honestly',()=>{
 assert.match(authMessage({code:'email_not_confirmed'}),/Resend confirmation/);
 assert.match(authMessage({code:'email_address_not_authorized'}),/not yet configured/);
 assert.match(authMessage({code:'over_email_send_rate_limit'}),/Wait/);
 assert.match(authMessage({code:'otp_expired'}),/fresh link/);
 assert.equal(authMessage({code:'invalid_credentials'}),'The email or password is incorrect.');
});
