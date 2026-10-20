import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('real PostgreSQL policies isolate two users and reject anonymous access and ownership changes',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('10000000-0000-4000-8000-0000000000a1'),('10000000-0000-4000-8000-0000000000b2');`);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a='10000000-0000-4000-8000-0000000000a1',b='10000000-0000-4000-8000-0000000000b2';
  const asUser=async id=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
  const patch=[{media_type:'movie',tmdb_id:1,item:{id:1,type:'movie',title:'A private title'},state:{watchlisted:true,rating:5}}];
  await asUser(a);await db.query('select public.sync_library_entries($1::jsonb)',[JSON.stringify(patch.map(x=>({...x,expected_user:a})))]);
  assert.equal((await db.query('select * from public.library_entries')).rows.length,1);
  await asUser(b);assert.equal((await db.query('select * from public.library_entries')).rows.length,0);
  assert.equal((await db.query('update public.library_entries set state=$1::jsonb where user_id=$2 returning *',['{}',a])).rows.length,0);
  await assert.rejects(db.query('insert into public.library_entries(user_id,media_type,tmdb_id) values ($1,$2,$3)',[a,'movie',2]),/row.level security/i);
  await assert.rejects(db.query('select public.sync_library_entries($1::jsonb)',[JSON.stringify(patch.map(x=>({...x,expected_user:a})))]),/Account changed/);
  await db.query('select public.sync_library_entries($1::jsonb)',[JSON.stringify(patch.map(x=>({...x,expected_user:b})))]);
  assert.equal((await db.query('select user_id from public.library_entries')).rows[0].user_id,b);
  await assert.rejects(db.query('update public.library_entries set user_id=$1 where user_id=$2',[a,b]),/row.level security/i);
  await assert.rejects(db.exec('truncate public.library_entries'),/permission denied/);
  await assert.rejects(db.exec('delete from public.library_entries'),/permission denied/);
  await asUser(a);await db.query('select public.sync_library_entries($1::jsonb)',[JSON.stringify([{...patch[0],expected_user:a,state:{watchlisted:false,dismissed:true}}])]);
  assert.deepEqual((await db.query('select state from public.library_entries')).rows[0].state,{watchlisted:false,rating:5,dismissed:true});
  await assert.rejects(db.query('select public.sync_library_entries($1::jsonb)',[JSON.stringify([{...patch[0],expected_user:a,state:{rating:9}}])]),/valid_state/);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.exec('select * from public.library_entries'),/permission denied/);
  await assert.rejects(db.query('select public.sync_library_entries($1::jsonb)',[JSON.stringify(patch.map(x=>({...x,expected_user:a})))]),/permission denied/);
 }finally{await db.close();}
});
