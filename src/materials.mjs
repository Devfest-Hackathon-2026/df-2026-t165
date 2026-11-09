// 町の資料（PDF・写真）の保存。説明は Firestore、ファイル本体は Cloud Storage。
// どちらも未設定のときは TSUGITE_DATA_DIR 配下のローカルファイルに保存する（開発・デモ用）。
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const MAX_BYTES=20*1024*1024;
export const TYPES={'application/pdf':'PDF資料','image/jpeg':'写真','image/png':'写真','image/webp':'写真','video/mp4':'動画','video/quicktime':'動画','video/webm':'動画'};
const VISIBILITY=['town','keepers','public'];
export const placeKey=p=>String(p||'').normalize('NFKC').replace(/\s/g,'').slice(0,80);
const str=(v,n)=>String(v??'').trim().slice(0,n);

// 中身が申告どおりの形式か、先頭のバイトで確かめる（拡張子や content-type の偽装を防ぐ）
export function sniff(bytes){
 const b=bytes.subarray(0,12),ascii=(s,e)=>String.fromCharCode(...b.subarray(s,e));
 if(ascii(0,5)==='%PDF-')return 'application/pdf';
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
 if(b[0]===0x89&&ascii(1,4)==='PNG')return 'image/png';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
 if(ascii(4,8)==='ftyp')return ascii(8,12)==='qt  '?'video/quicktime':'video/mp4';
 if(b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return 'video/webm';
 return null;
}

/** 受け取った説明を検証して、保存する形にそろえる。不正なら Error を投げる */
export function materialRecord(meta,{name,type,size},owner){
 if(!meta||typeof meta!=='object')throw Error('資料の説明を確認してください');
 const place=str(meta.place,80),title=str(meta.title,120);
 if(!placeKey(place))throw Error('町の名前を入れてください');
 if(!title)throw Error('資料の名前を入れてください');
 if(meta.consent!==true)throw Error('残してよいかの確認が必要です');
 if(!TYPES[type])throw Error('PDF、写真（JPEG・PNG・WebP）、動画（MP4・MOV・WebM）のファイルを選んでください');
 if(!(size>0)||size>MAX_BYTES)throw Error('1ファイル20MBまでです');
 return {
  id:randomUUID(),place,placeKey:placeKey(place),kind:TYPES[type],type,name:str(name,200)||'file',size,title,
  era:str(meta.era,60),source:str(meta.source,120),description:str(meta.description,1000),
  visibility:VISIBILITY.includes(meta.visibility)?meta.visibility:'town',
  addedBy:str(meta.addedBy,100)||'地域の方',addedAt:new Date().toISOString(),owner
 };
}
/** 画面に返す形（登録した作業領域のIDは出さず、自分の資料かどうかだけ返す） */
export const publicRecord=(r,who)=>{const {owner,placeKey:_k,...rest}=r;return {...rest,mine:Boolean(who&&owner===who),server:true}};

export function createMaterialStore({db=null,bucket=null,dataRoot}){
 const dir=path.join(dataRoot,'materials'),indexFile=path.join(dir,'index.json'),fileOf=id=>path.join(dir,'files',id);
 let chain=Promise.resolve();
 const locked=fn=>(chain=chain.then(fn,fn));
 async function readIndex(){try{return JSON.parse(await readFile(indexFile,'utf8'))}catch(e){if(e.code==='ENOENT')return [];throw e}}
 async function writeIndex(list){await mkdir(dir,{recursive:true});const t=indexFile+'.'+randomUUID()+'.tmp';await writeFile(t,JSON.stringify(list),'utf8');await rename(t,indexFile)}
 const col=()=>db.collection('tsugite_materials');
 return {
  mode:{meta:db?'firestore':'local-file',files:bucket?'cloud-storage':'local-file'},
  async list(place){
   const key=placeKey(place);let rows;
   if(db)rows=(await col().where('placeKey','==',key).get()).docs.map(d=>d.data());
   else rows=(await readIndex()).filter(r=>r.placeKey===key);
   return rows.sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt))).slice(0,100);
  },
  async get(id){
   if(!/^[a-f0-9-]{36}$/.test(id||''))return null;
   if(db){const d=await col().doc(id).get();return d.exists?d.data():null}
   return (await readIndex()).find(r=>r.id===id)||null;
  },
  async put(record,bytes){
   if(bucket)await bucket.file('materials/'+record.id).save(bytes,{contentType:record.type,resumable:false,metadata:{cacheControl:'private, max-age=0'}});
   else{await mkdir(path.dirname(fileOf(record.id)),{recursive:true});await writeFile(fileOf(record.id),bytes)}
   if(db)await col().doc(record.id).set(record);
   else await locked(async()=>{const list=await readIndex();list.push(record);await writeIndex(list)});
   return record;
  },
  async file(record){
   if(bucket){const [buf]=await bucket.file('materials/'+record.id).download();return buf}
   return readFile(fileOf(record.id));
  },
  async remove(record){
   if(db)await col().doc(record.id).delete();
   else await locked(async()=>{await writeIndex((await readIndex()).filter(r=>r.id!==record.id))});
   if(bucket)await bucket.file('materials/'+record.id).delete({ignoreNotFound:true});
   else await rm(fileOf(record.id),{force:true});
  }
 };
}
